// panel-epic-canvas.js — K5 Epic-Canvas Panel
import { saveCanvas, getAllCanvases, hasExternalChanges, recordExport } from './canvas-store.js';

export class EpicCanvas {
  constructor(container, options = {}) {
    this.container = container;
    this.fullscreen = options.fullscreen || false;
    this.epics = [];
    this.activeEpicId = null;
    this.render();
    this.loadEpics();
    this.loadBrainLinks();
  }

  toggleFullscreen() {
    this.fullscreen = !this.fullscreen;
    this.container.classList.toggle('epic-canvas--fullscreen', this.fullscreen);
    this.renderList();
  }

  async loadEpics() {
    try {
      // E1: über den Adapter, nie per eigenem fetch(). Der Adapter kennt die
      // Daemon-Basis-URL — die Kit-Seiten laufen von file://, ein relativer
      // Pfad ginge dort ins Leere.
      if (!window.data || typeof window.data.epics !== 'function') {
        throw new Error('Adapter (window.data.epics) nicht verfügbar');
      }
      // Der Adapter liefert ein Poll-Handle mit `subscribe`, NICHT mit
      // `fetchNow`; der erste Abruf startet beim Anlegen von selbst. Die Liste
      // aktualisiert sich dadurch weiter, ohne dass das Panel selbst pollt.
      this.epicsHandle = window.data.epics({ refreshMs: 60000 });
      this.unsubscribeEpics = this.epicsHandle.subscribe((data) => {
        this.onEpicsData(data).catch((e) => this.showError(e.message));
      });
    } catch (e) {
      this.showError(e.message);
    }
  }

  async onEpicsData(data) {
    if (!data) return;
    // D13: ein Fehler wird angezeigt, nicht als leere Epic-Liste getarnt.
    if (data.error) {
      this.showError(data.error);
      return;
    }

    this.epics = data.epics || [];
    // Canvas-Daten aus IndexedDB dazumischen
    const canvases = await getAllCanvases();
    for (const epic of this.epics) {
      const stored = canvases.find((c) => c.epicId === epic.id);
      if (stored) {
        epic.description = stored.description || '';
        epic.nextStep = stored.nextStep || '';
        epic.notes = stored.notes || '';
        epic.lastExportAt = stored.lastExportAt;
      }
    }
    this.renderList();
  }

  showError(message) {
    const list = this.container.querySelector('.epic-canvas-list');
    if (!list) return;
    // textContent statt innerHTML: `message` stammt aus einer Daemon-Antwort
    // (Fehlertexte enthalten u.a. stderr-Ausschnitte) und ist damit nichts,
    // was als Markup interpretiert werden darf.
    list.replaceChildren();
    const box = document.createElement('div');
    box.className = 'epic-canvas-error';
    box.textContent = `Fehler beim Laden: ${message}`;
    list.appendChild(box);
  }

  /**
   * K6 Brain-Verweise (T002465) — die Wiki-Seiten zum Quellpfad dieses Panels.
   *
   * Einmalabruf statt Poll: die Verweise aendern sich nur bei einem Ingest-Lauf.
   * Das Panel kennt sein Subjekt — das SDLC-Cockpit-Epic und dessen SSOT-Spec —
   * und reicht diesen Quellpfad an den Adapter weiter; es holt den Inhalt nie
   * selbst (E1).
   */
  async loadBrainLinks() {
    try {
      if (!window.data || typeof window.data.brainLinks !== 'function') {
        this.setContext([{ href: '#', label: 'Brain-Verweise nicht verfügbar' }]);
        return;
      }
      const result = await window.data.brainLinks(['openspec/specs/sdlc-cockpit.md']);
      this.renderBrainContext(result);
    } catch (e) {
      this.setContext([{ href: '#', label: `Brain-Verweise: ${e.message}` }]);
    }
  }

