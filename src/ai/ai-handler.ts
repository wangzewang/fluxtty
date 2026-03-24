import { sessionManager } from '../session/SessionManager';
import type { WaterfallArea } from '../waterfall/WaterfallArea';
import { planExecutor } from './plan-executor';
import { llmClient, type LLMMessage } from './llm-client';
import { configContext } from '../config/ConfigContext';

// Will be set after WaterfallArea is created
let waterfallArea: WaterfallArea | null = null;

export function setWaterfallArea(area: WaterfallArea) {
  waterfallArea = area;
}

// ---------------------------------------------------------------------------
// Workspace context system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const panes = sessionManager.getAllPanes();
  const activeId = sessionManager.getActivePaneId();

  const sessionLines = panes.map(p => {
    const active = p.id === activeId ? ' ← active' : '';
    const agent = p.agent_type !== 'none' ? ` (${p.agent_type})` : '';
    return `  ${p.id}. ${p.name} [${p.group}] ${p.status}${agent}  cwd: ${p.cwd}${active}`;
  }).join('\n') || '  (no sessions)';

  return `You are the Workspace AI for FluXTTY, a multi-session developer terminal.
Your role is to manage terminal sessions — naming, grouping, dispatching commands.
Do NOT write code. Do NOT answer general programming questions.

Current sessions:
${sessionLines}

To execute a workspace action, include a fenced action block in your response:

\`\`\`action
{"type": "run", "cmd": "npm test", "target": "frontend"}
\`\`\`

Available action types:
• run       – run a command in one session  → {"type":"run","cmd":"...","target":"<name or id>"}
• broadcast – run in ALL sessions (confirm) → {"type":"broadcast","cmd":"..."}
• new       – create a session              → {"type":"new","name":"...","group":"..."}
• rename    – rename a session              → {"type":"rename","target":"...","name":"..."}
• close     – close a session               → {"type":"close","target":"..."} or "idle"
• split     – split current row             → {"type":"split"}

Rules:
- For broadcast or multiple sequential actions, list each action block and I will confirm before executing.
- For a single targeted action, execute immediately without asking.
- Keep responses short and direct.`;
}

// ---------------------------------------------------------------------------
// Action block parsing
// ---------------------------------------------------------------------------

interface ParsedAction {
  type: string;
  [key: string]: unknown;
}

function extractActions(text: string): { actions: ParsedAction[]; cleanText: string } {
  const actions: ParsedAction[] = [];
  // Match ```action ... ``` blocks
  const cleanText = text.replace(/```action\s*\n([\s\S]*?)```/g, (_match, json) => {
    try {
      const obj = JSON.parse(json.trim());
      if (obj && typeof obj.type === 'string') actions.push(obj);
    } catch {
      // malformed — skip
    }
    return '';
  }).trim();

  return { actions, cleanText };
}

// ---------------------------------------------------------------------------
// Regex-based intent parser (fallback when model = none)
// ---------------------------------------------------------------------------

interface ParsedIntent {
  type: string;
  [key: string]: unknown;
}

function parseIntent(input: string): ParsedIntent | null {
  const s = input.trim();

  const runIn = s.match(/^run\s+(.+?)\s+in\s+(.+)$/i);
  if (runIn) return { type: 'run', cmd: runIn[1], target: runIn[2] };

  const runAll = s.match(/^(.+?)\s+in\s+all(\s+sessions?)?$/i);
  if (runAll) return { type: 'broadcast', cmd: runAll[1] };

  const sequential = s.match(/^run\s+(.+?)\s+then\s+run\s+(.+?)\s+in\s+(.+)$/i);
  if (sequential) return { type: 'sequential', cmds: [sequential[1], sequential[2]], target: sequential[3] };

  const newIn = s.match(/^new\s+(\S+)\s+in\s+(.+)$/i);
  if (newIn) return { type: 'new', name: newIn[1], group: newIn[2] };

  const newS = s.match(/^new(\s+(\S+))?$/i);
  if (newS) return { type: 'new', name: newS[2] || null, group: null };

  const rename = s.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
  if (rename) return { type: 'rename', target: rename[1], name: rename[2] };

  const close = s.match(/^close\s+(.+)$/i);
  if (close) return { type: 'close', target: close[1] };

  if (/^split$/i.test(s)) return { type: 'split' };
  if (/^(list|status)$/i.test(s)) return { type: 'list' };
  if (/^help$/i.test(s)) return { type: 'help' };

  const agent = s.match(/^!agent\s+(\S+)$/i);
  if (agent) return { type: 'set-agent', agentType: agent[1] };

  return null;
}

// ---------------------------------------------------------------------------
// Pane lookup
// ---------------------------------------------------------------------------

function findPane(target: string) {
  const panes = sessionManager.getAllPanes();
  const t = target.toLowerCase();
  return panes.find(p =>
    p.name.toLowerCase() === t ||
    p.id === parseInt(t)
  ) || panes.find(p =>
    p.name.toLowerCase().includes(t)
  );
}

// ---------------------------------------------------------------------------
// Shared action executor (used by both LLM and regex paths)
// ---------------------------------------------------------------------------

