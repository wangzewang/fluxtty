# fluxtty — Codebase Instructions

## What This Is

A multi-session developer workspace terminal for programmers running many concurrent tasks
(multiple `claude` sessions, dev servers, test runners, database shells, etc.).

**Not** a general-purpose terminal. The Workspace AI manages the *workspace* — session
naming, grouping, dispatch — and, since the autonomous-pane-control feature (see
"Workspace AI interaction model" below and `PaneInfo.owner`), it can also autonomously
open a pane, decide what runs in it (a shell command, a coding agent CLI, or any other
terminal tool), delegate a task, and close it again once done. Everything it does
happens in a visible pane — nothing runs hidden, and a hard-coded safety net (see
"Destructive Command Guard") still forces human confirmation for genuinely destructive
commands and for closing a pane a human has touched, no matter how autonomous the rest
of the system is. What runs inside each shell is otherwise entirely the programmer's
choice.

---

## Core Design Decisions (do not reverse without strong reason)

### 1. Terminal area is primary, everything else is overlay
- Terminals fill 100% of screen by default
- Session Sidebar (Ctrl+B or `b` in Normal mode) is hidden by default
- Input Bar is always visible at the bottom
- When sidebar toggled, it compresses terminal space — never owns it permanently

### 2. Waterfall layout
- Row height adapts: when few rows, divide height equally; when many rows, each row = full viewport height (waterfall paging)
- Threshold: rows below `28px header + 18 lines × font-line-height` collapse into waterfall scroll mode
- Rows stack downward; horizontal splits live within a row
- Row height recalculates on viewport resize and on sidebar toggle

### 3. Session identity is first-class
Every pane has: `name`, `group`, `note`, `status` (idle/running/error), `cwd`, `tmux_session`,
`last_command`, `last_exit_code`, `alternate_screen` — see the `PaneInfo` interface below.
- Default name auto-derived from `cwd` on spawn; updates when `cwd` changes
- On significant commands (claude, vim, psql, etc.) name updates to reflect what's running
- User-renamed panes are pinned (`name_source: 'manual'`) and not auto-renamed
- Groups are free-form strings (e.g. `proj-alpha`, `infra`)
- Status drives sidebar indicators and AI context
- `last_command`/`last_exit_code` come from OSC 133 shell-integration markers (bash and zsh);
  `alternate_screen` tracks whether the pane is inside a full-screen TUI (vim, htop, an agent CLI)

### 4. Modal Input Bar — the primary interaction surface

The Input Bar sits at the bottom of the screen, always visible.
It operates in seven modes modeled after Vim's modal philosophy (`InputMode` in
`src/session/types.ts`), driven by `ModeManager` and dispatched almost entirely inside
`InputBar.ts`'s `handleKeyDown`.

#### Modes

| Mode | Input Bar Shows | Keystrokes Go To |
|---|---|---|
| **Normal** | `NORMAL` indicator, read-only hint | Workspace navigation (hjkl, gg/G, scroll) |
| **Insert** | `INSERT [row/total] [agent]` + pane prompt | Active pane's shell stdin |
| **AI** | `AI` indicator, chat-style prompt | Free-form message to Workspace AI (persists until Esc) |
| **View** | `VIEW [pane-name]` | Read-only — shows only the active row; vi scrolling only, no PTY input |
| **Terminal** | `TERMINAL [pane-name]` | Active pane's xterm (raw keyboard, xterm owns input) |
| **Pane Selector** | fuzzy overlay | Name/group/cwd fuzzy search (no default key — sidebar click only) |
| **Pane Search** | `SEARCH /` + query | Search active pane's terminal buffer (xterm SearchAddon) |

#### Mode Transitions

```
Normal  ──i────────────────────→ Insert (line editor → PTY; no-op if no active pane)
        ──v────────────────────→ View (active-row-only, read-only watch mode)
        ──a────────────────────→ AI (persistent free-form chat with Workspace AI)
        ──/────────────────────→ Pane Search (in-terminal content find)
        ──: ───────────────────→ Inline command sub-state (single-line AI command, stays in Normal)
        ──hjkl/arrows──────────→ Navigate rows/panes (no mode change)

Insert  ──Esc──────────────────→ Normal
        ──Ctrl+\────────────────→ Terminal (xterm takes raw keyboard)
        ──Enter─────────────────→ Submit line to active PTY (or send keystroke live, see live_typing)
        ──Tab───────────────────→ Shell/agent autocomplete

AI      ──Esc──────────────────→ Normal
        ──Enter─────────────────→ Submit message to Workspace AI / confirm a pending plan

View    ──v or Esc─────────────→ Normal
        ──i──────────────────────→ Insert
        ──Ctrl+\────────────────→ Terminal

Terminal ──Ctrl+\────────────────→ Normal
         (all other keys go to xterm; only Ctrl+\ is intercepted)

Pane Search   ──Enter───────────→ commit query → Normal (n/N repeat)
              ──Shift+Enter─────→ commit going backward → Normal
              ──Esc─────────────→ Normal (clears match decorations)
```

