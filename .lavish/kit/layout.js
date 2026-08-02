// .lavish/kit/layout.js — SDLC Cockpit Layout-Engine (K3, T002462)
//
// Klassisches Skript ohne import/export, ohne npm-Abhaengigkeit, ohne
// Bundler-Schritt (D1). Wird per <script src> geladen und muss auch von file://
// funktionieren. Setzt `window.cockpitLayout`.
//
// K4-Schnittstelle (Task 1, Stand 2026-08-02): `action-policy.js` liegt NICHT
// auf main (K4 = T002463 laeuft parallel). Deshalb baut K3 gegen die von K4s
// Plan festgelegte Schnittstelle:
//   window.actionPolicy = {
//     ACTION_STATES: ['available','locked','confirming','running'],
//     classify(action)          -> 'repeatable' | 'reversible' | 'irreversible'
//     confirmationFor(action, target) -> null | {level:'simple'} | {level:'named', target}
//     mobileLock(action, { viewport, unlockedThisSession }) -> boolean
//   }
// K3 nutzt davon ausschliesslich mobileLock und reicht `unlockedThisSession`
// durch (die sitzungsweise Freischaltung legt K4 in sessionStorage ab).
// Liegt window.actionPolicy nicht vor, sperrt mobileGate fail-closed mit Grund
// 'action-policy-missing'. Beim Zusammenfuehren beider PRs muss nur geprueft
// werden, dass mobileLock diese Signatur tatsaechlich hat.

