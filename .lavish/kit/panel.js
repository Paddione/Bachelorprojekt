class Panel {
  static registry = new Map();

  static get(el) {
    return Panel.registry.get(el);
  }

  static adopt(el) {
    return Panel.get(el) || Panel.create(el);
  }

  static create(el) {
    const type = el.dataset.panelType;
    if (!['status', 'strom', 'canvas', 'terminal'].includes(type)) {
      throw new Error(`Invalid panel type: ${type}`);
    }
    const panel = new Panel(el, type);
    Panel.registry.set(el, panel);
    panel.init();
    return panel;
  }

  constructor(el, type) {
    this.el = el;
    this.type = type;
    this.body = el.querySelector('.panel__body');
    this.head = el.querySelector('.panel__head');
    this.title = el.querySelector('.panel__title');
    this.staleness = el.querySelector('.panel__staleness');
    this.actions = el.querySelector('.panel__actions');
    this.context = el.querySelector('.panel__context');
    this.lastRefresh = null;
    this.lastError = null;
    this.refreshInterval = 30000; // D12 default
    this.pollTimeout = null;
    this.isStale = false;
    this.isDisconnected = false;
    this.observer = null;
    this.canvasData = null;
    this.isModified = false;
    this.actionState = 'available';
    this.unlockToggle = null;
  }

  init() {
    // D11: No poll while hidden
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (this.type === 'status' || this.type === 'strom') {
            this.startPolling();
          }
        } else {
          this.stopPolling();
        }
      });
    }, { threshold: 0.1 });
    this.observer.observe(this.el);

    if (this.type === 'canvas') {
      this.loadCanvas();
    }

    if (this.type === 'status' || this.type === 'strom') {
      this.refresh();
    }

    // D6 (K4): Mobile-Sperre greift nicht nur beim Umschalten, sondern auch,
    // wenn die Seite bereits in Mobilgroesse GELADEN wird — und bei jedem
    // nachfolgenden resize.
    this.applyMobileLock();
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', () => this.applyMobileLock());
    }
  }

  destroy() {
    this.stopPolling();
    if (this.observer) this.observer.disconnect();
    // [T002462] Ein zerstoertes Panel muss aus der statischen Registry fallen —
    // fuer Pop-out und Katalog-Rueckkehr ist ein stehengebliebener Eintrag ein
    // echter Fehler, nicht Kosmetik.
    Panel.registry.delete(this.el);
  }

  stopPolling() {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  startPolling() {
    if (this.pollTimeout) return;
    // T002643 Task 7: Push-versorgte Quellen brauchen keinen eigenen Refresh-Timer —
    // der Stream liefert die Daten automatisch. Ohne diese Prüfung liefen Poll und
    // Push nebeneinander, und das Ergebnis wäre Push *und* Poll statt Push statt Poll.
    if (this.handle && this.handle.pushed === true) return;
    this.pollTimeout = setTimeout(() => {
      this.refresh();
      this.startPolling();
    }, this.refreshInterval);
  }

  async refresh() {
    if (this.type === 'canvas' || this.type === 'terminal') return;

    const source = this.el.dataset.source;
    try {
      const handle = window.data[source]();
      this.handle = handle;
      this.lastError = null;
      this.isStale = false;
      this.isDisconnected = false;
      this.lastRefresh = new Date();
      this.render(handle.data);
      handle.subscribe((freshData) => this.render(freshData));
    } catch {
      this.lastError = new Date();
      this.isStale = true;
      this.renderLastValid();
    }

    this.updateStalenessText();
  }

  render(data) {
    if (!this.body) return;

    // D13: No null/0/dash
    const content = this.type === 'strom' ? this.appendStrom(data) : this.renderContent(data);

    if (content !== null) {
      this.body.innerHTML = '';
      this.body.appendChild(content);
    }
  }

  renderContent(data) {
    const container = document.createElement('div');
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        const list = document.createElement('ul');
        value.forEach(item => {
          const li = document.createElement('li');
          li.textContent = Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(' | ');
          list.appendChild(li);
        });
        container.appendChild(list);
      } else if (typeof value === 'object' && value !== null) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = key;
        details.appendChild(summary);
        const content = document.createElement('div');
        content.textContent = JSON.stringify(value);
        details.appendChild(content);
        container.appendChild(details);
      } else if (value !== null && value !== 0 && value !== '-') {
        const p = document.createElement('p');
        p.textContent = `${key}: ${value}`;
        container.appendChild(p);
      }
    }
    return container;
  }

  appendStrom(data) {
    if (!this.body) return null;

    // K4-Audit (Task 8): der Lese-Endpunkt liefert { entries, fetchedAt }.
    // fetchedAt wird DAUERHAFT angezeigt, nicht nur im Fehlerfall (D12).
    const entries = Array.isArray(data) ? data : (data && Array.isArray(data.entries) ? data.entries : []);
    const fetchedAt = data && !Array.isArray(data) ? data.fetchedAt : undefined;

    let list = this.body.lastElementChild;
    if (!list || list.tagName !== 'UL') {
      this.body.innerHTML = '';
      const ul = document.createElement('ul');
      this.body.appendChild(ul);
      list = ul;
    }

    if (Array.isArray(entries)) {
      // D3-Rail: eine Zeile mit der juengsten Aktion und ihrem Zeitstempel.
      const visible = this.el.classList.contains('panel--rail') ? entries.slice(0, 1) : entries;
      visible.forEach(item => {
        const li = document.createElement('li');
        li.textContent = Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(' | ');
        list.appendChild(li);
      });
    }

    if (fetchedAt) {
      let meta = this.body.querySelector('.panel__fetched-at');
      if (!meta) {
        meta = document.createElement('div');
        meta.className = 'panel__fetched-at';
        this.body.appendChild(meta);
      }
      meta.textContent = `Stand: ${fetchedAt}`;
    }

    // Auto-scroll — aber nur, wenn der Nutzer ohnehin am Ende steht.
    const isAtBottom =
      this.body.scrollHeight - this.body.scrollTop <= this.body.clientHeight + 100;
    if (isAtBottom) {
      this.body.scrollTop = this.body.scrollHeight;
    }
  }

  renderLastValid() {
    if (this.lastRefresh) {
      this.body.innerHTML = `<div class="panel__error">Error loading data.</div>`;
    }
  }

  updateStalenessText() {
    if (!this.staleness) return;
    if (this.isDisconnected) {
      this.staleness.textContent = `Verbindung unterbrochen ${this.lastError}`;
      this.staleness.classList.add('panel__staleness--disconnected');
    } else if (this.isStale) {
      this.staleness.textContent = `veraltet seit ${this.lastRefresh}`;
      this.staleness.classList.add('panel__staleness--stale');
    } else {
      this.staleness.textContent = '';
      this.staleness.classList.remove('panel__staleness--stale', 'panel__staleness--disconnected');
    }
  }

  save() {
    if (this.type === 'canvas') {
      const content = this.body.innerHTML;
      localStorage.setItem(`lavish-canvas-${this.el.id}`, content);
      this.isModified = false;
      this.body.classList.remove('panel__body--modified');
    }
  }

  loadCanvas() {
    if (this.type === 'canvas') {
      const saved = localStorage.getItem(`lavish-canvas-${this.el.id}`);
      if (saved) {
        this.body.innerHTML = saved;
        this.canvasData = saved;
      }
    }
  }

  resize(size) {
    this.el.className = `panel panel--${size}`;
    // D6: Die Sperre haengt nicht am Umschalten auf 'fullscreen', sondern an der
    // aktuellen Darstellung — erneut pruefen.
    this.applyMobileLock();
  }

  // D6: Mobile-Sperre. Nicht umkehrbare Aktionen (Klassifikation aus
  // window.actionPolicy) werden bei mobiler oder Vollbild-Darstellung gesperrt,
  // bis sie in dieser Sitzung bewusst freigeschaltet wurden. Gesperrte Knoepfe
  // bleiben sichtbar (D4), sie werden deaktiviert und als gesperrt markiert.
  applyMobileLock() {
    if (!this.actions || !window.actionPolicy) return;
    const unlockedThisSession =
      typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem(`cockpit-unlock-${this.el.id}`) === '1';
    const viewport = this.currentViewport();
    const lockedButtons = [];

    this.actions.querySelectorAll('[data-action]').forEach(btn => {
      const action = btn.dataset.action;
      const locked = window.actionPolicy.mobileLock(action, { viewport, unlockedThisSession });
      btn.disabled = locked;
      btn.classList.toggle('panel__action-btn--locked', locked);
      if (locked) lockedButtons.push(btn);
    });

    this.renderUnlockToggle(lockedButtons.length > 0, unlockedThisSession);
  }

  currentViewport() {
    const isMobileViewport =
      typeof window !== 'undefined' && window.innerWidth <= 768;
    if (isMobileViewport) return 'mobile';
    if (this.el.classList.contains('panel--fullscreen')) return 'fullscreen';
    return 'card';
  }

  renderUnlockToggle(anyLocked, unlockedThisSession) {
    if (!this.actions) return;
    if (!anyLocked) {
      if (this.unlockToggle) {
        this.unlockToggle.remove();
        this.unlockToggle = null;
      }
      return;
    }
    if (unlockedThisSession) return;
    if (this.unlockToggle) return;

    const btn = document.createElement('button');
    btn.className = 'panel__action-btn panel__unlock-btn';
    btn.textContent = 'Freischalten';
    btn.onclick = () => {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`cockpit-unlock-${this.el.id}`, '1');
      }
      this.applyMobileLock();
    };
    this.actions.appendChild(btn);
    this.unlockToggle = btn;
  }

  setContext(links) {
    if (!this.context) return;
    this.context.innerHTML = '';
    if (!links || links.length === 0) {
      this.context.innerHTML = '';
    } else {
      links.forEach(link => {
        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.textContent = link.label;
        this.context.appendChild(a);
      });
    }
  }

  // D4: Vier Zustände. Der Zustand wird gegen window.actionPolicy.ACTION_STATES
  // validiert (ungueltig → Fehler statt stiller Klasse), auf this.actionState
  // gehalten und als data-action-state am Slot gespiegelt. `locked` bleibt
  // SICHTBAR: Knoepfe werden deaktiviert und als gesperrt markiert, nicht
  // ausgeblendet — sonst ist nicht unterscheidbar, ob eine Aktion fehlt oder
  // nur nicht freigeschaltet ist.
  setActionState(state) {
    if (!window.actionPolicy || !window.actionPolicy.ACTION_STATES.includes(state)) {
      throw new Error(`setActionState: unknown action state '${state}'`);
    }
    this.actionState = state;
    if (!this.actions) return;
    this.actions.className = `panel__actions panel__actions--${state}`;
    this.actions.dataset.actionState = state;
    if (state === 'locked') {
      this.actions.querySelectorAll('.panel__action-btn').forEach(btn => {
        if (!btn.classList.contains('panel__unlock-btn')) btn.disabled = true;
      });
    } else {
      // Re-enable, damit die D6-Mobile-Sperre (falls aktiv) neu bewertet wird.
      this.applyMobileLock();
    }
  }

  // D5: Gestufte Bestätigung. Die Entscheidung kommt aus
  // window.actionPolicy.confirmationFor(action, target):
  // - null            → keine Rückfrage, callback läuft direkt
  // - {level:'simple'}→ schlichte Bestätigen/Abbrechen-Rückfrage
  // - {level:'named'} → Rückfrage, die das konkrete Ziel nennt
  //
  // K4-Defekt 1: kein blinder setTimeout — der callback gibt ein Promise
  // zurueck, der Zustand wechselt erst nach dessen Aufloesung.
  confirmAction(action, target, callback) {
    if (!this.actions) return;
    const decision = window.actionPolicy.confirmationFor(action, target);

    const run = async () => {
      this.setActionState('running');
      try {
        await callback();
        this.setActionState('available');
      } catch (e) {
        this.setActionState('available');
        this.showActionError(e);
      }
    };

    if (decision === null) {
      run();
      return;
    }

    this.setActionState('confirming');

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Bestätigen';
    confirmBtn.onclick = () => {
      run();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.onclick = () => this.setActionState('available');

    const confirmText = document.createElement('span');
    confirmText.className = 'panel__confirm-target';
    if (decision.level === 'named') {
      confirmText.textContent = decision.target;
    } else {
      confirmText.textContent = target ?? '';
    }

    this.actions.innerHTML = '';
    this.actions.appendChild(confirmText);
    this.actions.appendChild(confirmBtn);
    this.actions.appendChild(cancelBtn);
  }

  showActionError(e) {
    const msg = (e && e.message) || String(e);
    let errorEl = this.actions && this.actions.querySelector('.panel__action-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'panel__action-error';
      if (this.actions) this.actions.appendChild(errorEl);
    }
    errorEl.textContent = `Fehler: ${msg}`;
  }
}

// Kit-Muster: jedes Modul haengt seinen Einstieg ans Fenster (window.actionPolicy,
// window.data, window.cockpitLayout). Bei `class Panel` ist das nicht optional,
// sondern noetig: eine Klassendeklaration auf oberster Ebene eines klassischen
// Skripts landet in der globalen LEXIKALISCHEN Umgebung und erzeugt — anders als
// `var` — keine Eigenschaft auf `window`. Ohne diese Zeile ist `window.Panel`
// undefined und jeder Wachter in layout.js schlaegt still fehl. [T002462]
window.Panel = Panel;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-panel-type]').forEach(el => {
    try {
      Panel.create(el);
    } catch (e) {
      console.warn('Panel init failed:', e);
    }
  });
});