#### Normal Mode Navigation (vi-style)
- `h`/`←` `l`/`→` — focus prev/next pane in current row
- `j`/`↓` `k`/`↑` — focus next/prev row
- `w` / `W` — focus next/prev pane (alias of `l`/`h`)
- `G` — scroll active pane to bottom
- `gg` (double) — scroll active pane to top
- `Ctrl+D` / `Ctrl+U` — scroll half-page down/up
- `Ctrl+B` — scroll full page up (Normal mode currently has no bound full-page-**down**
  key; View mode adds `Ctrl+F` for that)
- `i` — enter Insert mode · `v` — enter View mode · `a` — enter AI mode
- `n` — new terminal (falls back to "repeat search forward" if a pane search is pending)
- `N` — repeat search backward (no-op if no pane search is pending)
- `s` — split current row
- `b` — toggle sidebar
- `r` — rename active pane
- `m` — open pane note editor
- Closing a pane is **not** bound to a bare Normal-mode key — it's `Cmd+W` (macOS) via
  the global `ClosePane` action, unbound by default on other platforms (add it to
  `keybindings:` to bind one). Quitting the app is `Cmd+Q` / the configured `Quit` action,
  not a Normal-mode `q`.

#### Inline Command (`:` in Normal mode)
- Pressing `:` activates a command sub-state *inside* Normal mode (no `InputMode` change)
- Input bar prompt changes to `:` — user types a single workspace-AI command or intent
- `Enter` submits to Workspace AI (or confirms a pending plan) and returns to Normal; `Esc` cancels
- For a persistent multi-turn conversation instead of one-off commands, use `a` (AI mode) instead

#### Insert Mode
- All keystrokes forwarded to the active pane's PTY
- `live_typing: true` (**default**) — each keystroke sent immediately (including backspace,
  arrows, Ctrl combos); the shell handles echo and line editing
- `live_typing: false` — buffered mode; Enter submits the whole line, ArrowUp/Down browse
  local command history
- Tab triggers shell completion (file/command) or agent slash-command completion if agent detected
- Ctrl+C sends SIGINT; Ctrl+D sends EOF

#### AI Mode (`a` in Normal mode)
- Dedicated persistent chat surface for Workspace AI, distinct from the one-shot `:` command
- Enter submits the message (or confirms a pending multi-step plan); ArrowUp/Down browse AI
  command history; Tab triggers AI-command autocompletion
- Esc returns to Normal at any time

#### View Mode (`v` in Normal mode)
- Collapses the waterfall to the active row only, for watching an agent work without risk of
  accidentally sending it input
