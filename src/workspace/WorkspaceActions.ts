import { planExecutor } from '../ai/plan-executor';
import { getPaneContext } from './WorkspaceState';
import { waitForCommandComplete } from './waitForCommand';
import { waitForAgentTurn } from './waitForAgentTurn';
import { isDestructiveCommand } from './destructiveCommandGuard';
import { configContext } from '../config/ConfigContext';
import type { PaneInfo, AgentType, SessionStatus, PaneOwner } from '../session/types';

/** A single action within a pipeline step. */
export interface PipelineStepAction {
  target: string;
  cmd: string;
  timeout_ms?: number;
}

/**
 * One step in a pipeline. All actions within a step run in parallel by default
 * (parallel: false runs them sequentially). The optional condition gates entry:
 *
 *   'always'        – always run this step (default)
 *   'prev-success'  – only run if every action in the previous step exited 0
 *   'prev-fail'     – only run if any action in the previous step exited non-0
 */
export interface PipelineStep {
  label?: string;
  parallel?: boolean;
  condition?: 'always' | 'prev-success' | 'prev-fail';
  actions: PipelineStepAction[];
}

export type WorkspaceAction =
  | { type: 'run'; target: string; cmd: string }
  | { type: 'run-await'; target: string; cmd: string; timeout_ms?: number }
  | { type: 'read'; target: string }
  | { type: 'pipeline'; label?: string; steps: PipelineStep[] }
  | { type: 'broadcast'; cmd: string }
  | { type: 'run-group'; group: string; cmd: string }
  | { type: 'sequential'; target: string; cmds: string[] }
  | { type: 'new'; name?: string | null; group?: string | null }
  | { type: 'rename'; target: string; name: string }
  | { type: 'close'; target: string }
  | { type: 'close-group'; group: string }
  | { type: 'split' }
  | { type: 'focus'; target: string }
  | { type: 'group'; target: string; group: string }
  | { type: 'note'; target: string; text: string }
  | { type: 'clear'; target: string }
  | { type: 'kill'; target: string }
  | { type: 'write'; target: string; data: string }
  | { type: 'paste'; target: string; data: string }
  | { type: 'set-agent'; target: string; agentType: AgentType }
  | { type: 'agent-send'; target: string; message: string; timeout_ms?: number }
  | { type: 'agent-await-ready'; target: string; timeout_ms?: number };

export type WorkspaceActionSource = 'keyboard' | 'ui' | 'ai' | 'system';

export interface WorkspaceActionResult {
  ok: boolean;
  message: string;
  action: WorkspaceAction;
  error?: string;
}

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  source: WorkspaceActionSource;
  action: WorkspaceAction;
  result?: WorkspaceActionResult;
}

export interface SessionPort {
  getAllPanes(): PaneInfo[];
  getPane(id: number): PaneInfo | undefined;
  getActivePaneId(): number | null;
  getActivePane(): PaneInfo | undefined;
  setActivePane(id: number): Promise<void>;
  renamePane(id: number, name: string, nameSource?: 'auto' | 'manual'): Promise<void>;
  setPaneGroup(id: number, group: string): Promise<void>;
  setPaneAgent(id: number, agentType: AgentType): Promise<void>;
  setPaneStatus(id: number, status: SessionStatus): Promise<void>;
  setPaneNote(id: number, note: string): Promise<void>;
}

export interface TerminalRuntimePort {
  write(paneId: number, data: string, origin?: 'human' | 'ai'): Promise<void>;
}

export interface SpawnPaneOptions {
  newRow: boolean;
  group?: string;
  cwd?: string;
  tmuxSession?: string | null;
  targetRow?: number;
  afterPaneId?: number;
  owner?: PaneOwner;
}

export interface PaneRef {
  paneId: number;
}

export interface WorkspaceLayoutPort {
  spawnPane(opts: SpawnPaneOptions): Promise<PaneRef | null>;
  splitCurrentRow(): void | Promise<void>;
  closePane(paneId: number): Promise<void>;
}

export interface WorkspaceViewportPort {
  scrollToPane(paneId: number): void;
}

export interface ActionLogPort {
  log(entry: ActionLogEntry): void;
}

export interface WorkspaceActionPorts {
  session: SessionPort;
  terminal: TerminalRuntimePort;
  layout: WorkspaceLayoutPort;
  viewport: WorkspaceViewportPort;
  log?: ActionLogPort;
}

