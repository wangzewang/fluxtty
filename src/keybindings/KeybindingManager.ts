import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { configContext } from '../config/ConfigContext';
import type { WaterfallArea } from '../waterfall/WaterfallArea';
import { modeManager } from '../input/ModeManager';
import { sessionManager } from '../session/SessionManager';
import type { SessionSidebar } from '../sidebar/SessionSidebar';
import { unmarkAutoNamed } from '../session/AutoNamer';

interface ActionHandlers {
  waterfallArea: WaterfallArea;
  sidebar: SessionSidebar;
  quit: () => void;
}

export class KeybindingManager {
  private handlers: ActionHandlers | null = null;

  init(handlers: ActionHandlers) {
    this.handlers = handlers;
    document.addEventListener('keydown', (e) => this.dispatch(e));
    // Normal-mode vi keys dispatch this event instead of calling executeAction directly
    document.addEventListener('workspace-action', (e: Event) => {
      this.executeAction((e as CustomEvent<string>).detail);
    });
  }

  private dispatch(e: KeyboardEvent) {
    if (!this.handlers) return;
    const mode = modeManager.getMode();

    // In terminal mode, xterm.js handles all input natively.
    // Ctrl+\ (toggle back to normal) is handled by InputBar's global handler.
    if (mode.type === 'terminal') {
      return;
    }

    // Standard keybindings from config
    const action = this.matchAction(e);
    if (!action) return;

    e.preventDefault();
    e.stopPropagation();
    this.executeAction(action);
  }

  private matchAction(e: KeyboardEvent): string | null {
    const cfg = configContext.get();
    for (const kb of cfg.keybindings) {
      if (kb.key.toLowerCase() !== e.key.toLowerCase() &&
          kb.key !== e.code) continue;

      const mods = (kb.mods || '').split('|').map(m => m.trim().toLowerCase());
      const ctrl = mods.includes('control');
      const shift = mods.includes('shift');
      const alt = mods.includes('alt');

      if (ctrl !== e.ctrlKey) continue;
      if (shift !== e.shiftKey) continue;
      if (alt !== e.altKey) continue;

      return kb.action;
    }
    return null;
  }

  private executeAction(action: string) {
    if (!this.handlers) return;
    const { waterfallArea, sidebar, quit } = this.handlers;

    switch (action) {
      case 'NewTerminal':
        waterfallArea.spawnPane({ newRow: true });
        break;
      case 'SplitHorizontal':
        waterfallArea.splitCurrentRow();
        break;
      case 'ClosePane': {
        const pane = waterfallArea.getActivePane();
        if (pane) pane.destroy();
        break;
      }
      case 'ToggleSidebar':
        sidebar.toggle();
        break;
      case 'ToggleInputMode':
        modeManager.toggle();
        break;
      case 'EnterPane':
        modeManager.enterTerminal();
        break;
      case 'FocusNextRow':
      case 'FocusPrevRow': {
        const activeId = sessionManager.getActivePaneId();
        const rows = sessionManager.getPanesByRow();
        // Find the current row by searching for the active pane's id.
        // Do NOT use activePane.row_index as an array index — getPanesByRow()
        // returns a compacted array [0,1,2...] that no longer matches the
        // sparse row_index values stored in PaneInfo.
        const currentRowIdx = rows.findIndex(row => row.some(p => p.id === activeId));
        if (currentRowIdx === -1) break;
        const delta = action === 'FocusNextRow' ? 1 : -1;
        const nextRow = rows[currentRowIdx + delta];
        if (nextRow && nextRow.length > 0) {
          sessionManager.setActivePane(nextRow[0].id);
          waterfallArea.scrollToPane(nextRow[0].id);
        }
        break;
      }
      case 'FocusNextPane':
      case 'FocusPrevPane': {
        const activeId = sessionManager.getActivePaneId();
        const rows = sessionManager.getPanesByRow();
        // Operate within the active row only — left/right cycles same-row panes
        const rowIdx = rows.findIndex(row => row.some(p => p.id === activeId));
        if (rowIdx === -1) break;
        const rowPanes = rows[rowIdx];
        const idx = rowPanes.findIndex(p => p.id === activeId);
        const delta = action === 'FocusNextPane' ? 1 : -1;
        const next = rowPanes[(idx + delta + rowPanes.length) % rowPanes.length];
        if (next) {
          sessionManager.setActivePane(next.id);
          waterfallArea.scrollToPane(next.id);
        }
        break;
      }
      case 'RenameCurrentSession': {
        const pane = waterfallArea.getActivePane();
        if (!pane) break;
        const name = prompt('Rename session:', pane.getInfo().name);
        if (name && name.trim()) {
          sessionManager.renamePane(pane.paneId, name.trim());
          unmarkAutoNamed(pane.paneId); // user took control of this name
        }
        break;
      }
      case 'GroupCurrentSession': {
        const pane = waterfallArea.getActivePane();
        if (!pane) break;
        const group = prompt('Set group:', pane.getInfo().group);
        if (group !== null) sessionManager.setPaneGroup(pane.paneId, group.trim() || 'default');
        break;
      }
      case 'IncreaseFontSize':
      case 'DecreaseFontSize':
      case 'ResetFontSize':
        document.dispatchEvent(new CustomEvent('font-size-action', { detail: action }));
        break;
      case 'Copy': {
        const sel = window.getSelection()?.toString();
        if (sel) navigator.clipboard.writeText(sel).catch(console.error);
        break;
      }
      case 'Paste':
        navigator.clipboard.readText().then(text => {
          if (!text) return;
          const activeId = sessionManager.getActivePaneId();
          if (activeId == null) return;
          invoke('pty_write', { args: { pane_id: activeId, data: text } }).catch(console.error);
        }).catch(console.error);
        break;
      case 'Quit':
        void getCurrentWindow().close();
        quit();
        break;
    }
  }
}

export const keybindingManager = new KeybindingManager();