  /**
   * Die drei Kontext-Zustaende, keiner davon still (D13): ein Fehler wird
   * benannt, eine nicht ingestierte Quelle wird benannt, und erfolgreiche
   * Verweise werden als Links gerendert.
   */
  renderBrainContext(result) {
    if (!result) return;
    if (result.error) {
      this.setContext([{ href: '#', label: `Brain: ${result.error}` }]);
      return;
    }
    if (result.uncovered && result.uncovered.length > 0 && (!result.links || result.links.length === 0)) {
      this.setContext([{ href: '#', label: 'Quellen dieses Panels werden nicht ingestiert' }]);
      return;
    }
    if (result.links && result.links.length > 0) {
      this.setContext(result.links);
      return;
    }
    this.setContext([]);
  }

  /** Kontext-Slot füllen — gleicher Vertrag wie panel.js#setContext ({href, label}). */
  setContext(links) {
    const slot = this.container.querySelector('.epic-canvas-context');
    if (!slot) return;
    slot.replaceChildren();
    if (!links || links.length === 0) return;
    for (const link of links) {
      const a = document.createElement('a');
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.label;
      slot.appendChild(a);
    }
  }

  /** Poll beenden, wenn das Panel verschwindet — sonst laeuft er weiter. */
  destroy() {
    if (this.unsubscribeEpics) this.unsubscribeEpics();
    if (this.epicsHandle && window.data && typeof window.data.unsubscribe === 'function') {
      window.data.unsubscribe(this.epicsHandle);
    }
    this.unsubscribeEpics = null;
    this.epicsHandle = null;
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
      <div class="epic-canvas-context"></div>
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
      // Der Export laeuft clientseitig als Datei-Download, nicht ueber eine
      // Schreib-Route.
      //
      // Zwei Gruende. Erstens liegen die Canvas-Daten ohnehin schon im Browser
      // (IndexedDB) — ein Server-Rundlauf haette nichts hinzugefuegt. Zweitens
      // sind die Schreib-Endpunkte des Daemons bewusst Stubs bis K4, und
      // T002505 hat dem Browser die Schreibrechte gezielt entzogen (CORS
      // erlaubt Origin 'null', der Token liegt nur noch in einer 0600-Datei).
      // Eine Route, die von hier aus in openspec/changes/ schreibt, waere genau
      // der Datenvernichter, vor dem OF1 warnt.
      //
      // Die heruntergeladene Datei traegt nur die Teile, die der Canvas selbst
      // verfasst — proposal.md und tasks.md bleiben unberuehrt.
      try {
        const markdown = this.buildExportMarkdown(epic, {
          description: list.querySelector('.epic-desc').value,
          nextStep: list.querySelector('.epic-nextstep').value,
          notes: list.querySelector('.epic-notes').value,
        });
        this.downloadFile(`${epic.id}-canvas.md`, markdown);
        await recordExport(epic.id);
      } catch (e) {
        this.showError(`Export fehlgeschlagen: ${e.message}`);
      }
    };
  }

  /**
   * Rendert die canvas-eigenen Felder als Markdown. Bewusst NUR diese Felder:
   * die Eigentumsgrenze aus OF1 verlaeuft zwischen dem, was der Canvas verfasst,
   * und dem, was Agenten und CI waehrend der Umsetzung an den OpenSpec-Dateien
   * fortschreiben.
   */
  buildExportMarkdown(epic, fields) {
    const lines = [
      `# ${epic.id} — ${epic.title}`,
      '',
      `_Status: ${epic.status} · Prioritaet: ${epic.priority}_`,
      `_Exportiert am ${new Date().toISOString()} aus dem Epic-Canvas (K5)._`,
      '',
      '## Beschreibung',
      '',
      fields.description || '_(leer)_',
      '',
      '## Naechster Schritt',
      '',
      fields.nextStep || '_(leer)_',
      '',
      '## Notizen',
      '',
      fields.notes || '_(leer)_',
      '',
    ];
    return lines.join('\n');
  }

  downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
