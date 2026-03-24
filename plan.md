# WaterfallTerm — Build Plan

## Current State

| Artifact | Status | Purpose |
|---|---|---|
| `demo/demo.html` | Done | UX reference — layout, interactions, AI flow |
| `prototype/main.py` | Done | Layout experiments (fake PTY, discard for production) |
| Tauri scaffold | Not started | |
| Real PTY | Not started | |
| Modal Input Bar | Not started | |
| YAML config | Not started | |

The HTML demo is the **UX contract**. Every phase should be validated against it.

---

## Phase 1 — Tauri Foundation

Goal: a real window with a real terminal.

### 1.1 Project scaffold
- [ ] Tauri + Vite + TypeScript setup
- [ ] `src-tauri/` Rust crate with Cargo.toml
- [ ] Basic `BrowserWindow` that loads the renderer
- [ ] ESLint, Prettier, rustfmt

### 1.2 Config system (Rust)
- [ ] `serde_yaml` parsing of `~/.config/waterfallterm/config.yaml`
- [ ] Serde structs for full config schema (see CLAUDE.md)
- [ ] Fall back to bundled defaults if file missing
- [ ] Hot-reload via `notify` crate — emit `config:changed` Tauri event to frontend
- [ ] Frontend `ConfigContext` subscribes to changes, re-applies CSS variables and xterm options

### 1.3 Real PTY — one terminal pane
- [ ] `portable-pty` integration in Rust backend
- [ ] `pty.rs`: spawn shell, pipe data to/from frontend via Tauri events/commands
- [ ] One `TerminalPane` in frontend: xterm.js instance, `FitAddon` for resize
- [ ] PTY resize on element resize (`ResizeObserver` → Tauri command)
- [ ] Shell sourced from config (`shell.program` + `shell.args`)
- [ ] Verify: `vim`, `htop`, `claude`, `git log` all work correctly

**Exit criteria:** open the app, get a real zsh/bash, run `claude`, see it work.

---

## Phase 2 — Waterfall Layout

Goal: the layout from the HTML demo, with real terminals.

### 2.1 Layout shell
- [ ] Header bar: title, session counts, New / Split / Sessions buttons
- [ ] `WaterfallArea`: vertically scrollable container
- [ ] `TerminalRow`: horizontal flex container, height = `rowH()` (viewport - chrome - input bar)
- [ ] `TerminalPane`: xterm.js widget + pane chrome (header, status badge, close btn)
- [ ] `rowH()` recalculates on resize

### 2.2 Session identity
- [ ] `SessionManager`: single source of truth, emits `session:changed` events
- [ ] `PaneInfo` type (id, name, group, status, cwd, ptyPid, agentType)
- [ ] Status tracking: `idle` / `running` / `error` via PTY heuristics
- [ ] Active pane: global singleton, updated by click or keybinding

### 2.3 Waterfall operations
- [ ] `Ctrl+N` — new terminal row
- [ ] `Ctrl+H` — split current row horizontally
- [ ] `Ctrl+W` — close focused pane
- [ ] `Ctrl+↑/↓` — navigate between rows
- [ ] `Ctrl+Tab` — cycle panes within a row
- [ ] Pane header: name · group badge · status dot · cwd · close button
- [ ] Active pane border highlights (even when in AI Mode — not focused but selected)

### 2.4 Session Sidebar (`Ctrl+B`)
- [ ] Default: hidden
- [ ] Grouped tree: group → sessions, with status dots
- [ ] Click to scroll waterfall to that pane and make it active
- [ ] Auto-updates on `session:changed`

---

## Phase 3 — Modal Input Bar

Goal: the primary interaction surface with full mode switching.

### 3.1 Input Bar component (`InputBar.ts`)
- [ ] Always visible at the bottom of the screen (fixed height, ~34px)
- [ ] Renders mode indicator + prompt + input field
- [ ] Mode-aware styling: `AI ❯` (blue), `[pane-name] ❯` (green), `[claude] ❯` (cyan)
- [ ] Separates input bar height from `rowH()` calculation

### 3.2 Mode state machine (`ModeManager.ts`)
- [ ] States: `ai` | `pane-direct` | `pane-selector` | `agent`
- [ ] `ToggleInputMode` action (`Ctrl+Space`): AI Mode ↔ Pane Direct Mode
- [ ] On entering Pane Direct Mode: check `agentType` → auto-promote to Agent Mode if needed
- [ ] On entering AI Mode: input bar takes keyboard focus
- [ ] On entering Pane Direct Mode: active pane's PTY receives all keystrokes except toggle key

### 3.3 Pane Selector overlay (`PaneSelector.ts`)
- [ ] Triggered by `/` in AI Mode
- [ ] Floating overlay above input bar, lists all panes
- [ ] Real-time fuzzy filter on: name, group, cwd, status
- [ ] Keyboard navigation: Up/Down arrows, Enter to select, ESC to cancel
- [ ] On select: update active pane, scroll waterfall to it, return to AI Mode
- [ ] `/` mid-sentence in AI Mode: opens selector inline, inserts pane name on selection

### 3.4 Agent Detector (`AgentDetector.ts`)
- [ ] Subscribe to PTY output stream for each pane
- [ ] Pattern match: claude prompt, codex prompt, aider prompt
- [ ] Update `paneInfo.agentType` via SessionManager
- [ ] Expose known slash commands per agent type for autocomplete
- [ ] User override: `!agent <type>` in AI Mode manually sets agent type for active pane

