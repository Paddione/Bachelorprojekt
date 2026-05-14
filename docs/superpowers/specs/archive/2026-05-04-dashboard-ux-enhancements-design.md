# Dashboard UX Enhancements — Design Spec

**Date:** 2026-05-04  
**Scope:** `dashboard/web/public/` — vanilla JS + CSS only, no server changes  
**Branch:** new feature branch off `main`

---

## Goals

1. Language switch (EN ↔ DE) — no persistence, resets on reload
2. Tab group visibility and ordering via a settings gear panel
3. Resizable log panel — drag top edge upward to reveal more lines
4. Copy log to clipboard button

---

## Architecture

All changes are confined to three files:

| File | Changes |
|---|---|
| `dashboard/web/public/index.html` | Remove hardcoded `<nav>` tab buttons; add `⚙` settings button and `EN/DE` lang toggle to topbar |
| `dashboard/web/public/app.js` | Add `TRANSLATIONS`, `t()`, `state.tabs`, `state.lang`, `state.settingsOpen`; add `renderNav()`, `renderSettings()`; update `renderLogs()` for resize handle + copy; replace all hardcoded strings with `t()` |
| `dashboard/web/public/style.css` | Add `.settings-panel`, `.log-handle`, `.lang-toggle` styles |

No server (`server.js`) or manifest changes required.

---

## State

```js
const state = {
  tab: 'tickets',
  context: 'mentolder',
  ticketId: null,
  filter: { status: '', category: '', q: '' },
  pollTimer: null,
  // new
  lang: 'en',
  settingsOpen: false,
  tabs: [
    { id: 'tickets', labelKey: 'tab_tickets', visible: true },
    { id: 'pods',    labelKey: 'tab_pods',    visible: true },
    { id: 'logs',    labelKey: 'tab_logs',    visible: true },
    { id: 'argocd',  labelKey: 'tab_argocd',  visible: true },
  ],
};
```

`state.tabs` is the authoritative ordered list. Visibility and order mutate this array in-place; `renderNav()` reflects it.

---

## 1. Language (EN ↔ DE)

### Translation dictionary

```js
const TRANSLATIONS = {
  en: {
    tab_tickets: 'Tickets',
    tab_pods:    'Pods & services',
    tab_logs:    'Logs',
    tab_argocd:  'ArgoCD',
    btn_refresh: 'refresh',
    btn_fetch:   'fetch',
    btn_copy:    'Copy',
    btn_copied:  'Copied ✓',
    btn_filter:  'filter',
    btn_comment: 'comment',
    btn_resolve: 'resolve',
    btn_reopen:  'reopen',
    btn_archive: 'archive',
    btn_back:    '← back',
    label_cluster: 'cluster:',
    col_name:    'name',   col_phase:   'phase',
    col_restarts:'restarts', col_node:  'node',
    col_app:     'app',    col_sync:    'sync',
    col_health:  'health', col_cluster: 'cluster',
    col_id:      'id',     col_status:  'status',
    col_category:'category', col_created:'created',
    col_desc:    'description',
    ph_pod:      'pod name (exact)',
    ph_search:   'search…',
    ph_comment:  'leave a comment…',
    status_all:  'all',
    loading:     'loading…',
    no_logs:     '(no logs yet)',
    fetching:    'fetching…',
    settings_title: 'Settings',
    settings_tabs:  'Tabs',
    ticket_not_found: 'ticket not found',
    resolution_note: 'Resolution note:',
    reopen_reason:   'Reopen reason:',
    archive_confirm: 'Archive this ticket?',
  },
  de: {
    tab_tickets: 'Tickets',
    tab_pods:    'Pods & Dienste',
    tab_logs:    'Logs',
    tab_argocd:  'ArgoCD',
    btn_refresh: 'Aktualisieren',
    btn_fetch:   'Abrufen',
    btn_copy:    'Kopieren',
    btn_copied:  'Kopiert ✓',
    btn_filter:  'Filtern',
    btn_comment: 'Kommentar',
    btn_resolve: 'Schließen',
    btn_reopen:  'Wieder öffnen',
    btn_archive: 'Archivieren',
    btn_back:    '← Zurück',
    label_cluster: 'Cluster:',
    col_name:    'Name',     col_phase:   'Phase',
    col_restarts:'Neustarts', col_node:   'Node',
    col_app:     'App',      col_sync:    'Sync',
    col_health:  'Status',   col_cluster: 'Cluster',
    col_id:      'ID',       col_status:  'Status',
    col_category:'Kategorie', col_created:'Erstellt',
    col_desc:    'Beschreibung',
    ph_pod:      'Pod-Name (exakt)',
    ph_search:   'Suchen…',
    ph_comment:  'Kommentar schreiben…',
    status_all:  'alle',
    loading:     'Wird geladen…',
    no_logs:     '(noch keine Logs)',
    fetching:    'Wird abgerufen…',
    settings_title: 'Einstellungen',
    settings_tabs:  'Tabs',
    ticket_not_found: 'Ticket nicht gefunden',
    resolution_note: 'Lösungshinweis:',
    reopen_reason:   'Grund für Wiedereröffnung:',
    archive_confirm: 'Dieses Ticket archivieren?',
  },
};

function t(key) { return TRANSLATIONS[state.lang][key] ?? key; }
```