interface DispatchOptions {
  source?: WorkspaceActionSource;
}

const CONFIRMABLE_TYPES = new Set<WorkspaceAction['type']>(['broadcast', 'run-group', 'close-group', 'sequential', 'pipeline']);
const ACTION_LOG_LIMIT = 200;

class WorkspaceActions {
  private ports: WorkspaceActionPorts | null = null;
  private logEntries: ActionLogEntry[] = [];
  private nextLogId = 1;

  configure(ports: WorkspaceActionPorts) {
    this.ports = ports;
  }

  getLog(): ActionLogEntry[] {
    return [...this.logEntries];
  }

  actionDescription(action: WorkspaceAction): string {
    switch (action.type) {
      case 'run':
        return `run "${action.cmd}" in ${action.target}`;
      case 'run-await':
        return `run "${action.cmd}" in ${action.target} (await completion)`;
      case 'read':
        return `read output from "${action.target}"`;
      case 'pipeline': {
        const stepList = action.steps
          .map((s, i) => {
            const acts = s.actions.map(a => `${a.target}: ${a.cmd}`).join(', ');
            const cond = s.condition && s.condition !== 'always' ? ` [if ${s.condition}]` : '';
            const par = s.parallel === false ? ' [sequential]' : '';
            return `  ${i + 1}. ${s.label ? `${s.label}: ` : ''}${acts}${cond}${par}`;
          })
          .join('\n');
        return `${action.label ?? 'Pipeline'} (${action.steps.length} steps):\n${stepList}`;
      }
      case 'broadcast':
        return `run "${action.cmd}" in all sessions`;
      case 'run-group':
        return `run "${action.cmd}" in group "${action.group}"`;
      case 'sequential':
        return `run ${action.cmds.length} commands in ${action.target}`;
      case 'new':
        return `create new session${action.name ? ` "${action.name}"` : ''}${action.group ? ` in group "${action.group}"` : ''}`;
      case 'rename':
        return `rename "${action.target}" -> "${action.name}"`;
      case 'close':
        return action.target.toLowerCase() === 'idle' ? 'close all idle sessions' : `close session "${action.target}"`;
      case 'close-group':
        return `close all sessions in group "${action.group}"`;
      case 'split':
        return 'split current row';
      case 'focus':
        return `focus "${action.target}"`;
      case 'group':
        return `move "${action.target}" to group "${action.group}"`;
      case 'note':
        return `set note on "${action.target}": ${action.text}`;
      case 'clear':
        return `clear terminal output of "${action.target}"`;
      case 'kill':
        return `send Ctrl+C to "${action.target}"`;
      case 'write':
      case 'paste':
        return `write to "${action.target}"`;
      case 'set-agent':
        return `set "${action.target}" agent to ${action.agentType}`;
      case 'agent-send': {
        const preview = action.message.length > 60
          ? action.message.slice(0, 60) + '…'
          : action.message;
        return `send to agent in "${action.target}": ${preview}`;
      }
      case 'agent-await-ready':
        return `wait for agent in "${action.target}" to be ready`;
    }
  }

  isConfirmable(action: WorkspaceAction): boolean {
    if (!CONFIRMABLE_TYPES.has(action.type)) return false;
    if (action.type === 'broadcast' || action.type === 'run-group') {
      return configContext.get().workspace_ai.always_confirm_broadcast !== false;
    }
    return configContext.get().workspace_ai.always_confirm_multi_step !== false;
  }

  /** The hard, non-config-gated destructive-command safety net (see destructiveCommandGuard.ts). */
  private isDestructive(action: WorkspaceAction): boolean {
    switch (action.type) {
      case 'run':
      case 'run-await':
        return isDestructiveCommand(action.cmd);
      case 'write':
      case 'paste':
        return isDestructiveCommand(action.data);
      case 'agent-send':
        return isDestructiveCommand(action.message);
      default:
        return false;
    }
  }