### 3.5 Agent Mode
- [ ] Autocomplete populates with agent-specific slash commands from AgentDetector
- [ ] Enter sends raw text to agent's PTY stdin (no wrapping, no interception)
- [ ] Input bar label shows agent type
- [ ] Pane header shows agent indicator badge

---

## Phase 4 — Config Drives Everything

### 4.1 Colors
- [ ] Apply `colors.*` from config as CSS variables at root
- [ ] Pass color config to xterm.js `theme` option on init and on `config:changed`
- [ ] Built-in themes in `themes/`: default-dark, catppuccin-mocha, gruvbox-dark, solarized-dark
- [ ] `colors.theme` shorthand loads from bundled themes

### 4.2 Font
- [ ] Apply `font.*` to xterm.js options
- [ ] `IncreaseFontSize` / `DecreaseFontSize` / `ResetFontSize` modify in-memory only

### 4.3 Keybindings
- [ ] `KeybindingManager` reads `keybindings[]` from config
- [ ] Maps `{ key, mods, action }` → handler functions
- [ ] `input.toggle_key` drives `ToggleInputMode`
- [ ] Detects conflicts at load time, warns in console
- [ ] Pass-through: unmatched combos go to xterm (in Pane Direct / Agent Mode)

### 4.4 Window + cursor + scrolling
- [ ] `window.opacity`, `window.decorations`, `window.padding`, `window.startup_mode`
- [ ] `cursor.style`, `cursor.blinking`, `cursor.blink_interval`
- [ ] `scrolling.history`, `scrolling.multiplier`

---

## Phase 5 — Workspace AI

Goal: the AI interaction model with real dispatch.

### 5.1 Intent parser (`ai-handler.ts`)
Parse AI Mode input as one of:
- [ ] `run <cmd> in <session>` → single dispatch, no confirm
- [ ] `<cmd> in all sessions` → broadcast, show plan, confirm
- [ ] `run X then run Y in Z` → sequential plan, confirm
- [ ] `new <name> in <group>` → create session
- [ ] `rename <target> to <name>`
- [ ] `move <target> to <group>`
- [ ] `list` / `status`
- [ ] `close <target>` / `close idle`
- [ ] `split`
- [ ] `!agent <type>` → manually set agent type for active pane
- [ ] `help`

### 5.2 Plan executor (`plan-executor.ts`)
- [ ] `pendingPlan` state: `Array<{paneId, cmd}>`
- [ ] Show plan in input bar log area above prompt
- [ ] `y` → execute steps sequentially with 300ms gap
- [ ] `n` / ESC → cancel
- [ ] Each step shown in target pane as `workspace ❯ <cmd>`

### 5.3 Real LLM backend (config-gated)
- [ ] `workspace_ai.model: claude-sonnet-4-6` enables Claude API
- [ ] System prompt: workspace context (session list, groups, statuses, active pane)
- [ ] Responses parsed for structured actions (tool use)
- [ ] Fallback to regex parser if `model: none`

### 5.4 AI Mode output area
- [ ] Scrollable log above the input bar (expandable, collapsed by default)
- [ ] Shows: AI responses, dispatch confirmations, agent relay indicators
- [ ] Toggled by `Ctrl+A` (or auto-expands on AI response)

---

## Phase 6 — Persistence (tmux model)

### 6.1 Keep-alive (Scenario A)
- [ ] On window close: detach WebView, Rust backend stays running
- [ ] System tray icon when window is closed
- [ ] On window reopen: send layout + scrollback to new WebView, reattach PTY streams
- [ ] `ScrollbackBuffer` in Rust: ring buffer per PTY, 5000 lines

### 6.2 Disk persistence (Scenario B)
- [ ] `WorkspaceStateManager::serialize()` on app quit
- [ ] Strip ANSI codes (`strip-ansi-escapes`) before writing
- [ ] Atomic write to `~/.local/share/waterfallterm/workspace.json`
- [ ] On launch: detect snapshot → rebuild layout → spawn shells at CWD → replay dimmed scrollback → `── restored ──`

---

## Phase 7 — Polish

### 7.1 Vi mode
- [ ] Pane vi mode: Escape enters scrollback navigation per pane (see CLAUDE.md for full keybindings)
- [ ] Workspace vi mode: `j/k/h/l` navigate panes when no pane is in direct mode

### 7.2 macOS
- [ ] Native title bar (`window.decorations: transparent`)
- [ ] Retina display: devicePixelRatio handling in xterm

### 7.3 UX details
- [ ] Clickable URLs (`xterm-addon-web-links`)
- [ ] Copy on select
- [ ] Session name inline edit (double-click pane header)
- [ ] `waterfall.scroll_snap`

### 7.4 Performance
- [ ] Lazy-render off-screen rows (IntersectionObserver)
- [ ] PTY output throttling to prevent renderer flooding

---

## Milestone Summary

| Milestone | Done when |
|---|---|
| M1: Real terminal | Run `claude` in a pane, it works |
| M2: Waterfall layout | 3 rows, horizontal split, sidebar toggle all work |
| M3: Modal Input Bar | AI Mode, Pane Direct, Pane Selector, Agent Mode all work |
| M4: Config-driven | Swap color theme in YAML, terminal updates live |
| M5: Workspace AI | `run npm test in backend`, broadcast, multi-step plan all work |
| M6: Persistence | Close window → reopen → claude still running, scrollback intact |
| M7: Full polish | vi mode, macOS native, performance |
