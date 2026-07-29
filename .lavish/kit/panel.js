class Panel {
  static registry = new Map();

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
  }

  destroy() {
    this.stopPolling();
    if (this.observer) this.observer.disconnect();
  }

  stopPolling() {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  startPolling() {
    if (this.pollTimeout) return;
    this.pollTimeout = setTimeout(() => {
      this.refresh();
      this.startPolling();
    }, this.refreshInterval);
  }

  async refresh() {
    if (this.type === 'canvas' || this.type === 'terminal') return;

    const source = this.el.dataset.source;
    try {
      const result = await window.data[source]();
      this.lastError = null;
      this.isStale = false;
      this.isDisconnected = false;
      this.lastRefresh = new Date();
      this.render(result);
    } catch (e) {
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
    let list = this.body.lastElementChild;
    if (!list || list.tagName !== 'UL') {
      this.body.innerHTML = '';
      const ul = document.createElement('ul');
      this.body.appendChild(ul);
      list = ul;
    }
    
    if (Array.isArray(data)) {
      data.forEach(item => {
        const li = document.createElement('li');
        li.textContent = Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(' | ');
        list.appendChild(li);
      });
    }
    
    // Auto-scroll
    const isAtBottom = this.body.scrollHeight - this.body.scrollTop <= this.body.clientHeight + 100;
    this.body.scrollTop = this.body.scrollHeight;
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
    if (size === 'fullscreen' && window.innerWidth <= 768) {
      const actionBtns = this.el.querySelectorAll('.panel__action-btn');
      actionBtns.forEach(btn => {
        if (btn.dataset.irreversible) btn.disabled = true;
      });
    }
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

  setActionState(state) {
    if (!this.actions) return;
    this.actions.className = `panel__actions panel__actions--${state}`;
  }

  confirmAction(label, target, callback) {
    if (!this.actions) return;
    this.setActionState('confirming');
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Bestätigen';
    confirmBtn.onclick = () => {
      this.setActionState('running');
      callback();
      setTimeout(() => this.setActionState('available'), 2000);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.onclick = () => this.setActionState('available');

    const confirmText = document.createElement('span');
    confirmText.className = 'panel__confirm-target';
    confirmText.textContent = target;

    this.actions.innerHTML = '';
    this.actions.appendChild(confirmText);
    this.actions.appendChild(confirmBtn);
    this.actions.appendChild(cancelBtn);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-panel-type]').forEach(el => {
    try {
      Panel.create(el);
    } catch (e) {
      console.warn('Panel init failed:', e);
    }
  });
});
