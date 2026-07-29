// panel-epic-canvas.js — K5 Epic-Canvas Panel
import { getCanvas, saveCanvas, getAllCanvases, hasExternalChanges, recordExport } from './canvas-store.js';

export class EpicCanvas {
  constructor(container, options = {}) {
    this.container = container;
    this.fullscreen = options.fullscreen || false;
    this.epics = [];
    this.activeEpicId = null;
    this.render();
    this.loadEpics();
  }

  toggleFullscreen() {
    this.fullscreen = !this.fullscreen;
    this.container.classList.toggle('epic-canvas--fullscreen', this.fullscreen);
    this.renderList();
  }

  async loadEpics() {
    try {
      const res = await fetch('/api/cockpit/epics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.epics = data.epics || [];
      // Merge with canvas-store data
      const canvases = await getAllCanvases();
      for (const epic of this.epics) {
        const stored = canvases.find(c => c.epicId === epic.id);
        if (stored) {
          epic.description = stored.description || '';
          epic.nextStep = stored.nextStep || '';
          epic.notes = stored.notes || '';
          epic.lastExportAt = stored.lastExportAt;
        }
      }
      this.renderList();
    } catch (e) {
      const list = this.container.querySelector('.epic-canvas-list');
      if (list) list.innerHTML = `<div class="epic-canvas-error">Fehler beim Laden: ${e.message}</div>`;
    }
  }

  render() {
    this.container.classList.add('epic-canvas');
    if (this.fullscreen) this.container.classList.add('epic-canvas--fullscreen');
    this.container.innerHTML = `
      <div class="epic-canvas-header">
        <h2>Epics</h2>
        <button class="epic-toggle-fullscreen" title="Vollfläche umschalten">⛶</button>
      </div>
      <div class="epic-canvas-list"></div>
    `;
    this.container.querySelector('.epic-toggle-fullscreen')
      .addEventListener('click', () => this.toggleFullscreen());
  }

  renderList() {
    const list = this.container.querySelector('.epic-canvas-list');
    if (!list) return;
    if (this.activeEpicId) {
      this.renderDetail(list);
    } else {
      list.innerHTML = this.epics.length === 0
        ? '<div class="epic-empty">Keine laufenden Epics</div>'
        : this.epics.map(e => `
          <div class="epic-item" data-id="${e.id}">
            <div class="epic-title">${this.esc(e.title)}</div>
            <div class="epic-meta">
              <span>${this.esc(e.id)}</span>
              <span>${this.esc(e.status)}</span>
              <span>${this.esc(e.priority)}</span>
            </div>
          </div>
        `).join('');
      list.querySelectorAll('.epic-item').forEach(el => {
        el.addEventListener('click', () => {
          this.activeEpicId = el.dataset.id;
          this.renderList();
        });
      });
    }
  }

  renderDetail(list) {
    const epic = this.epics.find(e => e.id === this.activeEpicId);
    if (!epic) { this.activeEpicId = null; this.renderList(); return; }
    list.innerHTML = `
      <button class="epic-back">← Zurück</button>
      <div class="epic-detail">
        <h3>${this.esc(epic.title)}</h3>
        <label>Beschreibung</label>
        <textarea class="epic-desc" rows="3">${this.esc(epic.description || '')}</textarea>
        <label>Nächster Schritt</label>
        <input class="epic-nextstep" value="${this.esc(epic.nextStep || '')}" />
        <label>Notizen</label>
        <textarea class="epic-notes" rows="3">${this.esc(epic.notes || '')}</textarea>
        <div class="epic-actions">
          <button class="epic-save">Speichern</button>
          <button class="epic-export-primary primary">Als OpenSpec exportieren</button>
        </div>
      </div>
    `;
    list.querySelector('.epic-back').onclick = () => { this.activeEpicId = null; this.renderList(); };
    list.querySelector('.epic-save').onclick = async () => {
      await saveCanvas({
        epicId: epic.id,
        description: list.querySelector('.epic-desc').value,
        nextStep: list.querySelector('.epic-nextstep').value,
        notes: list.querySelector('.epic-notes').value,
      });
    };
    list.querySelector('.epic-export-primary').onclick = async () => {
      if (epic.lastExportAt) {
        const changed = await hasExternalChanges(epic.id, epic.lastExportAt);
        if (changed) {
          if (!confirm('openspec/changes/ wurde seit dem letzten Export geändert. Trotzdem exportieren?')) return;
        }
      }
      const desc = list.querySelector('.epic-desc').value;
      try {
        const res = await fetch('/api/cockpit/epics/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ epicId: epic.id, description: desc }),
        });
        if (res.ok) await recordExport(epic.id);
      } catch { /* silent */ }
    };
  }

  esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