(function () {
  'use strict';

  var RAIL_GROUPS = Object.freeze([
    { id: 'epics', label: 'Laufende Epics' },
    { id: 'attention', label: 'Was Aufmerksamkeit braucht' },
    { id: 'agents', label: 'Aktive Agenten' },
    { id: 'models', label: 'Modell-Server' },
  ]);

  var MOBILE_BREAKPOINT = 768;

  // Ausdruecklich wiederholbare Aktionen (D5). Alles andere gilt ohne
  // actionPolicy als nicht umkehrbar — die sichere Richtung (Task 1).
  var REPEATABLE_ACTIONS = ['refresh', 'reconcile', 'tick', 'enqueue'];

  var LAYOUT_KEY = 'lavish-layout-v1';
  var LAYOUT_VERSION = 1;
  var MAX_CARDS = 3;

  // ------------------------------------------------------------------
  // Task 1 — mobileGate: einzige Indirektion auf K4s mobileLock
  // ------------------------------------------------------------------

  function mobileGate(action, ctx) {
    ctx = ctx || {};
    var policy = window.actionPolicy;
    if (policy && typeof policy.mobileLock === 'function') {
      var locked = policy.mobileLock(action, {
        viewport: ctx.viewport,
        unlockedThisSession: ctx.unlockedThisSession || false,
      });
      return { locked: !!locked, reason: locked ? 'action-policy' : null };
    }
    var repeatable = REPEATABLE_ACTIONS.indexOf(action) !== -1;
    return { locked: !repeatable, reason: repeatable ? null : 'action-policy-missing' };
  }

  // ------------------------------------------------------------------
  // Task 3 — computePlacement: DOM-freie Platzierungsrechnung
  // ------------------------------------------------------------------

  // state: { panels: [{id,type}], viewport: 'desktop'|'mobile', fullscreen: id|null }
  // Rückgabe: { workspace: [{id,size}], catalog: [id], locked: [{id,reason}],
  //             rail: { mode: 'column'|'topbar-sheet', groups } }
  function computePlacement(state) {
    state = state || {};
    var panels = state.panels || [];
    var viewport = state.viewport === 'mobile' ? 'mobile' : 'desktop';
    var fullscreen = state.fullscreen || null;
    var mobile = viewport === 'mobile';

    var workspace = [];
    var catalog = [];
    var locked = [];

    panels.forEach(function (p) {
      if (mobile && p.type === 'terminal') {
        // D8: sichtbar gesperrt, nicht still versteckt. Der Grund ist Teil
        // der Aussage — ein Lock ohne Grund waere fuer den Nutzer unsichtbar.
        locked.push({ id: p.id, reason: 'terminal-locked-on-mobile' });
      }
    });

    if (fullscreen) {
      var target = null;
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].id === fullscreen) { target = panels[i]; break; }
      }
      if (target && !(mobile && target.type === 'terminal')) {
        workspace.push({ id: target.id, size: 'fullscreen' });
      }
      panels.forEach(function (p) {
        if (p.id === fullscreen) return;
        if (mobile && p.type === 'terminal') return;
        catalog.push(p.id);
      });
    } else if (mobile) {
      // Ein-Panel-Stack: genau das erste nicht gesperrte Panel in Vollfläche.
      var first = null;
      for (var j = 0; j < panels.length; j++) {
        if (panels[j].type === 'terminal') continue;
        first = panels[j]; break;
      }
      if (first) workspace.push({ id: first.id, size: 'fullscreen' });
      panels.forEach(function (p) {
        if (first && p.id === first.id) return;
        if (p.type === 'terminal') return;
        catalog.push(p.id);
      });
    } else {
      var cards = 0;
      for (var k = 0; k < panels.length && cards < MAX_CARDS; k++) {
        workspace.push({ id: panels[k].id, size: 'card' });
        cards++;
      }
      for (var m = cards; m < panels.length; m++) {
        catalog.push(panels[m].id);
      }
    }

    return {
      workspace: workspace,
      catalog: catalog,
      locked: locked,
      rail: {
        mode: mobile ? 'topbar-sheet' : 'column',
        groups: RAIL_GROUPS,
      },
    };
  }

  // ------------------------------------------------------------------
  // Task 4 — Persistenz ueber eigenen localStorage-Schluessel
  // ------------------------------------------------------------------

  function serializeLayout(state) {
    state = state || {};
    return JSON.stringify({
      version: LAYOUT_VERSION,
      workspace: state.workspace || [],
      fullscreen: state.fullscreen || null,
      catalog: state.catalog || [],
    });
  }

  // raw: JSON-Zeichenkette (oder null). knownPanelIds: Array der aktuell
  // vorhandenen Panel-Kennungen. Stoerung (fehlend, unparsbar, unbekannte
  // Version) -> Standardanordnung { workspace:[], fullscreen:null, catalog:
  // knownPanelIds }. Es werden dabei KEINE localStorage-Schluessel gelesen
  // oder geschrieben — insbesondere keine `lavish-canvas-*`-Schluessel.
  function restoreLayout(raw, knownPanelIds) {
    knownPanelIds = knownPanelIds || [];
    var parsed = null;
    if (typeof raw === 'string' && raw.length > 0) {
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    }
    if (!parsed || parsed.version !== LAYOUT_VERSION) {
      return { workspace: [], fullscreen: null, catalog: knownPanelIds.slice() };
    }
    var known = {};
    knownPanelIds.forEach(function (id) { known[id] = true; });
    return {
      workspace: (parsed.workspace || []).filter(function (id) { return known[id]; }),
      fullscreen: known[parsed.fullscreen] ? parsed.fullscreen : null,
      catalog: (parsed.catalog || []).filter(function (id) { return known[id]; }),
    };
  }

  function saveLayout(state) {
    try {
      window.localStorage.setItem(LAYOUT_KEY, serializeLayout(state));
    } catch (e) { /* localStorage nicht verfügbar (file:// Privacy) */ }
  }

  function loadLayout(knownPanelIds) {
    var raw = null;
    try { raw = window.localStorage.getItem(LAYOUT_KEY); } catch (e) { raw = null; }
    return restoreLayout(raw, knownPanelIds);
  }

  // ------------------------------------------------------------------
  // Task 5 — DOM-Schicht (dokumentiert im Implementierungs-Modul)
  // Die DOM-Funktionen werden unten in initLayout() aufgebaut.
  // ------------------------------------------------------------------

  var cockpitLayout = {
    RAIL_GROUPS: RAIL_GROUPS,
    mobileGate: mobileGate,
    computePlacement: computePlacement,
    serializeLayout: serializeLayout,
    restoreLayout: restoreLayout,
    saveLayout: saveLayout,
    loadLayout: loadLayout,
  };

  // RAIL_GROUPS ist auch als Property nicht überschreibbar: Es gibt keinen Weg,
  // die vier D7-Gruppen zu ersetzen oder umzustellen (E3, D7). Der Test "es gibt
  // keinen Schluessel, der die Gruppen setzt" misst genau das.
  Object.defineProperty(cockpitLayout, 'RAIL_GROUPS', { writable: false });

  // Export: klassisches Skript, das window.cockpitLayout setzt. `window` ist im
  // Testlauf der injizierte Parameter von `new Function('window', src)`, im
  // Browser das globale Fenster — beide Male die richtige Stelle.
  window.cockpitLayout = cockpitLayout;

  // DOM-Schicht aus Task 5 — Katalog, Ziehen, Pop-out, Vollfläche, Mobil.
  // Wird nur aufgebaut, wenn ein Document existiert (file:// und Admin-Hülle).
  function initLayout() {
    if (typeof document === 'undefined') return;

    var focusEl = document.querySelector('.cockpit-focus');
    var workspaceEl = document.querySelector('.cockpit-workspace');
    if (!focusEl || !workspaceEl) return;

    var isMobile = function () { return window.innerWidth <= MOBILE_BREAKPOINT; };

    // --- Rail-Gruppen (D7, unveränderlich) ---
    // Die vier Gruppenköpfe stehen STATISCH im Markup beider Hüllen
    // (layout-rail-fixed.bats misst das). RAIL_GROUPS oben ist die eingefrorene
    // Konstante, gegen die computePlacement arbeitet; die Hüllen dürfen keine
    // eigene Steuerung einführen (kein data-Attribut, kein Konfigurationsschlüssel).
    // Hier wird nur sichergestellt, dass die vier Gruppen im DOM vorhanden sind —
    // eine Hülle ohne sie ist ein Verdrahtungsfehler, kein Gestaltungsspielraum.

    // --- Fokus-Spalte / Arbeitsbereich aus vorhandenem Markup ---
    var allPanels = [].slice.call(document.querySelectorAll('[data-panel-type]'));
    var workspacePanels = [].slice.call(workspaceEl.querySelectorAll('[data-panel-type]'));
    var catalogEl = document.querySelector('.cockpit-catalog');
    if (!catalogEl) {
      catalogEl = document.createElement('aside');
      catalogEl.className = 'cockpit-catalog';
      workspaceEl.parentNode.insertBefore(catalogEl, workspaceEl);
    }

    var knownIds = allPanels.map(function (el) { return el.id; });

    // --- Panel-Zustand: wo steht welches Panel ---
    var placement = { workspace: [], catalog: [], fullscreen: null };

    function panelById(id) {
      for (var i = 0; i < allPanels.length; i++) {
        if (allPanels[i].id === id) return allPanels[i];
      }
      return null;
    }

    function movePanelToWorkspace(el) {
      if (el.parentNode !== workspaceEl) workspaceEl.appendChild(el);
      el.classList.remove('panel--rail', 'panel--card', 'panel--fullscreen');
      el.classList.add('panel--card');
      var panel = window.Panel && Panel.get(el);
      if (panel) panel.resize('card');
    }

    function movePanelToCatalog(el) {
      if (el.parentNode !== catalogEl) catalogEl.appendChild(el);
      el.classList.remove('panel--card', 'panel--fullscreen');
      el.classList.add('panel--rail');
      var panel = window.Panel && Panel.get(el);
      if (panel) panel.resize('rail');
    }

    function applyPlacement(computed) {
      computed.workspace.forEach(function (p) {
        var el = panelById(p.id);
        if (!el) return;
        if (p.size === 'fullscreen') {
          if (el.parentNode !== workspaceEl) workspaceEl.appendChild(el);
          el.classList.remove('panel--rail', 'panel--card');
          el.classList.add('panel--fullscreen');
          var panel = window.Panel && Panel.get(el);
          if (panel) panel.resize('fullscreen');
        } else {
          movePanelToWorkspace(el);
        }
      });
      computed.catalog.forEach(function (id) {
        var el = panelById(id);
        if (el) movePanelToCatalog(el);
      });
      computed.locked.forEach(function (l) {
        var el = panelById(l.id);
        if (el) {
          el.classList.add('panel--locked');
          el.dataset.lockReason = l.reason;
        }
      });
    }

    function recompute() {
      var panels = allPanels.map(function (el) {
        return { id: el.id, type: el.dataset.panelType };
      });
      var computed = computePlacement({
        panels: panels,
        viewport: isMobile() ? 'mobile' : 'desktop',
        fullscreen: placement.fullscreen,
      });
      applyPlacement(computed);
    }

    // --- Persistenz der Anordnung ---
    function persist() {
      placement.workspace = [].slice.call(workspaceEl.querySelectorAll('[data-panel-type]'))
        .filter(function (el) { return !el.classList.contains('panel--fullscreen'); })
        .map(function (el) { return el.id; });
      placement.fullscreen = (function () {
        var fs = workspaceEl.querySelector('.panel--fullscreen');
        return fs ? fs.id : null;
      })();
      saveLayout({
        workspace: placement.workspace,
        fullscreen: placement.fullscreen,
        catalog: placement.catalog,
      });
    }

    function restore() {
      var restored = loadLayout(knownIds);
      if (restored.workspace.length > 0) {
        placement.fullscreen = restored.fullscreen;
        placement.workspace = restored.workspace;
        // Anordnung anwenden: Workspace-Panels einordnen, Rest in Katalog.
        restored.workspace.forEach(function (id) {
          var el = panelById(id);
          if (el) movePanelToWorkspace(el);
        });
        restored.catalog.forEach(function (id) {
          var el = panelById(id);
          if (el) movePanelToCatalog(el);
        });
      }
      recompute();
    }

    // --- Ziehen per Pointer Events (E3, Pointer-based rearrangement) ---
    var drag = null;
    var preDragParent = null;

    document.addEventListener('pointerdown', function (e) {
      var head = e.target.closest ? e.target.closest('.panel__head') : null;
      if (!head) return;
      var panelEl = head.closest('[data-panel-type]');
      if (!panelEl) return;
      if (e.target.closest('button, a, input, [data-no-drag]')) return;

      drag = {
        el: panelEl,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        preDragParent: panelEl.parentNode,
      };
      panelEl.setPointerCapture(e.pointerId);
      panelEl.dataset.dragging = 'true';
      e.preventDefault();
    });

    document.addEventListener('pointermove', function (e) {
      if (!drag || !drag.moved) return;
      var rect = workspaceEl.getBoundingClientRect();
      var inWorkspace = e.clientX >= rect.left && e.clientX <= rect.right &&
                        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inWorkspace && drag.el.parentNode !== workspaceEl) {
        workspaceEl.appendChild(drag.el);
        var panel = window.Panel && Panel.get(drag.el);
        if (panel) panel.resize('card');
      } else if (!inWorkspace && drag.el.parentNode !== catalogEl) {
        catalogEl.appendChild(drag.el);
        var p2 = window.Panel && Panel.get(drag.el);
        if (p2) p2.resize('rail');
      }
    });

    document.addEventListener('pointerup', function (e) {
      if (!drag) return;
      var el = drag.el;
      delete el.dataset.dragging;
      drag = null;
      persist();
      recompute();
    });

    document.addEventListener('pointercancel', function (e) {
      if (!drag) return;
      var el = drag.el;
      delete el.dataset.dragging;
      if (drag.preDragParent) drag.preDragParent.appendChild(el);
      drag = null;
      recompute();
    });

    // --- Pop-out (E3): eigenes Fenster, BroadcastChannel-Rückkehr ---
    var popChannel = null;
    try {
      popChannel = new BroadcastChannel('cockpit-panels');
    } catch (e) { popChannel = null; }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.panel__action-btn[data-pop-out]') : null;
      if (!btn) return;
      var panelEl = btn.closest('[data-panel-type]');
      if (!panelEl) return;
      var panel = window.Panel && Panel.get(panelEl);
      if (panel) panel.destroy();
      movePanelToCatalog(panelEl);
      var url = location.href.split('#')[0] + '#' + panelEl.id;
      window.open(url, '_blank', 'width=800,height=600');
      if (popChannel) {
        popChannel.postMessage({ type: 'panel-popped', id: panelEl.id });
      }
      persist();
    });

    if (popChannel) {
      popChannel.addEventListener('message', function (ev) {
        if (ev.data && ev.data.type === 'panel-return' && ev.data.id) {
          var el = panelById(ev.data.id);
          if (el) {
            var panel = window.Panel && Panel.adopt(el);
            if (panel) panel.resize('card');
            movePanelToWorkspace(el);
            persist();
            recompute();
          }
        }
      });
    }

    // --- Vollfläche (E7): ein Zustand, zwei Layouts ---
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-fullscreen]') : null;
      if (!btn) return;
      var panelEl = btn.closest('[data-panel-type]');
      if (!panelEl) return;
      if (panelEl.classList.contains('panel--fullscreen')) {
        placement.fullscreen = null;
        movePanelToWorkspace(panelEl);
      } else {
        placement.fullscreen = panelEl.id;
        if (panelEl.parentNode !== workspaceEl) workspaceEl.appendChild(panelEl);
        panelEl.classList.remove('panel--rail', 'panel--card');
        panelEl.classList.add('panel--fullscreen');
        var panel = window.Panel && Panel.get(panelEl);
        if (panel) panel.resize('fullscreen');
      }
      persist();
      recompute();
    });

    window.addEventListener('resize', function () {
      recompute();
    });

    restore();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLayout);
    } else {
      initLayout();
    }
  }
})();
