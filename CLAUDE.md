# WaterfallTerm — Codebase Instructions

## What This Is

A multi-session developer workspace terminal for programmers running many concurrent tasks
(multiple `claude` sessions, dev servers, test runners, database shells, etc.).

**Not** a general-purpose terminal. **Not** an AI coding assistant.
The Workspace AI manages the *workspace itself* — session naming, grouping, dispatch.
What runs inside each shell is entirely the programmer's choice.

---

## Core Design Decisions (do not reverse without strong reason)

### 1. Terminal area is primary, everything else is overlay
- Terminals fill 100% of screen by default
- Session Sidebar (Ctrl+B) is hidden by default
- Global Input Bar is always visible at the bottom
- When sidebar toggled, it compresses terminal space — never owns it permanently

### 2. Waterfall layout
- Each terminal row height = visible viewport height (minus chrome)
- One scroll page = one terminal row
- Rows stack downward; horizontal splits live within a row
- Row height recalculates on viewport resize and on sidebar toggle

### 3. Session identity is first-class
Every pane has: `name`, `group`, `status` (idle/running/error), `cwd`
- Default name: `shell-N` — user should be encouraged to name sessions
- Groups are free-form strings (e.g. `proj-alpha`, `infra`)
- Status drives sidebar indicators and AI context

### 4. Modal Input Bar — the primary interaction surface

The Global Input Bar sits at the bottom of the screen, always visible.
It operates in four modes, modeled after vim's modal philosophy.

#### Modes

| Mode | Input Bar Shows | Keystrokes Go To |
|---|---|---|
| **AI Mode** | `AI ❯` | Workspace AI (LLM or intent parser) |
| **Pane Direct Mode** | `[pane-name] ❯` | Active pane's shell stdin |
| **Pane Selector** | `/` + fuzzy query | Pane list filter (transient overlay) |
| **Agent Mode** | `[claude] ❯` (or `[codex] ❯`) | Active agent's stdin + agent slash completions |

#### Mode Transitions

```
AI Mode ──/──────────────────→ Pane Selector (overlay)
            ──<toggle-key>──→ Pane Direct Mode (focuses active pane)
            ──Enter──────────→ Workspace AI processes input

Pane Direct Mode ──<toggle-key>──→ AI Mode
                 (auto-activates Agent Mode if agent detected in pane)

Pane Selector ──Enter (select)──→ AI Mode (new active pane, waterfall scrolls to it)
              ──ESC────────────→ AI Mode (no change)

Agent Mode ──<toggle-key>──→ AI Mode
           (sub-state of Pane Direct; auto-enters when agent pane is active)
```

**Toggle key:** `Ctrl+Space` (default, configurable). This single key:
- From AI Mode → enters Pane Direct Mode on the current active pane
- From Pane Direct / Agent Mode → returns to AI Mode

#### Pane Selector (`/`)
- Triggered by `/` in AI Mode
- Fuzzy search over all panes: matches name, group, cwd, running command
- Shows: pane name · group badge · status dot · cwd
- Selecting a pane scrolls the waterfall to it and makes it the active pane
- After selection, mode returns to AI Mode with the new pane active
- `/` is also available inside AI Mode when typing a command (e.g. `run tests in /` → opens selector mid-sentence)

#### Pane Direct Mode
- All keystrokes (including ESC, arrow keys, etc.) go directly to the active pane's PTY
- The toggle key (`Ctrl+Space`) is the only key intercepted by the workspace
- The pane header brightens to indicate direct mode is active

#### Agent Mode (auto-detected sub-state of Pane Direct)
- Activated automatically when the active pane is detected as running an AI agent
  (claude, codex, aider, etc. — detected via PTY output heuristics)
- Input bar autocomplete shows that agent's native slash commands
  (e.g. `/bash`, `/tools`, `/clear` for claude; `/diff`, `/run` for codex)
- Keystrokes go to the agent's stdin exactly as typed
- No special wrapping or interception — the agent sees raw input
- Toggle key still works to return to AI Mode

#### AI Mode behavior
- `Enter` submits the input to the configured model (or regex intent parser if `model: none`)
- `/` opens Pane Selector (can appear mid-command for inline pane reference)
- AI can execute: run commands in panes, create/rename/close sessions, broadcast, multi-step plans
- Broadcast and multi-step plans always show a confirmation step before executing

#### Future: Telescope Mode
- The Pane Selector and AI Mode may gain a full-screen telescope-style UI
- Config flag `input.mode: telescope` will switch the selector to a full-screen overlay
- Not in scope for initial implementation

### 5. Workspace AI interaction model