- vi-style scrolling (`g`/`gg`, `G`, `j`/`k`, `Ctrl+D/U/F/B`) all work; `i` promotes to Insert,
  `Ctrl+\` promotes to Terminal, `v` or `Esc` returns to Normal

#### Pane Search (`/` or `Ctrl+F` / `Cmd+F`)
- `/` in Normal mode — searches content in the **active terminal pane** (xterm buffer, scrollback included)
- `Ctrl+F` / `Cmd+F` — global shortcut, opens search from any mode
- Incremental: typing jumps to the next match as you type
- Enter commits the query and returns to Normal (decorations stay); Shift+Enter commits going backwards
- In Normal mode after a commit: `n` repeats search forward, `N` backward (vim-style). `n` falls back to NewTerminal when no search is pending.
- Esc while in Pane Search clears decorations, drops the query, and returns to Normal
- Esc in Normal mode cancels an active search (clears decorations and drops the saved query so `n`/`N` no longer repeat); if no search is pending, Esc keeps its existing behavior
- Implementation: `@xterm/addon-search` loaded per `TerminalPane`; `InputBar` dispatches `pane-search` events routed by `WaterfallArea`

#### Pane Selector (fuzzy session find)
- The `PaneSelector` overlay still exists (name/group/cwd fuzzy search) but has no keyboard shortcut after `/` was repurposed for in-terminal search. Accessible via sidebar click.

#### Terminal Mode (Ctrl+\)
- xterm.js owns the keyboard completely
- `Ctrl+\` is the only intercepted key (returns to Normal)
- Pane header brightens to indicate terminal mode

#### Agent-aware Insert Mode
- When the active pane is detected as running an AI agent (claude, codex, aider, gemini,
  opencode, goose, cursor, qwen, amp, crush, openhands — see `AgentType` below),
  Insert mode shows `INSERT · <agent>` in the mode indicator
- Tab shows that agent's native slash commands for autocomplete (`AGENT_SLASH_COMMANDS`
  in `src/session/types.ts`)
- Keystrokes still go to PTY as-is — no wrapping

### 5. Workspace AI interaction model

Commands entered via `:` in Normal mode, or typed in AI mode (`a`), go to the workspace AI.
Intent parsing and regexes live in `src/ai/ai-handler.ts::parseIntent`.

| Scenario | Behavior |
|---|---|
| `run <cmd> in <session>` | Auto-execute, no confirm |
| `run <cmd> in group <group>` | Auto-execute across a group |
| `<cmd> in all sessions` | Show plan → y/n confirm → execute (broadcast) |
| `run X then run Y in Z` | Show plan → y/n confirm → execute sequentially |
| `new [name] [in <group>]` | Create new session |
| `rename <session> to <name>` | Rename session |
| `close <session>` / `close group <group>` | Close session(s) |
| `focus <session>` | Focus a session (immediate, not plan-gated) |
| `group <session> as <group>` | Reassign a session's group |
| `note <session> <text>` | Set a pane's note |
| `clear <session>` | Clear a pane's scrollback/output |
| `read <session>` | Read a pane's recent output back (immediate) |
| `kill <session>` | Force-kill a session's process |
| `split` | Split current row |
| `list` / `status` | List all sessions |
| `!agent <type\|none>` | Manually mark active pane's agent type (any `AgentType`, see below) |
| LLM model configured | Natural-language input that doesn't match a regex intent routes through the model |

**The plan-confirm step exists for any action with broad or irreversible scope.**
`WorkspaceActions.isConfirmable()` gates exactly `broadcast`/`run-group` on
`workspace_ai.always_confirm_broadcast`, and `sequential`/`pipeline`/`close-group` on
`workspace_ai.always_confirm_multi_step` (both `true` by default; flipping either to
`false` makes that action type dispatch immediately like everything else, still subject
to the two hard-gated cases below). Every other action type — `run`, `run-await`, `new`,
`agent-send`, `agent-await-ready`, `close`, `rename`, `focus`, `group`, `note`, `clear`,
`kill`, `set-agent`, `read` — dispatches immediately regardless of source (keyboard, ui,
ai): there is no separate "AI actions always get confirmed" path any more (`ai-handler.ts`
routes every parsed action through the same `workspaceActions.dispatch(action, {source:
'ai'})` used by keyboard/ui, with no `IMMEDIATE_AI_ACTION_TYPES`-style classification of
its own). Plans queue as `PendingActionBatch` entries in `src/ai/plan-executor.ts`
(a FIFO array, not a single pending-plan slot).

**Two things are never left to the AI's (or the config's) judgment — the app itself
always forces a human y/n, regardless of `source` or any confirm-related config flag:**
1. **Destructive Command Guard** (`src/workspace/destructiveCommandGuard.ts`,
   `isDestructiveCommand()`): a hard-coded pattern list (`rm -rf`, `git push --force`,
   `git reset --hard`, `dd if=`, `mkfs`, `curl|sh` piping, `DROP TABLE`, `kubectl delete`,
   `sudo rm`, raw-disk redirects, `shutdown`/`reboot`, fork bombs, etc. — biased toward
   over-flagging). Checked on the `cmd`/`data`/`message` payload of `run`/`run-await`/
   `write`/`paste`/`agent-send` before any of them reach `ports.terminal.write()`. Enforced
   in `WorkspaceActions.dispatchLeaf()` (the pre-execution gate `dispatch()` and the
   config-bypassed compound-type expansion in `executeAction()` both funnel through) —
   *not* inside `executeAction()`'s raw switch, so a destructive action, once confirmed,
   actually runs instead of being re-queued forever. `pipeline` step actions are the one
   exception: they rely solely on the pipeline's own top-level confirmation preview
   (which already lists every command) rather than a per-step guard, because a "queued,
   not yet run" result would corrupt `prev-success`/`prev-fail` result-chaining.
2. **Closing a human-touched AI-owned pane**: see "Autonomous pane control" below.

When `workspace_ai.model` is set to a real model name (not `none`), the AI handler sends
workspace context (sessions, status, cwd, `owner`/`human_touched`) plus the user's message
to the LLM, then parses `action` fenced code blocks in the response and dispatches them.
Model/provider selection is OpenCode-style: `workspace_ai.provider` is a map of provider id
→ `{ models: { ... } }` (see `src/ai/model-catalog.ts` for the built-in provider/model
catalog and `config.rs`'s `AiProviderConfig`/`AiModelConfig`/`AiModelVariantConfig`).
`api_key_env` and `base_url` at the top level are legacy fields, kept for backward
compatibility. `workspace_ai.small_model` is reserved for future lightweight summary/title
tasks. `agent_relay_auto_submit` remains dead/unwired — read nowhere in `src/ai/` or
`src/workspace/`, unrelated to any of the above.

### Autonomous pane control

The Workspace AI can create a pane, decide what runs in it, delegate work, and close it
again — with no fixed trigger phrase; the LLM decides based on the user's message
(`buildSystemPrompt()` in `ai-handler.ts` states this explicitly, since only the LLM path
can make this kind of judgment call — the regex intent parser cannot). This requires a
real `workspace_ai.model` to be meaningful; the regex fallback still creates/closes panes
mechanically on explicit commands, without the "should I proactively act" judgment.

- `PaneInfo.owner` (`'user' | 'ai'`) is set at creation time based on `WorkspaceAction
  'new'`'s dispatch `source` (`'ai'` → `owner: 'ai'`, anything else → `'user'`). Threaded
  through `WorkspaceActions.ts` (`SpawnPaneOptions.owner`) → `WaterfallArea.spawnPane()`
  → Tauri `pty_spawn`'s `SpawnPtyArgs.owner` → `SessionManager::create_pane()` (Rust,
  `session.rs`) — four files, not a single point, because the pane's canonical record is
  constructed on the Rust side.
- `PaneInfo.human_touched` starts `false` and is set (once, never cleared) the first time
  a *human* keystroke reaches an `owner: 'ai'` pane's PTY. Two structurally different
  write paths both mark it: (1) `TerminalPane.ts`'s raw xterm `onData` (Terminal mode) and
  wheel-to-arrow-key emulation, which call `pty_write` directly with `origin: 'human'`,
  bypassing `WorkspaceActions` entirely; (2) `WorkspaceActions.executeAction()`'s
  `run`/`run-await`/`clear`/`kill`/`write`/`paste`/`agent-send` cases, which derive
  `origin` from `source` (`'ui'`/`'keyboard'` → `'human'`, else `'ai'`) and pass it to
  `ports.terminal.write()`. The Rust `pty_write` command (`ipc.rs`) does the actual
  flagging via `SessionManager::mark_pane_human_touched()`, only for `origin: "human"` and
  only on `Ai`-owned panes, and emits `session:changed` if it flipped anything.
- **Close gating** (`WorkspaceActions.dispatchLeaf()`, and the `close` case's `target:
  'idle'` bulk path in `executeAction()`): a single-target `close` on an `owner: 'ai'`,
  `human_touched: true` pane is diverted into a confirmable batch instead of executing —
  same mechanism as the destructive guard, same non-recursion reasoning (the confirmed
  path calls `executeAction()` directly, never re-enters `dispatchLeaf()`). `owner: 'ai'`
  panes that are still `human_touched: false` close immediately, with no confirmation —
  this is the "AI decides autonomously, no fixed rules" behavior the ownership model
  exists for. `owner: 'user'` panes are entirely unaffected by any of this.
- `agent-await-ready` (`WorkspaceAction`, `WorkspaceActions.ts`) is a standalone call to
  `waitForAgentTurn()` with nothing written first — since that function just watches PTY
  output from the moment it's invoked and resolves on the agent's own ready-prompt
  pattern (or a silence window for unknown agent types), calling it right after `run`
  launches an agent CLI, with no message queued yet, correctly detects "finished booting."
  The system prompt instructs the model to sequence `new` → `run` (launch agent) →
  `agent-await-ready` → `agent-send` (first task) — without this step, a task sent
  immediately after launch risks landing on the agent's still-loading splash screen.
- `waitForAgentTurn()` only proves *one conversational turn ended*, not that the overall
  task is complete — there's no deterministic "task fully done" signal from a pane. The
  model has to judge task completion the same way it judges everything else here; nothing
  mechanical infers it from idle timers.
- No background loop re-invokes the AI on its own — `aiHandler.handle()` only runs once
  per user-initiated AI-mode/`:`-command turn. Close-on-completion instead piggybacks on
  whatever the *next* AI-mode turn happens to be (`buildSystemPrompt()` always lists every
  `owner: 'ai'` pane's state, and the model may emit a `close` for a finished one even if
  unrelated to what the user just asked). A true proactive background version was
  explicitly deferred — see `future-plan.md`.

### 6. Config is YAML, Alacritty-style
Config lives at `~/.config/fluxtty/config.yaml`.
All visual and behavioral properties are configurable.
Hot-reload on file save. Schema is strict with sensible defaults.

---

## Tech Stack

**Runtime:** Tauri (Rust backend) + xterm.js (WebView frontend)

- **Rust backend (src-tauri/):** PTY management, config loading/watching, session state, shell completion, IPC
- **WebView frontend (src/):** xterm.js terminal rendering, layout, input bar UI — vanilla TypeScript
- **xterm.js:** industry-standard terminal emulator (VSCode, Hyper). Handles ANSI, colors, fonts natively.
- No Electron. No heavy JS frameworks. The terminal rendering is xterm.js; UI chrome is minimal TypeScript.

**Key Rust dependencies (`src-tauri/Cargo.toml`):**
```
portable-pty          — cross-platform PTY (macOS/Linux/Windows ConPTY)
serde_yaml            — YAML config parsing
serde / serde_json    — serialization
notify                — file system watcher for config hot-reload
strip-ansi-escapes    — ANSI stripping for disk persistence
tokio                 — async runtime
tauri                 — app framework, WebView, IPC
tauri-plugin-log      — structured logging
tauri-plugin-shell    — shell/process integration (e.g. tmux discovery)
log                   — logging facade used with tauri-plugin-log
reqwest               — HTTP client for Workspace AI provider calls (rustls, no OpenSSL)
dirs                  — platform home/config dir resolution
uuid                  — unique IDs
parking_lot           — faster Mutex/RwLock
crossbeam-channel     — multi-producer PTY I/O channels
objc (macOS only)     — native macOS integration
```

**Key JS dependencies (`package.json`):**
```
@xterm/xterm           — terminal emulator widget
@xterm/addon-fit       — resize PTY to match DOM element
@xterm/addon-web-links — clickable URLs
@xterm/addon-search    — vi-mode search
@tauri-apps/api        — Tauri IPC bindings
```

---

## Project Structure

```
fluxtty/
├── CLAUDE.md
├── plan.md
├── package.json              — frontend build (Vite + TypeScript)
├── docs/                     — GitHub Pages landing site
│   └── index.html
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs           — Tauri app entry, window setup
│       ├── lib.rs            — Tauri plugin registration, state init
│       ├── pty.rs            — PTY lifecycle: spawn, resize, kill, I/O (portable-pty)
│       ├── config.rs         — YAML load/validate/watch, emit config:changed to frontend
│       ├── session.rs        — PaneInfo state, session events, layout management
│       └── ipc.rs            — Tauri commands + events (frontend ↔ backend)
├── src/
│   ├── main.ts               — Entry point
│   ├── app.ts                — Root: layout orchestration, mode manager init, header
│   ├── style.css             — Global CSS (CSS custom properties for theming)
│   ├── transport.ts          — Tauri IPC/event transport interface (testable seam)
│   ├── waterfall/
│   │   ├── WaterfallArea.ts  — Scrollable container, row height calculation, pane spawn
│   │   └── TerminalPane.ts   — xterm.js instance + pane chrome (header, status, note)
│   ├── sidebar/
│   │   └── SessionSidebar.ts — Grouped session tree, status dots, click-to-navigate
│   ├── input/
│   │   ├── InputBar.ts        — Bottom bar component, mode-aware rendering, all key handling
│   │   ├── ModeManager.ts     — Mode state machine (7 InputMode variants, see below)
│   │   ├── modeRenderPolicy.ts — Small pure helpers for mode-dependent input-bar rendering
│   │   ├── shellLineEditing.ts — Buffered-mode line-editing state (cursor, word-move, etc.)
│   │   ├── PaneSelector.ts    — Fuzzy finder overlay for pane selection
│   │   └── AgentDetector.ts   — Detect agent type from PTY output (12 AgentType values)
│   ├── ai/
│   │   ├── ai-handler.ts     — Intent parsing, action execution, LLM response parsing
│   │   ├── llm-client.ts     — Multi-provider LLM client (Anthropic/OpenAI/Google/Ollama/claude-cli)
│   │   ├── plan-executor.ts  — Multi-step plan confirmation queue, sequential execution
│   │   └── model-catalog.ts  — Built-in provider/model/variant catalog (OpenCode-style)
│   ├── session/
│   │   ├── SessionManager.ts   — Source of truth for all PaneInfo, emits change events
│   │   ├── SessionObserver.ts  — Watches pane state (cwd, agent, alt-screen) and applies naming policy
│   │   ├── AutoNamer.ts        — Auto-name panes from cwd and significant commands
│   │   ├── PaneNamingPolicy.ts — Pure rules for when/how a pane may be auto-renamed
│   │   └── types.ts            — PaneInfo, SessionStatus, AgentType, InputMode types
│   ├── workspace/
│   │   ├── WorkspaceActions.ts        — Executes parsed AI/workspace actions and pipelines
│   │   ├── WorkspaceState.ts          — Per-pane AI context API
│   │   ├── waitForCommand.ts          — Await a shell command's completion (OSC 133)
│   │   ├── waitForAgentTurn.ts        — Await an agent CLI returning to its "ready" prompt
│   │   └── destructiveCommandGuard.ts — Hard-coded destructive-shell-pattern check (isDestructiveCommand)
│   ├── help/
│   │   ├── helpContent.ts      — Quick-start steps and hint copy
│   │   ├── OnboardingOverlay.ts — First-run onboarding UI (largest file in src/)
│   │   └── OnboardingState.ts   — Onboarding completion/progress persistence
│   ├── hints/
│   │   └── HintManager.ts    — Contextual one-off hint bubbles (e.g. workspace-scroll modifier)
│   ├── settings/
│   │   └── SettingsPanel.ts  — In-app settings panel (Ctrl+,), live preview, save to disk
│   ├── config/
│   │   └── ConfigContext.ts  — Config loading, hot-reload listener, CSS var application
│   ├── keybindings/
│   │   └── KeybindingManager.ts — Map config keybindings → actions, dispatch
│   └── __tests__/            — Vitest unit tests (see Key Abstractions → test coverage note)
├── themes/
│   ├── default-dark.yaml
│   ├── catppuccin-mocha.yaml
│   ├── gruvbox-dark.yaml
│   └── solarized-dark.yaml
├── demo/
│   └── fluxtty-demo.gif      — Demo recording
└── prototype/
    └── main.py               — Python/Textual prototype (reference only)