async function executeAction(action: ParsedAction): Promise<string> {
  switch (action.type) {
    case 'run': {
      const pane = findPane(action.target as string);
      if (!pane) return `Session "${action.target}" not found.`;
      const tp = waterfallArea?.getPane(pane.id);
      if (!tp) return `Pane "${action.target}" not available.`;
      await tp.writeCommand(action.cmd as string);
      waterfallArea?.scrollToPane(pane.id);
      return `Ran "${action.cmd}" in ${pane.name}`;
    }

    case 'broadcast': {
      const panes = sessionManager.getAllPanes();
      const plan = panes.map(p => ({ paneId: p.id, cmd: action.cmd as string, paneName: p.name }));
      planExecutor.setPlan(plan, `Run "${action.cmd}" in all ${panes.length} sessions`);
      return planExecutor.getPlanPreview();
    }

    case 'sequential': {
      const pane = findPane(action.target as string);
      if (!pane) return `Session "${action.target}" not found.`;
      const cmds = action.cmds as string[];
      const plan = cmds.map(cmd => ({ paneId: pane.id, cmd, paneName: pane.name }));
      planExecutor.setPlan(plan, `Run ${cmds.length} commands in ${pane.name}`);
      return planExecutor.getPlanPreview();
    }

    case 'new': {
      if (!waterfallArea) return 'Waterfall not ready.';
      const pane = await waterfallArea.spawnPane({ newRow: true, group: (action.group as string) || 'default' });
      if (pane && action.name) {
        await sessionManager.renamePane(pane.paneId, action.name as string);
      }
      return pane
        ? `Created new session${action.name ? ` "${action.name}"` : ''}`
        : 'Failed to create session.';
    }

    case 'rename': {
      const pane = findPane(action.target as string);
      if (!pane) return `Session "${action.target}" not found.`;
      await sessionManager.renamePane(pane.id, action.name as string);
      return `Renamed ${pane.name} → ${action.name}`;
    }

    case 'close': {
      const target = (action.target as string).toLowerCase();
      if (target === 'idle') {
        const idle = sessionManager.getAllPanes().filter(p => p.status === 'idle');
        for (const p of idle) {
          const tp = waterfallArea?.getPane(p.id);
          if (tp) await tp.destroy();
        }
        return `Closed ${idle.length} idle session(s).`;
      }
      const pane = findPane(action.target as string);
      if (!pane) return `Session "${action.target}" not found.`;
      const tp = waterfallArea?.getPane(pane.id);
      if (tp) {
        await tp.destroy();
        return `Closed ${pane.name}.`;
      }
      return 'Pane not available.';
    }

    case 'split': {
      if (!waterfallArea) return 'Waterfall not ready.';
      waterfallArea.splitCurrentRow();
      return 'Split current row.';
    }

    default:
      return `Unknown action type: ${action.type}`;
  }
}

// ---------------------------------------------------------------------------
// Main AI handler
// ---------------------------------------------------------------------------

class AIHandler {
  async handle(input: string): Promise<string> {
    const cfg = configContext.get();
    const model = cfg.workspace_ai.model;

    // ── LLM path ──────────────────────────────────────────────────────
    if (model && model !== 'none') {
      try {
        const messages: LLMMessage[] = [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: input },
        ];
        const raw = await llmClient.complete(messages, cfg);
        const { actions, cleanText } = extractActions(raw);

        if (actions.length === 0) {
          // Pure text response — just show it
          return raw;
        }

        if (actions.length === 1 && actions[0].type !== 'broadcast') {
          // Single non-broadcast action: execute immediately
          const result = await executeAction(actions[0]);
          return cleanText ? `${cleanText}\n${result}` : result;
        }

        // Multiple actions or broadcast: build a plan and ask for confirmation
        const steps = actions
          .filter(a => a.type === 'run' || a.type === 'broadcast')
          .flatMap(a => {
            if (a.type === 'broadcast') {
              return sessionManager.getAllPanes().map(p => ({
                paneId: p.id,
                cmd: a.cmd as string,
                paneName: p.name,
              }));
            }
            const pane = findPane(a.target as string);
            return pane ? [{ paneId: pane.id, cmd: a.cmd as string, paneName: pane.name }] : [];
          });
        if (steps.length > 0) {
          planExecutor.setPlan(steps, `Execute ${actions.length} action(s)`);
          return (cleanText ? cleanText + '\n\n' : '') + planExecutor.getPlanPreview();
        }
        return cleanText || raw;

      } catch (err) {
        return `AI error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // ── Regex intent parser (model: none) ─────────────────────────────
    const intent = parseIntent(input);
    if (!intent) {
      return 'Unknown command. Type "help" for available commands, or configure workspace_ai.model to enable natural language.';
    }

    switch (intent.type) {
      case 'list': {
        const panes = sessionManager.getAllPanes();
        if (panes.length === 0) return 'No sessions.';
        return panes.map(p =>
          `  ${p.id}. ${p.name} [${p.group}] ${p.status}${p.agent_type !== 'none' ? ` (${p.agent_type})` : ''}`
        ).join('\n');
      }

      case 'set-agent': {
        const activeId = sessionManager.getActivePaneId();
        if (activeId == null) return 'No active session.';
        await sessionManager.setPaneAgent(activeId, intent.agentType as never);
        return `Set active session agent to "${intent.agentType}".`;
      }

      case 'help':
        return [
          'Built-in commands (model: none):',
          '  run <cmd> in <session>',
          '  <cmd> in all sessions',
          '  run X then run Y in <session>',
          '  new [name] [in <group>]',
          '  rename <session> to <name>',
          '  close <session> | close idle',
          '  split',
          '  list | status',
          '  !agent <claude|codex|aider|none>',
          '',
          'Set workspace_ai.model in config to enable natural language (Claude, GPT, Gemini, Ollama…)',
        ].join('\n');

      default:
        return executeAction(intent as ParsedAction);
    }
  }
}

export const aiHandler = new AIHandler();