| Scenario | Behavior |
|---|---|
| `run <cmd> in <session>` | Auto-execute, no confirm |
| `<cmd> in all sessions` | Show plan → y/n confirm → execute |
| `run X then run Y in Z` | Show plan → y/n confirm → execute sequentially |
| Relay to AI agent session | Pre-fill that pane's input via Agent Mode, do NOT auto-submit |
| `/` prefix in AI Mode | Open Pane Selector |

**The plan-confirm step exists for any action with broad or irreversible scope.**
Single-session, single-command dispatch skips confirmation.

### 6. Config is YAML, Alacritty-style
Config lives at `~/.config/waterfallterm/config.yaml`.
All visual and behavioral properties are configurable.
Hot-reload on file save. Schema is strict with sensible defaults.

---

## Tech Stack

**Runtime:** Tauri (Rust backend) + xterm.js (WebView frontend)

- **Rust backend (src-tauri/):** PTY management, config loading/watching, session state, persistence, IPC
- **WebView frontend (src/):** xterm.js terminal rendering, layout, input bar UI — vanilla TypeScript
- **xterm.js:** industry-standard terminal emulator (VSCode, Hyper). Handles ANSI, colors, fonts natively.
- No Electron. No heavy JS frameworks. The terminal rendering is xterm.js; UI chrome is minimal TypeScript.

**Key Rust dependencies (`src-tauri/Cargo.toml`):**
```
portable-pty      — cross-platform PTY (macOS/Linux/Windows ConPTY)
serde_yaml        — YAML config parsing
serde / serde_json — serialization
notify            — file system watcher for config hot-reload
strip-ansi-escapes — ANSI stripping for disk persistence
tokio             — async runtime
tauri             — app framework, WebView, IPC
```

**Key JS dependencies (`package.json`):**
```
xterm                  — terminal emulator widget
xterm-addon-fit        — resize PTY to match DOM element
xterm-addon-web-links  — clickable URLs
xterm-addon-search     — vi-mode search
```

---

## Project Structure

```
waterfallterm/
├── CLAUDE.md
├── plan.md
├── package.json              — frontend build (Vite + TypeScript)
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs           — Tauri app entry, window setup
│       ├── pty.rs            — PTY lifecycle: spawn, resize, kill, I/O (portable-pty)
│       ├── config.rs         — YAML load/validate/watch, emit config:changed to frontend
│       ├── session.rs        — PaneInfo state, session events
│       ├── persistence.rs    — WorkspaceSnapshot: serialize/deserialize, scrollback buffer
│       └── ipc.rs            — Tauri commands + events (frontend ↔ backend)
├── src/
│   ├── app.ts                — Root: layout orchestration, mode manager init
│   ├── waterfall/
│   │   ├── WaterfallArea.ts  — Scrollable container, row height calculation
│   │   ├── TerminalRow.ts    — Horizontal split container
│   │   └── TerminalPane.ts   — xterm.js instance + pane chrome (header, status)
│   ├── sidebar/
│   │   └── SessionSidebar.ts — Grouped session tree, status dots, click-to-navigate
│   ├── input/
│   │   ├── InputBar.ts       — Bottom bar component, mode-aware rendering
│   │   ├── ModeManager.ts    — Mode state machine (AI / PaneDirect / Selector / Agent)
│   │   ├── PaneSelector.ts   — Fuzzy finder overlay for pane selection
│   │   └── AgentDetector.ts  — Detect agent type from PTY output (claude/codex/aider)
│   ├── ai/
│   │   ├── ai-handler.ts     — Intent parsing and dispatch logic
│   │   └── plan-executor.ts  — Multi-step plan confirmation and sequential execution
│   ├── session/
│   │   ├── SessionManager.ts — Source of truth for all PaneInfo, emits change events
│   │   └── types.ts          — PaneInfo, SessionStatus, Group, Plan, Mode types
│   ├── config/
│   │   ├── defaults.ts       — Full default config object
│   │   ├── schema.ts         — Zod schema for validation
│   │   └── ConfigContext.ts  — Event bus for live config changes
│   └── keybindings/
│       └── KeybindingManager.ts — Map config keybindings → actions, handle conflicts
├── themes/
│   ├── default-dark.yaml
│   ├── catppuccin-mocha.yaml
│   ├── gruvbox-dark.yaml
│   └── solarized-dark.yaml
├── demo/
│   └── demo.html             — Static HTML demo (UX/layout reference, not production)
└── prototype/
    └── main.py               — Python/Textual prototype (reference only)
```

---

## Key Abstractions

### PaneInfo
```typescript
interface PaneInfo {
  id: number;
  name: string;          // user-given, defaults to "shell-N"
  group: string;         // free-form, e.g. "proj-alpha"
  status: 'idle' | 'running' | 'error';
  cwd: string;
  ptyPid: number;        // PTY process ID
  agentType: AgentType;  // 'none' | 'claude' | 'codex' | 'aider' | 'unknown'
}

type AgentType = 'none' | 'claude' | 'codex' | 'aider' | 'unknown';
```