```

**Note:** `TerminalRow.ts` does not exist as a separate file — rows are plain `<div class="terminal-row">` elements managed directly by `WaterfallArea.ts`. There is no standalone `persistence.rs`/`config/schema.ts`/`config/defaults.ts` — persistence is tmux-backed logic living in `pty.rs`/`session.rs`/`ipc.rs` (see "Persistence Architecture" below), and config schema/defaults live directly in `config.rs`'s struct definitions and `Default` impls rather than separate TS schema files.

---

## Key Abstractions

### PaneInfo
```typescript
interface PaneInfo {
  id: number;
  name: string;          // user-given or auto-named from cwd/command
  group: string;         // free-form, e.g. "proj-alpha"
  note: string;          // user annotation shown in pane header
  status: 'idle' | 'running' | 'error';
  cwd: string;
  tmux_session: string | null;   // tmux session backing this pane, when tmux is enabled
  name_source: 'auto' | 'manual'; // 'manual' pins the name against auto-rename
  agent_type: AgentType;
  row_index: number;     // which waterfall row (sparse — do not use as array index)
  pane_index: number;    // position within the row
  last_command: string | null;   // from OSC 133;B shell-integration markers
  last_exit_code: number | null; // from OSC 133;D
  alternate_screen: boolean;     // true while a full-screen TUI owns the pane
  owner: 'user' | 'ai';          // who created this pane — see autonomous pane control below
  human_touched: boolean;        // set once a human types into an owner:'ai' pane; never cleared
}

