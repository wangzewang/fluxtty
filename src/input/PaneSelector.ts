import type { PaneInfo } from '../session/types';
import { sessionManager } from '../session/SessionManager';

type SelectCallback = (paneId: number) => void;
type CancelCallback = () => void;

export class PaneSelector {
  readonly el: HTMLElement;
  private items: PaneInfo[] = [];
  private filtered: PaneInfo[] = [];
  private selectedIndex = 0;
  private onSelect: SelectCallback;
  private onCancel: CancelCallback;
  private query = '';

  constructor(onSelect: SelectCallback, onCancel: CancelCallback) {
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    this.el = document.createElement('div');
    this.el.className = 'pane-selector';
    this.el.innerHTML = `
      <div class="ps-list"></div>
    `;
    this.el.style.display = 'none';
  }

  open(query = '') {
    this.query = query;
    this.items = sessionManager.getAllPanes();
    this.selectedIndex = 0;
    this.el.style.display = 'flex';
    this.filter(query);
  }

  close() {
    this.el.style.display = 'none';
    this.query = '';
  }

  isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  filter(query: string) {
    this.query = query;
    const q = query.toLowerCase();
    this.filtered = q
      ? this.items.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.group.toLowerCase().includes(q) ||
          p.cwd.toLowerCase().includes(q) ||
          p.status.toLowerCase().includes(q)
        )
      : [...this.items];
    this.selectedIndex = 0;
    this.render();
  }

  private render() {
    const list = this.el.querySelector('.ps-list') as HTMLElement;
    if (this.filtered.length === 0) {
      list.innerHTML = '<div class="ps-empty">No matching sessions</div>';
      return;
    }

    list.innerHTML = this.filtered.map((p, i) => `
      <div class="ps-item ${i === this.selectedIndex ? 'ps-selected' : ''}" data-id="${p.id}">
        <span class="ps-dot ps-dot-${p.status}">●</span>
        <span class="ps-name">${p.name}</span>
        ${p.group !== 'default' ? `<span class="ps-group">${p.group}</span>` : ''}
        ${p.agent_type !== 'none' ? `<span class="ps-agent">${p.agent_type}</span>` : ''}
        <span class="ps-cwd">${this.shortenPath(p.cwd)}</span>
      </div>
    `).join('');

    // Click to select
    list.querySelectorAll('.ps-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const id = parseInt((item as HTMLElement).dataset.id || '0');
        this.selectById(id);
      });
    });
  }

  private shortenPath(p: string): string {
    if (p.length > 35) return '…' + p.slice(-33);
    return p;
  }

  moveUp() {
    if (this.filtered.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filtered.length) % this.filtered.length;
    this.render();
  }

  moveDown() {
    if (this.filtered.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filtered.length;
    this.render();
  }

  confirmSelection() {
    const p = this.filtered[this.selectedIndex];
    if (p) {
      this.close();
      this.onSelect(p.id);
    }
  }

  private selectById(id: number) {
    this.close();
    this.onSelect(id);
  }

  cancel() {
    this.close();
    this.onCancel();
  }

  getQuery(): string {
    return this.query;
  }
}