### InputMode (state machine)
```typescript
type InputMode =
  | { type: 'ai' }
  | { type: 'pane-direct'; paneId: number }
  | { type: 'pane-selector'; query: string; returnMode: 'ai' }
  | { type: 'agent'; paneId: number; agentType: AgentType };
```

### TerminalRow
A row holds 1–N panes horizontally. Row height = viewport height minus chrome.
Adding a pane to a row = horizontal split. Adding a new row = waterfall down.

### Persistence Architecture (tmux model)

**Core principle: PTYs are owned by the Rust backend, not the WebView.**
The WebView is a dumb view that attaches to PTYs. Closing the window
detaches the view; the PTYs keep running.

```
┌─────────────────────────────────────────────────────────┐
│  Rust Backend (always running while keep_alive: true)   │
│                                                         │
│  PtyManager                                             │
│  ├── PTY 1 (frontend-dev)  ← shell still running       │
│  ├── PTY 2 (backend-api)   ← shell still running       │
│  └── PTY 3 (claude-auth)   ← claude still running      │
│                                                         │
│  ScrollbackBuffer (in-memory, 5000 lines/pane)          │
│  SessionManager  (layout, names, groups, status)        │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri IPC (invoke / events)
          ┌──────────┴───────────┐
          │  WebView (window)    │  ← can close and reopen freely
          │  xterm.js instances  │
          └──────────────────────┘
```

**Scenario A — window closed, app alive (zero state loss):**
1. WebView sends "detach" signal to Rust backend
2. Backend continues; PTYs and scrollback buffers stay in memory
3. On window reopen: backend sends current layout + full scrollback to new WebView
4. WebView replays scrollback into xterm, reattaches to PTY streams
5. User sees everything exactly as they left it

**Scenario B — full app exit (reboot):**
1. Backend serializes `WorkspaceSnapshot` to disk on exit
2. On next launch: load snapshot, spawn new shells at saved CWD
3. Print saved scrollback dimmed, then `── restored ──` separator
4. Processes that were running are gone; user sees their last output as context

```typescript
interface WorkspaceSnapshot {
  version: number;
  saved_at: string;
  rows: Array<{
    panes: Array<{
      name: string;
      group: string;
      cwd: string;
      scrollback: string[];    // ANSI-stripped lines for disk
      was_running: boolean;
      agent_type: string;      // persisted so UI can restore agent indicator
    }>;
  }>;
}
```

### WorkspaceAI
Not an LLM by default — intent parser + dispatcher. Wired to real model via
`workspace_ai.model` config. Core value is the dispatch model and the modal
input surface, not the intelligence of the parser.