type AgentType =
  | 'none' | 'claude' | 'codex' | 'aider' | 'gemini' | 'opencode' | 'goose'
  | 'cursor' | 'qwen' | 'amp' | 'crush' | 'openhands' | 'unknown';
```
Note: there is no `pty_pid` field — the PTY process id is not part of the frontend's
`PaneInfo` (it was removed; see `future-plan.md`/git history if you need why).

### InputMode (state machine)
```typescript
type InputMode =
  | { type: 'normal' }                        // vi normal — navigation + : cmd sub-state
  | { type: 'view'; paneId: number }          // v: active-row-only, read-only watch mode
  | { type: 'ai' }                            // a: persistent free-form chat with Workspace AI
  | { type: 'insert' }                        // i: line editor → active pane PTY (agent-aware)
  | { type: 'terminal'; paneId: number }      // Ctrl+\: xterm owns raw keyboard
  | { type: 'pane-selector'; query: string }  // fuzzy pane find overlay (no default key)
  | { type: 'pane-search'; paneId: number; query: string }; // /: content search in active pane
```

### AutoNamer / PaneNamingPolicy / SessionObserver
Auto-naming is now split across three files (it used to be inline in `WaterfallArea.ts`):
- `AutoNamer.ts` — pure heuristics: `isSignificantCommand`, `suggestName`, `nameFromCwd`
- `PaneNamingPolicy.ts` — per-pane gating on top of those heuristics: `canAutoRenamePane`
  (true iff `pane.name_source === 'auto'`), `suggestCwdNameForPane`,
  `suggestCommandNameForPane`, `suggestAltScreenNameForPane`
- `SessionObserver.ts` — the driver: watches `SessionManager` pane changes (cwd,
  `last_command`, `alternate_screen`) and applies the suggested renames via `SessionManager`

Behavior: name = `basename(cwd)` on spawn if still default; updates on cwd change; on a
significant command (claude, vim, psql, ssh, etc.) name becomes `"dir · command"`;
user-renamed panes (`name_source: 'manual'`) are never touched again.

### LLM Client (multi-provider)
`src/ai/llm-client.ts` supports:
- `anthropic` — Anthropic API (claude-* models)
- `openai` — OpenAI API (gpt-*, o1-*, o3-*, o4-*)
- `google` — Google Gemini API (gemini-*)
- `ollama` — Local Ollama (ollama/* or ollama:* prefix)
- `claude-cli` — Runs `claude -p <prompt>` as a subprocess via Rust IPC

Provider is auto-inferred from the model name when not explicitly set, or resolved through
`workspace_ai.provider`'s OpenCode-style provider map (`splitModel`/`firstProviderId` in
`llm-client.ts`) merged with the built-ins in `src/ai/model-catalog.ts`.
API keys are read from env vars via Rust IPC (`get_env_var`) — not accessible to JS directly.

### Shell Completion
`shell_complete` IPC command runs `bash compgen` in the pane's cwd:
- First word: completes commands, aliases, functions
- Subsequent words: completes file/directory paths
- Tab in Insert mode shows a dropdown; second Tab cycles items; longest common prefix is auto-inserted

### TerminalRow
A row is a `<div class="terminal-row">` holding 1–N pane elements.
Row height is computed by `WaterfallArea.recalcRowHeights()`:
- Phase 1 (few rows): `floor((containerH - overhead) / rowCount)` — all rows fit, no scrolling
- Phase 2 (many rows): `threshold = 28 + ceil(18 × font.size × 1.2)` — rows scroll waterfall-style

### Persistence Architecture

**Core principle: PTYs are owned by the Rust backend, not the WebView.**

```
┌─────────────────────────────────────────────────────────┐
│  Rust Backend (src-tauri/)                              │
│                                                         │
│  PtyManager   — PTY processes (portable-pty)            │
│  SessionManager — layout, names, groups, status         │
│  Config        — YAML load + notify watcher             │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri IPC (invoke / events)
          ┌──────────┴───────────┐
          │  WebView (window)    │
          │  xterm.js instances  │
          └──────────────────────┘