### Toggle button

Two inline buttons `EN` / `DE` in the topbar (`.lang-toggle`). Active lang gets `.active` class. Clicking the inactive one sets `state.lang` and calls `renderNav()` + `render()`.

---

## 2. Tab visibility & ordering

### `renderNav()`

Replaces the static `$$('#tabs button').forEach(...)` bootstrap. Rebuilds the `<nav id="tabs">` from `state.tabs`, rendering only `visible: true` entries. If `state.tab` is no longer visible after a settings change, it falls back to the first visible tab.

### Settings gear panel

`⚙` button in topbar toggles `state.settingsOpen`. When `true`, a `div.settings-panel` is appended to `<body>` (absolutely positioned, right-aligned below topbar). It is removed when closed.

Panel contents:
- Heading: `t('settings_title')`
- Subheading: `t('settings_tabs')`
- For each entry in `state.tabs`, one row:
  - `<input type="checkbox">` bound to `tab.visible`
  - Label (translated tab name)
  - `↑` button (disabled if first) — swaps with previous entry
  - `↓` button (disabled if last) — swaps with next entry
- Each interaction mutates `state.tabs` and calls `renderNav()`

Click-outside closes the panel: a `pointerdown` listener on `document` that checks if the click target is outside both the panel and the `⚙` button.

---

## 3. Resizable log panel

`renderLogs()` builds this DOM structure:

```
div
  div.row                 ← [pod input] [Fetch] [Copy]
  div.log-container
    div.log-handle        ← 6px drag strip, cursor: ns-resize
    pre.logs              ← initial height: 40vh, min-height: 120px
```

The input/button row stays above the container. The handle sits at the top of the log area so dragging it upward naturally expands the pre below it.

Drag logic on `log-handle`:
- `pointerdown`: capture pointer, record `startY` and `startHeight`
- `pointermove`: `newHeight = startHeight - (e.clientY - startY)` — dragging up increases height
- `pointerup` / `pointercancel`: release capture

No max-height constraint (removed from CSS for `.logs` when inside a container).

---

## 4. Copy log to clipboard

A `Copy` button sits in the `.row` next to `Fetch`. On click:

```js
navigator.clipboard.writeText(pre.textContent).then(() => {
  copyBtn.textContent = t('btn_copied');
  setTimeout(() => { copyBtn.textContent = t('btn_copy'); }, 1500);
});
```

The button is disabled (greyed out) when `pre.textContent === t('no_logs')` or `t('fetching')`.

---

## CSS additions

```css
.lang-toggle { display: flex; gap: .25rem; }
.lang-toggle button { /* same base as .btn */ padding: .25rem .5rem; }
.lang-toggle button.active { background: #3a4252; }

.settings-panel {
  position: fixed; top: 2.75rem; right: 1rem; z-index: 100;
  background: #161b22; border: 1px solid #3a4252; border-radius: 6px;
  padding: .75rem 1rem; min-width: 220px;
}
.settings-panel .tab-row { display: flex; align-items: center; gap: .4rem; margin: .3rem 0; }
.settings-panel .tab-row label { flex: 1; }

.log-container { display: flex; flex-direction: column; gap: 0; }
.log-handle {
  height: 6px; background: #2a313c; cursor: ns-resize; border-radius: 3px 3px 0 0;
}
.log-handle:hover { background: #3a4252; }
.logs { /* remove max-height when inside .log-container */ }
```

---

## Out of scope

- Persisting preferences (localStorage) — explicitly excluded per design decision
- Adding new tabs or changing tab functionality
- Server-side changes

---

## Files changed

- `dashboard/web/public/index.html` — remove hardcoded nav buttons, add lang toggle + gear button
- `dashboard/web/public/app.js` — all logic changes
- `dashboard/web/public/style.css` — new rules for settings panel, log handle, lang toggle