  /** Run a single, already-concrete leaf action for the first time: if it's
   *  destructive, queue it for confirmation instead of running it (regardless
   *  of source or of always_confirm_*); otherwise run it immediately. Must
   *  NOT be called from the post-confirmation execution path (dispatchConfirmed
   *  / dispatchManyConfirmed) — those call executeAction() directly so a
   *  destructive action, once confirmed, actually runs instead of being
   *  re-queued forever. */
  private async dispatchLeaf(action: WorkspaceAction, source: WorkspaceActionSource): Promise<WorkspaceActionResult> {
    if (this.isDestructive(action)) {
      const preview = await this.queueActionBatch(`Confirm destructive command: ${this.actionDescription(action)}`, [action], { source });
      return { ok: true, message: preview, action };
    }
    // Closing a specific AI-owned pane a human has typed into needs explicit
    // confirmation, even though 'close' is otherwise immediate. The bulk
    // "close idle" target is handled separately inside executeAction() since
    // it isn't a single findPane() target.
    if (action.type === 'close' && action.target.toLowerCase() !== 'idle') {
      const pane = this.findPane(action.target);
      if (pane && pane.owner === 'ai' && pane.human_touched) {
        const preview = await this.queueActionBatch(
          `Confirm closing "${pane.name}" — you typed into it while the AI was working on it`,
          [action],
          { source },
        );
        return { ok: true, message: preview, action };
      }
    }
    return this.executeAction(action, source);
  }

  async dispatch(action: WorkspaceAction, options: DispatchOptions = {}): Promise<WorkspaceActionResult> {
    const source = options.source ?? 'ui';
    return this.recordAction(source, action, () => (
      this.isConfirmable(action)
        ? this.queueConfirmable(action, source)
        : this.dispatchLeaf(action, source)
    ));
  }

  private async dispatchConfirmed(action: WorkspaceAction, source: WorkspaceActionSource): Promise<WorkspaceActionResult> {
    return this.recordAction(source, action, () => this.executeAction(action, source));
  }