```

**Note:** tmux-backed persistence is implemented. When `tmux.enabled` is true (default),
each pane's shell runs inside a tmux session (`src-tauri/src/pty.rs` handles attach /
session-template logic; `ipc.rs` exposes `tmux_list_sessions`), so shells survive the
window closing and can be reattached. `persistence.restore_workspace_on_launch`
(YAML alias: `keep_alive`) restores the saved layout on next launch, and
`persistence.disk_state_path` / `save_scrollback_on_exit` control the on-disk workspace
snapshot. Dev and release builds use different tmux session-name prefixes
(`fluxtty-dev-...` vs `fluxtty-...`) and different snapshot files so they never collide.

### WorkspaceAI
Not an LLM by default — regex intent parser + dispatcher. Wired to real model via
`workspace_ai.model` config. Core value is the dispatch model and the modal
input surface, not the intelligence of the parser.

When an LLM model is configured, the AI handler:
1. Builds a system prompt with current session context
2. Sends to the configured LLM provider
3. Parses ` ```action ``` ` JSON blocks from the response
4. Executes single actions immediately; broadcasts/multi-step require confirmation

### Config (YAML schema)

This reflects the actual `Config` struct and its `Default` impls in `src-tauri/src/config.rs`
— every section is `#[serde(default)]`, so a key omitted from the user's YAML falls back to
the value shown here, not to the previous (now-stale) example that used to live in this doc.