### Config (YAML schema)
```yaml
# ~/.config/waterfallterm/config.yaml

window:
  opacity: 1.0
  padding: { x: 8, y: 6 }
  decorations: full
  startup_mode: windowed

font:
  normal:  { family: "JetBrains Mono", style: Regular }
  bold:    { family: "JetBrains Mono", style: Bold }
  italic:  { family: "JetBrains Mono", style: Italic }
  size: 13.0
  offset: { x: 0, y: 0 }
  builtin_box_drawing: true

colors:
  primary:
    background: "#0d1117"
    foreground: "#e6edf3"
  cursor:
    text:   "#0d1117"
    cursor: "#e6edf3"
  normal:
    black:   "#484f58"
    red:     "#ff7b72"
    green:   "#3fb950"
    yellow:  "#d29922"
    blue:    "#388bfd"
    magenta: "#bc8cff"
    cyan:    "#39c5cf"
    white:   "#b1bac4"
  bright:
    black:   "#6e7681"
    red:     "#ffa198"
    green:   "#56d364"
    yellow:  "#e3b341"
    blue:    "#79c0ff"
    magenta: "#d2a8ff"
    cyan:    "#56d4dd"
    white:   "#f0f6fc"

cursor:
  style: Block
  blinking: true
  blink_interval: 750

scrolling:
  history: 10000
  multiplier: 3

shell:
  program: /bin/zsh
  args: []

keybindings:
  - { key: N,         mods: Control,       action: NewTerminal }
  - { key: H,         mods: Control,       action: SplitHorizontal }
  - { key: W,         mods: Control,       action: ClosePane }
  - { key: B,         mods: Control,       action: ToggleSidebar }
  - { key: Space,     mods: Control,       action: ToggleInputMode }   # AI Mode ↔ Pane Direct
  - { key: Up,        mods: Control,       action: FocusPrevRow }
  - { key: Down,      mods: Control,       action: FocusNextRow }
  - { key: Tab,       mods: Control,       action: FocusNextPane }
  - { key: R,         mods: Control,       action: RenameCurrentSession }
  - { key: G,         mods: Control,       action: GroupCurrentSession }
  - { key: Return,    mods: Control|Shift, action: NewTerminalInGroup }
  - { key: Q,         mods: Control,       action: Quit }
  - { key: C,         mods: Control|Shift, action: Copy }
  - { key: V,         mods: Control|Shift, action: Paste }
  - { key: Plus,      mods: Control,       action: IncreaseFontSize }
  - { key: Minus,     mods: Control,       action: DecreaseFontSize }
  - { key: Key0,      mods: Control,       action: ResetFontSize }

input:
  toggle_key: { key: Space, mods: Control }   # ToggleInputMode binding
  selector_key: "/"                            # triggers Pane Selector in AI Mode
  mode: standard                               # standard | telescope (future)
  ai_prompt: "AI"                              # label shown in AI Mode: "AI ❯"

vi_mode:
  enabled: true
  pane:
    enter_key: Escape
    exit_key: i
    cursor_style: Block
    cursor_color: "#e3b341"
    keybindings:
      - { key: H,      action: MoveLeft }
      - { key: J,      action: MoveDown }
      - { key: K,      action: MoveUp }
      - { key: L,      action: MoveRight }
      - { key: W,      action: MoveWordForward }
      - { key: B,      action: MoveWordBackward }
      - { key: E,      action: MoveWordEndForward }
      - { key: Key0,   action: MoveLineStart }
      - { key: Dollar, action: MoveLineEnd }
      - { key: G, mods: Shift,    action: ScrollToBottom }
      - { key: G,                 action: ScrollToTop }
      - { key: D, mods: Control,  action: ScrollHalfPageDown }
      - { key: U, mods: Control,  action: ScrollHalfPageUp }
      - { key: F, mods: Control,  action: ScrollPageDown }
      - { key: B, mods: Control,  action: ScrollPageUp }
      - { key: V,      action: ToggleVisualMode }
      - { key: V, mods: Shift, action: ToggleVisualLineMode }
      - { key: Y,      action: YankSelection }
      - { key: Slash,  action: SearchForward }
      - { key: Question, action: SearchBackward }
      - { key: N,      action: SearchNext }
      - { key: N, mods: Shift, action: SearchPrev }
      - { key: I,      action: ExitViMode }
      - { key: A,      action: ExitViMode }
      - { key: Escape, action: ExitViMode }
  workspace:
    enabled: true
    keybindings:
      - { key: J,      action: FocusNextRow }
      - { key: K,      action: FocusPrevRow }
      - { key: L,      action: FocusNextPane }
      - { key: H,      action: FocusPrevPane }
      - { key: Return, action: EnterPane }

workspace_ai:
  always_confirm_broadcast: true
  always_confirm_multi_step: true
  agent_relay_auto_submit: false
  model: none                          # none | claude-sonnet-4-6 | ...
  api_key_env: ANTHROPIC_API_KEY

waterfall:
  row_height_mode: viewport
  fixed_row_height: 40
  scroll_snap: false
  new_pane_focus: true

persistence:
  keep_alive: true
  tray_icon: true
  disk_state_path: ~/.local/share/waterfallterm/workspace.json
  scrollback_lines: 5000
  save_scrollback_on_exit: true

session_defaults:
  group: default
  shell: null
```

---

## Agent Detection

`AgentDetector` watches PTY output for patterns to classify what agent (if any) is running.

| Agent | Detection heuristics |
|---|---|
| `claude` | Prompt patterns: `Claude ❯`, `Human:`, tool-use JSON blocks |
| `codex` | Prompt patterns: `codex>`, `/diff` output format |
| `aider` | `aider>` prompt, diff output |
| `unknown` | User can manually mark a session via `!agent` command in AI Mode |

When `agentType != 'none'`, Agent Mode activates automatically on entering Pane Direct Mode for that pane. The input bar autocomplete is populated with that agent's known slash commands. Unknown agents show generic slash completion.

---

## What NOT to Do

- **Do not** make the Workspace AI a coding assistant. It manages sessions.
- **Do not** auto-submit to AI agent sessions. Always route via Agent Mode (raw stdin, user-controlled).
- **Do not** add a persistent AI panel that takes vertical space. The Input Bar is the only persistent UI at the bottom.
- **Do not** couple xterm.js rendering logic with session management. Keep them separate via SessionManager events.
- **Do not** store config in Tauri's store or localStorage. Config lives in `~/.config/waterfallterm/config.yaml` only.
- **Do not** skip the plan-confirm step for broadcast or multi-step dispatch.
- **Do not** hardcode colors, font sizes, or keybindings anywhere in source. Always read from config.
- **Do not** reuse the Python/Textual prototype code in production. It is reference only.
- **Do not** intercept or wrap agent input/output. Agent Mode sends raw bytes; the agent sees exactly what the user typed.