  private async recordAction(
    source: WorkspaceActionSource,
    action: WorkspaceAction,
    run: () => Promise<WorkspaceActionResult>,
  ): Promise<WorkspaceActionResult> {
    const entry = this.createLogEntry(source, action);
    try {
      const result = await run();
      entry.result = result;
      this.finishLogEntry(entry);
      return result;
    } catch (error) {
      const result: WorkspaceActionResult = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        action,
        error: error instanceof Error ? error.message : String(error),
      };
      entry.result = result;
      this.finishLogEntry(entry);
      return result;
    }
  }

  async queueActionBatch(
    title: string,
    actions: WorkspaceAction[],
    options: DispatchOptions = {},
  ): Promise<string> {
    const source = options.source ?? 'ui';
    const preview = actions.map(action => `  ${this.actionDescription(action)}`).join('\n');
    planExecutor.enqueue({
      id: this.nextId('plan'),
      title,
      preview,
      actions,
      execute: async () => this.dispatchManyConfirmed(actions, source),
    });
    return planExecutor.getPlanPreview();
  }

  findPane(target: string): PaneInfo | undefined {
    const ports = this.requirePorts();
    const panes = ports.session.getAllPanes();
    const normalizedTarget = target.trim().toLowerCase();
    if (!normalizedTarget) return undefined;
    const numericTarget = Number.parseInt(normalizedTarget, 10);
    return panes.find(pane =>
      pane.name.toLowerCase() === normalizedTarget ||
      (Number.isFinite(numericTarget) && pane.id === numericTarget)
    ) || panes.find(pane => pane.name.toLowerCase().includes(normalizedTarget));
  }

  private async queueConfirmable(action: WorkspaceAction, source: WorkspaceActionSource): Promise<WorkspaceActionResult> {
    const actions = action.type === 'pipeline' ? [action] : this.expandConfirmableAction(action);
    if (actions.length === 0) {
      return { ok: false, message: `No sessions matched ${this.actionDescription(action)}.`, action };
    }
    const title = this.actionDescription(action);
    const preview = await this.queueActionBatch(title, actions, { source });
    return { ok: true, message: preview, action };
  }

  private expandConfirmableAction(action: WorkspaceAction): WorkspaceAction[] {
    const ports = this.requirePorts();
    switch (action.type) {
      case 'broadcast':
        return ports.session.getAllPanes().map(pane => ({ type: 'run', target: String(pane.id), cmd: action.cmd }));
      case 'run-group': {
        const group = action.group.toLowerCase();
        return ports.session.getAllPanes()
          .filter(pane => pane.group.toLowerCase() === group)
          .map(pane => ({ type: 'run', target: String(pane.id), cmd: action.cmd }));
      }
      case 'close-group': {
        const group = action.group.toLowerCase();
        return ports.session.getAllPanes()
          .filter(pane => pane.group.toLowerCase() === group)
          .map(pane => ({ type: 'close', target: String(pane.id) }));
      }
      case 'sequential': {
        const pane = this.findPane(action.target);
        if (!pane) return [];
        return action.cmds.map(cmd => ({ type: 'run-await', target: String(pane.id), cmd }));
      }
      default:
        return [];
    }
  }

  private async dispatchManyConfirmed(actions: WorkspaceAction[], source: WorkspaceActionSource): Promise<WorkspaceActionResult[]> {
    const results: WorkspaceActionResult[] = [];
    for (const action of actions) {
      results.push(await this.dispatchConfirmed(action, source));
      await delay(300);
    }
    return results;
  }

  /** Like dispatchManyConfirmed, but for leaf actions that were expanded from
   *  a compound action (broadcast/run-group/close-group/sequential) whose
   *  confirmation was skipped at the top level (always_confirm_* disabled) —
   *  so, unlike dispatchManyConfirmed, each leaf still gets the destructive
   *  check via dispatchLeaf. Not used for pipeline: its steps carry
   *  prev-success/prev-fail result-chaining semantics that a "queued, not yet
   *  run" destructive result would corrupt, so pipeline relies solely on its
   *  own top-level confirmation preview (which already lists every command). */
  private async dispatchManyGuarded(actions: WorkspaceAction[], source: WorkspaceActionSource): Promise<WorkspaceActionResult[]> {
    const results: WorkspaceActionResult[] = [];
    for (const action of actions) {
      results.push(await this.recordAction(source, action, () => this.dispatchLeaf(action, source)));
      await delay(300);
    }
    return results;
  }

  private async executeAction(action: WorkspaceAction, source: WorkspaceActionSource): Promise<WorkspaceActionResult> {
    const ports = this.requirePorts();
    const origin: 'human' | 'ai' = source === 'ui' || source === 'keyboard' ? 'human' : 'ai';

    switch (action.type) {
      case 'run': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.terminal.write(pane.id, `${action.cmd}\r`, origin);
        ports.viewport.scrollToPane(pane.id);
        return this.ok(action, `Ran "${action.cmd}" in ${pane.name}.`);
      }

      case 'run-await': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        const commandDone = waitForCommandComplete(pane.id, action.timeout_ms ?? 60_000);
        try {
          await ports.terminal.write(pane.id, `${action.cmd}\r`, origin);
        } catch (err) {
          commandDone.catch(() => {});
          return this.fail(action, err instanceof Error ? err.message : String(err));
        }
        ports.viewport.scrollToPane(pane.id);
        try {
          const result = await commandDone;
          const ok = result.exitCode === 0;
          return {
            ok,
            message: `${pane.name}: exit ${result.exitCode}`,
            action,
            ...(ok ? {} : { error: `Command exited with code ${result.exitCode}` }),
          };
        } catch (err) {
          return this.fail(action, err instanceof Error ? err.message : 'Timeout');
        }
      }

      case 'read': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        const ctx = await getPaneContext(pane.id);
        if (!ctx) return this.fail(action, `Could not read context for "${pane.name}".`);
        const lines = ctx.recent_output.join('\n');
        const exitInfo = pane.last_exit_code != null ? `\nExit code: ${pane.last_exit_code}` : '';
        const lastCmd = pane.last_command ? `\nLast command: ${pane.last_command}` : '';
        return this.ok(action, `${pane.name}:${lastCmd}${exitInfo}\n${lines}`);
      }

      case 'pipeline': {
        const stepSummaries: string[] = [];
        let prevResults: WorkspaceActionResult[] = [];

        for (const step of action.steps) {
          if (prevResults.length > 0) {
            if (step.condition === 'prev-success' && prevResults.some(r => !r.ok)) {
              stepSummaries.push(`Stopped before "${step.label ?? 'next step'}" — previous step failed`);
              break;
            }
            if (step.condition === 'prev-fail' && prevResults.every(r => r.ok)) {
              stepSummaries.push(`Skipped "${step.label ?? 'next step'}" — previous step succeeded`);
              break;
            }
          }

          const stepActions = step.actions.map(a => ({
            type: 'run-await' as const,
            target: a.target,
            cmd: a.cmd,
            timeout_ms: a.timeout_ms,
          }));

          const stepResults: WorkspaceActionResult[] = [];
          if (step.parallel !== false) {
            stepResults.push(...await Promise.all(stepActions.map(a => this.executeAction(a, source))));
          } else {
            for (const a of stepActions) {
              stepResults.push(await this.executeAction(a, source));
            }
          }
          prevResults = stepResults;

          const stepMsg = stepResults.map(r => r.message).join(', ');
          stepSummaries.push(step.label ? `${step.label}: ${stepMsg}` : stepMsg);
        }

        return this.ok(action, stepSummaries.join('\n') || 'Pipeline complete.');
      }

      case 'new': {
        const owner: PaneOwner = source === 'ai' ? 'ai' : 'user';
        const pane = await ports.layout.spawnPane({ newRow: true, group: action.group ?? undefined, owner });
        if (!pane) return this.fail(action, 'Failed to create session.');
        if (action.name) await ports.session.renamePane(pane.paneId, action.name, 'manual');
        if (action.group) await ports.session.setPaneGroup(pane.paneId, action.group);
        return this.ok(action, `Created new session${action.name ? ` "${action.name}"` : ''}.`);
      }

      case 'rename': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.session.renamePane(pane.id, action.name, 'manual');
        return this.ok(action, `Renamed ${pane.name} -> ${action.name}.`);
      }

      case 'close': {
        if (action.target.toLowerCase() === 'idle') {
          const idle = ports.session.getAllPanes().filter(pane => pane.status === 'idle');
          const safe = idle.filter(p => !(p.owner === 'ai' && p.human_touched));
          const needsConfirm = idle.filter(p => p.owner === 'ai' && p.human_touched);
          for (const pane of safe) await ports.layout.closePane(pane.id);
          if (needsConfirm.length > 0) {
            const confirmActions: WorkspaceAction[] = needsConfirm.map(p => ({ type: 'close', target: String(p.id) }));
            await this.queueActionBatch(
              `Confirm closing ${needsConfirm.length} pane(s) you typed into while the AI was working`,
              confirmActions,
              { source },
            );
          }
          const confirmNote = needsConfirm.length > 0 ? `, ${needsConfirm.length} awaiting confirmation` : '';
          return this.ok(action, `Closed ${safe.length} idle session(s)${confirmNote}.`);
        }
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.layout.closePane(pane.id);
        return this.ok(action, `Closed ${pane.name}.`);
      }

      case 'split':
        await ports.layout.splitCurrentRow();
        return this.ok(action, 'Split current row.');

      case 'focus': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.session.setActivePane(pane.id);
        ports.viewport.scrollToPane(pane.id);
        return this.ok(action, `Focused ${pane.name}.`);
      }

      case 'group': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.session.setPaneGroup(pane.id, action.group);
        return this.ok(action, `Moved ${pane.name} to group "${action.group}".`);
      }

      case 'note': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.session.setPaneNote(pane.id, action.text);
        return this.ok(action, `Set note on ${pane.name}.`);
      }

      case 'clear': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.terminal.write(pane.id, 'clear\r', origin);
        return this.ok(action, `Cleared ${pane.name}.`);
      }

      case 'kill': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.terminal.write(pane.id, '\x03', origin);
        return this.ok(action, `Sent Ctrl+C to ${pane.name}.`);
      }

      case 'write':
      case 'paste': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.terminal.write(pane.id, action.data, origin);
        return this.ok(action, `Wrote to ${pane.name}.`);
      }

      case 'set-agent': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        await ports.session.setPaneAgent(pane.id, action.agentType);
        return this.ok(action, `Set ${pane.name} agent to "${action.agentType}".`);
      }

      case 'agent-send': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        if (pane.agent_type === 'none') {
          return this.fail(action, `No agent running in "${pane.name}". Use "run" for shell commands or mark the pane with !agent.`);
        }

        // Start listening before writing so we don't miss the first bytes of output.
        const turnDone = waitForAgentTurn(pane.id, pane.agent_type, action.timeout_ms ?? 120_000);
        try {
          await ports.terminal.write(pane.id, `${action.message}\r`, origin);
        } catch (err) {
          turnDone.catch(() => {});
          return this.fail(action, err instanceof Error ? err.message : String(err));
        }
        ports.viewport.scrollToPane(pane.id);

        let turnOutput = '';
        try {
          turnOutput = await turnDone;
        } catch (err) {
          return this.fail(action, err instanceof Error ? err.message : 'Agent timeout');
        }

        const lines = turnOutput
          .split('\n')
          .map(line => line.trimEnd())
          .filter(line => line.trim() && line.trim() !== action.message.trim());

        const fallbackCtx = lines.length === 0 ? await getPaneContext(pane.id) : null;
        const outputLines = lines.length > 0 ? lines : fallbackCtx?.recent_output ?? [];
        const relevant = outputLines.slice(-30);
        const response = relevant.join('\n');
        const truncNote = outputLines.length > 30 ? `\n… (${outputLines.length - 30} earlier lines omitted — use "read" for full output)` : '';
        return this.ok(action, response + truncNote);
      }

      case 'agent-await-ready': {
        const pane = this.findPane(action.target);
        if (!pane) return this.fail(action, `Session "${action.target}" not found.`);
        // Deliberately does NOT require pane.agent_type to already be set: this is
        // called right after "run"-launching an agent, and "run" is fire-and-forget
        // — it returns before the launched process has printed anything, so
        // AgentDetector normally hasn't classified the pane yet. Requiring
        // agent_type != 'none' here would make this action fail every time it's
        // actually needed. Pass whatever agent_type is known now (possibly 'none');
        // waitForAgentTurn falls back to a silence-based heuristic when it doesn't
        // recognize the type, which is exactly the "still booting" case.
        try {
          await waitForAgentTurn(pane.id, pane.agent_type, action.timeout_ms ?? 60_000);
        } catch (err) {
          return this.fail(action, err instanceof Error ? err.message : 'Timed out waiting for agent to start.');
        }
        // Re-read the pane: AgentDetector should have classified it from the same
        // output stream we just watched, so agent_type is normally populated by now.
        const settled = this.findPane(action.target);
        return this.ok(action, `${pane.name}'s agent is ready.${settled && settled.agent_type === 'none' ? ` (its type wasn't auto-recognized — use set-agent on "${pane.name}" first, then agent-send will work)` : ''}`);
      }

      case 'broadcast':
      case 'run-group':
      case 'close-group':
      case 'sequential': {
        const actions = this.expandConfirmableAction(action);
        if (actions.length === 0) {
          return this.fail(action, `No sessions matched ${this.actionDescription(action)}.`);
        }
        // Reached only when this compound action's own confirmation was
        // skipped (always_confirm_* disabled) — expandConfirmableAction's
        // output was never individually shown to the user, so each leaf still
        // needs its own destructive-command check. Compare dispatchManyConfirmed,
        // used when the leaves were already listed in a prior confirmation preview.
        const results = await this.dispatchManyGuarded(actions, source);
        const ok = results.every(result => result.ok);
        const message = results.map(result => result.message).join('\n');
        return ok
          ? this.ok(action, message)
          : this.fail(action, message || `Failed to execute ${this.actionDescription(action)}.`);
      }
    }
  }

  private requirePorts(): WorkspaceActionPorts {
    if (!this.ports) throw new Error('Workspace actions are not configured.');
    return this.ports;
  }

  private ok(action: WorkspaceAction, message: string): WorkspaceActionResult {
    return { ok: true, message, action };
  }

  private fail(action: WorkspaceAction, message: string): WorkspaceActionResult {
    return { ok: false, message, action, error: message };
  }

  private createLogEntry(source: WorkspaceActionSource, action: WorkspaceAction): ActionLogEntry {
    return {
      id: this.nextId('action'),
      timestamp: Date.now(),
      source,
      action,
    };
  }

  private finishLogEntry(entry: ActionLogEntry) {
    if (entry.action.type !== 'write' && entry.action.type !== 'paste') {
      this.logEntries.push(entry);
      if (this.logEntries.length > ACTION_LOG_LIMIT) this.logEntries.shift();
      this.ports?.log?.log(entry);
    }
  }

  private nextId(prefix: string): string {
    return `${prefix}-${this.nextLogId++}`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function actionDescription(action: WorkspaceAction): string {
  return workspaceActions.actionDescription(action);
}

export const workspaceActions = new WorkspaceActions();