```yaml
# ~/.config/fluxtty/config.yaml

window:
  opacity: 0.72
  transparency_enabled: true
  shell_background_opaque: true
  padding: { x: 8, y: 6 }
  decorations: full
  startup_mode: windowed
  compact_mode: false

font:
  family: "JetBrains Mono"
  size: 13.0
  builtin_box_drawing: true
  # Note: there is no per-weight (normal/bold/italic) sub-config — a single family/size
  # is used for all font weights/styles.

colors:
  theme: nord                          # null to fall back to the primary/normal/bright below;
                                        # otherwise loads themes/<name>.yaml (see themes/)
  primary:
    background: "#2e3440"
    foreground: "#d8dee9"
  cursor:
    text:   "#2e3440"
    cursor: "#eceff4"
  normal:
    black: "#3b4252"
    red: "#bf616a"
    green: "#a3be8c"
    yellow: "#ebcb8b"
    blue: "#81a1c1"
    magenta: "#b48ead"
    cyan: "#88c0d0"
    white: "#e5e9f0"
  bright:
    black: "#4c566a"
    red: "#bf616a"
    green: "#a3be8c"
    yellow: "#ebcb8b"
    blue: "#81a1c1"
    magenta: "#b48ead"
    cyan: "#8fbcbb"
    white: "#eceff4"

cursor:
  style: Block
  blinking: true
  blink_interval: 750

scrolling:
  history: 10000
  multiplier: 3

shell:
  program: null   # defaults to $SHELL, falling back to /bin/zsh
  args: ["-l"]    # login shell by default, so profile files run

tmux:
  enabled: true
  program: tmux
  session: "fluxtty-{cwd_name}-{short_id}"   # dev builds use a fluxtty-dev-... prefix
  auto_attach: true
  passthrough: true
  extra_args: ["-u"]

input:
  live_typing: true                    # true (default): each keystroke forwarded immediately
  workspace_scroll_modifier: meta      # meta | control | alt | shift | disabled

# Only a handful of app-level actions are bound by default — Normal-mode vi navigation
# (h j k l, i, a, v, gg/G, n, s, b, r, m, Ctrl+D/U/B, /, :) is hardcoded in InputBar.ts,
# not driven by this list. Add entries here to bind other available actions such as
# FocusNextRow/FocusPrevRow, FocusNextPane/FocusPrevPane, ClosePane,
# RenameCurrentSession, GroupCurrentSession, Copy, Paste, IncreaseFontSize,
# DecreaseFontSize, ResetFontSize, EnterPane, SearchPane (see KeybindingManager.ts).
keybindings:
  - { key: N,  mods: Control, action: NewTerminal }
  - { key: H,  mods: Control, action: SplitHorizontal }
  - { key: B,  mods: Control, action: ToggleSidebar }
  - { key: "\\", mods: Control, action: ToggleInputMode }
  - { key: ",", mods: Meta,   action: OpenSettings }   # Control on non-macOS
  - { key: Q,  mods: Control, action: Quit }

workspace_ai:
  always_confirm_broadcast: true
  always_confirm_multi_step: true
  agent_relay_auto_submit: false
  model: none                          # OpenCode-style id, e.g. openai/gpt-5.4, claude-cli
  small_model: null                    # reserved for future summary/title tasks
  provider: {}                         # map of provider id -> { models: { ... } }, see model-catalog.ts
  api_key_env: ""                      # legacy: env var name for a single-provider API key
  base_url: null                       # legacy: override API base URL

waterfall:
  row_height_mode: viewport            # viewport | fixed
  fixed_row_height: 40                 # used only when row_height_mode: fixed (in rem)
  scroll_snap: false
  new_pane_focus: true
  note_width: 280
  pane_min_width: 150
  show_note_button: true
  inactive_pane_scrim_strength: 22
  min_row_lines: 30

persistence:
  restore_workspace_on_launch: true    # YAML alias: keep_alive
  disk_state_path: "~/.local/share/fluxtty/workspace.json"  # dev builds use workspace.dev.json
  scrollback_lines: 5000
  save_scrollback_on_exit: true

session_defaults:
  group: default
  shell: null                          # null = use shell.program
```

