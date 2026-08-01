# Partial p3 — Epic-Canvas Panel (HTML + JS + CSS)

**Ticket:** T002464
**Rolle:** `epic-panel`
**Ziel-Dateien:** `.lavish/kit/panel-epic-canvas.html`, `.lavish/kit/panel-epic-canvas.js`, `.lavish/kit/panel-epic-canvas.css`
**Abhängigkeiten:** p1 (canvas-store.js) und K1 (Design-Kit CSS-Tokens)

## Ziel

Browser-Panel für den Epic-Canvas. Zeigt laufende Epics, erlaubt Bearbeitung und Export.
Zwei Layouts: Panel (schmal) und Vollfläche (breit).

## panel-epic-canvas.css

Basierend auf K1-Design-Tokens. Zwei Modi über Klasse `.epic-canvas--fullscreen`.

```css
/* panel-epic-canvas.css — K5 Epic-Canvas Panel Styles */
@import url('./tokens.css');

.epic-canvas {
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-surface);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.epic-canvas-header {
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.epic-canvas-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm);
}

.epic-item {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.epic-item:hover {
  background: var(--color-hover);
}

.epic-item--active {
  border-color: var(--color-accent);
  background: var(--color-hover);
}

.epic-title {
  font-weight: 600;
  font-size: var(--font-size-md);
}

.epic-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.epic-detail {
  padding: var(--space-md);
}

.epic-detail label {
  display: block;
  font-weight: 600;
  margin-top: var(--space-sm);
  margin-bottom: var(--space-xs);
}

.epic-detail textarea,
.epic-detail input {
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
}

.epic-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.epic-actions button {
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  cursor: pointer;
}

.epic-actions button:hover {
  background: var(--color-hover);
}

.epic-actions button.primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border-color: var(--color-accent);
}

/* Fullscreen mode */
.epic-canvas--fullscreen .epic-canvas-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-md);
}

.epic-canvas--fullscreen .epic-item {
  margin-bottom: 0;
}
```

## panel-epic-canvas.js

Panel-Logik mit zwei Modi und Canvas-Store-Anbindung.

```js
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
      this.container.innerHTML = `<div class="epic-canvas-error">Fehler beim Laden: ${e.message}</div>`;
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
            <div class="epic-title">${e.title}</div>
            <div class="epic-meta">
              <span>${e.id}</span>
              <span>${e.status}</span>
              <span>${e.priority}</span>
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
        <h3>${epic.title}</h3>
        <label>Beschreibung</label>
        <textarea class="epic-desc" rows="3">${epic.description || ''}</textarea>
        <label>Nächster Schritt</label>
        <input class="epic-nextstep" value="${epic.nextStep || ''}" />
        <label>Notizen</label>
        <textarea class="epic-notes" rows="3">${epic.notes || ''}</textarea>
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
      // OF1: Prüfe auf externe Änderungen vor Export
      if (epic.lastExportAt) {
        const changed = await hasExternalChanges(epic.id, epic.lastExportAt);
        if (changed) {
          if (!confirm('openspec/changes/ wurde seit dem letzten Export geändert. Trotzdem exportieren?')) return;
        }
      }
      // Export: ruft openspec CLI auf
      const desc = list.querySelector('.epic-desc').value;
      try {
        const res = await fetch('/api/cockpit/epics/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ epicId: epic.id, description: desc }),
        });
        if (res.ok) await recordExport(epic.id);
      } catch {}
    };
  }
}
```

## panel-epic-canvas.html

HTML-Skeleton, das das Panel in die Cockpit-Shell einbindet.

```html
<!-- panel-epic-canvas.html — K5 Epic-Canvas Panel -->
<link rel="stylesheet" href="panel-epic-canvas.css" />
<div id="epic-canvas-root" class="epic-canvas"></div>
<script type="module">
  import { EpicCanvas } from './panel-epic-canvas.js';
  const root = document.getElementById('epic-canvas-root');
  const canvas = new EpicCanvas(root, {
    fullscreen: window.location.hash === '#fullscreen'
  });
</script>
```

## Abnahmekriterien

1. Panel zeigt Liste der Epics aus Daemon-Endpoint
2. Klick auf Epic öffnet Detailansicht (Beschreibung, Nächster Schritt, Notizen)
3. Speichern persistiert in IndexedDB
4. Export-Button prüft OF1 vor Überschreiben
5. "Zurück"-Button kehrt zur Liste zurück
6. Vollfläche-Umschaltung wechselt Layout (Panel ↔ Grid)