---

## Agent Detection

`AgentDetector` (`src/input/AgentDetector.ts`) watches PTY output and the launch command to
classify what agent (if any) is running. Supported `AgentType` values: `claude`, `codex`,
`aider`, `gemini`, `opencode`, `goose`, `cursor`, `qwen`, `amp`, `crush`, `openhands`, plus
`none` and `unknown`. `AGENT_LABELS` and `AGENT_SLASH_COMMANDS` (`src/session/types.ts`)
hold the display label and known slash-command list per agent — most of the newer agents
share a `COMMON_AGENT_SLASH_COMMANDS` fallback rather than a bespoke list. Users can always
override detection via `!agent <type>`.

When `agent_type != 'none'`, Insert mode shows agent name in the mode indicator
and Tab autocompletes that agent's known slash commands.

---

## What NOT to Do

- **Historical rules, now formally reversed (2026-08-19) — do not re-flag as violations:**
  "the Workspace AI must not be a coding assistant" and "must never auto-submit to an
  agent pane, always route via Insert mode." The user deliberately reversed both to ship
  autonomous pane control (see "Workspace AI interaction model" below). `agent-send`
  (`WorkspaceActions.ts`) writing a message + `\r` directly into an agent pane's PTY, and
  `IMMEDIATE_AI_ACTION_TYPES`-free `dispatch()` running most AI-originated actions with
  no confirmation, are intentional, not bugs. What replaced the old blanket rule: two
  specific things are *never* left to the AI's judgment and always force a human y/n —
  see "Destructive Command Guard" and the close-on-`human_touched` rule below. Everything
  else is intentionally the AI's call.
  `workspace_ai.agent_relay_auto_submit` (`config.rs`, default `false`) remains
  dead/unwired — unrelated to any of this, not part of the confirmation gating.
- **Do not** add a persistent AI panel that takes vertical space. The Input Bar is the only persistent UI at the bottom.
- **Do not** couple xterm.js rendering logic with session management. Keep them separate via SessionManager events.
- **Do not** store config in Tauri's store or localStorage. Config lives in `~/.config/fluxtty/config.yaml` only.
- **Do not** skip the plan-confirm step for broadcast or multi-step dispatch.
- **Do not** hardcode colors, font sizes, or keybindings anywhere in source. Always read from config.
- **Do not** reuse the Python/Textual prototype code in production. It is reference only.
- **Do not** intercept or wrap agent input/output. Insert mode sends raw bytes; the agent sees exactly what the user typed.
- **Do not** use `row_index` from `PaneInfo` as a direct array index — it is sparse. Use `sessionManager.getPanesByRow()` which returns a compacted array.
