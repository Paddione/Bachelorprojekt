---
ticket_id: T000251
status: staged
domains: [brett, frontend]
---

# Plan: brett-coaching-no-combat [T000251]

## Problem

On the mentolder cluster (`BRETT_DEFAULT_MODE=coaching`), four combat elements leak into the coaching room:

1. `#mayhem-btn` (🤸 Mayhem) is **in the static HTML** — flashes visibly before the deferred module script removes it
2. `window.Mayhem.init()` is called **unconditionally** in the inline WS `open` handler (index.html:1222), regardless of mode
3. `window.MayhemControlsPanel?.showDiscoveryBanner()` fires **unconditionally** after every WS connect (index.html:1245)
4. `#brett-controls-btn` (⚙) is **in the static HTML** — opens the Mayhem controls panel in coaching mode

The underlying cause: the inline `<script>` (synchronous) runs before `main.js` (`type="module"`, deferred). Mayhem initializes before mode selection completes.

## Failing Tests

`brett/test/coaching-isolation.test.mjs` — 4 tests, all currently RED.

## Implementation Steps

### Step 1 — `brett/public/index.html`

**1a. Remove static buttons (lines 204–205)**

Delete both lines:
```html
<button id="mayhem-btn" type="button" style="margin-left:8px;">🤸 Mayhem</button>
<button id="brett-controls-btn" type="button" style="margin-left:4px;" title="Steuerung anpassen">⚙</button>
```

**1b. Remove unconditional Mayhem.init() from WS open handler (lines 1221–1230)**

Remove the block:
```javascript
if (window.Mayhem && !window.Mayhem._initialized) {
  window.Mayhem.init({
    scene, camera, canvas: renderer.domElement,
    makeMannequin: (id, pos) => makeMannequin(id, pos),
    sendMessage: mayhemSend,
    roomToken: roomFromUrl,
  });
  window.Mayhem._initialized = true;
}
```

After removal the `open` handler starts with `wsReady = true; ws.send(...)`.

**1c. Remove unconditional discovery banner (line 1245)**

Delete the line:
```javascript
window.MayhemControlsPanel?.showDiscoveryBanner();
```

**1d. Add deferred init bridge (before or after the WS open handler, still inside the inline script)**

Add this block after `connectWS()` is defined (around line 1256, before `connectWS()` is called):
```javascript
// Expose scene context so main.js can init Mayhem after mode selection.
// Called by main.js only when chosen === 'mayhem'.
window.__brettInitMayhem = function () {
  if (!window.Mayhem || window.Mayhem._initialized) return;
  window.Mayhem.init({
    scene, camera, canvas: renderer.domElement,
    makeMannequin: (id, pos) => makeMannequin(id, pos),
    sendMessage: mayhemSend,
    roomToken: roomFromUrl,
  });
  window.Mayhem._initialized = true;
  window.MayhemControlsPanel?.showDiscoveryBanner();
};
```

**1e. Remove orphaned event listeners for the now-dynamic buttons (lines 1258–1261)**

Delete:
```javascript
document.getElementById("mayhem-btn")?.addEventListener("click", () => window.Mayhem?.toggle());
document.getElementById("brett-controls-btn")?.addEventListener("click", () => {
  window.MayhemControlsPanel?.openControlsPanel();
});
```
These will be re-added dynamically in `main.js`.

### Step 2 — `brett/public/assets/main.js`

After the mode is resolved, add the buttons and init Mayhem only when needed:

```javascript
// Remove Mayhem toolbar button when Mayhem is not available on this cluster
if (!cfg.availableModes.includes('mayhem')) {
  document.getElementById('mayhem-btn')?.remove();  // keep for safety during transition
}

const chosen = await showModeSelect(modeState, cfg);

if (chosen === 'mayhem') {
  // Add the Mayhem toolbar buttons dynamically
  const presets = document.getElementById('presets');
  if (presets && !document.getElementById('mayhem-btn')) {
    const mayhemBtn = document.createElement('button');
    mayhemBtn.id = 'mayhem-btn';
    mayhemBtn.type = 'button';
    mayhemBtn.style.marginLeft = '8px';
    mayhemBtn.textContent = '🤸 Mayhem';
    mayhemBtn.addEventListener('click', () => window.Mayhem?.toggle());
    presets.appendChild(mayhemBtn);

    const ctrlBtn = document.createElement('button');
    ctrlBtn.id = 'brett-controls-btn';
    ctrlBtn.type = 'button';
    ctrlBtn.style.marginLeft = '4px';
    ctrlBtn.title = 'Steuerung anpassen';
    ctrlBtn.textContent = '⚙';
    ctrlBtn.addEventListener('click', () => window.MayhemControlsPanel?.openControlsPanel());
    presets.appendChild(ctrlBtn);
  }

  // Init Mayhem (WS is open by this point; if not, __brettInitMayhem is a no-op until WS opens)
  window.__brettInitMayhem?.();
  window.Mayhem?.setEnabled(true);
}
```

Note: The old `document.getElementById('mayhem-btn')?.remove()` line at the top of `main.js` can be removed entirely since the button no longer exists in static HTML.

### Step 3 — Verify tests go GREEN

```bash
node --test brett/test/coaching-isolation.test.mjs
# Expected: 4 PASS
```

### Step 4 — Run full brett test suite

```bash
npm ci --prefix brett && \
node --test brett/test/ws-reconnect.test.mjs \
  brett/test/physics.test.js \
  brett/test/damage.test.mjs \
  brett/test/pickups.test.mjs \
  brett/test/mode-state.test.mjs \
  brett/test/coaching-isolation.test.mjs
```

### Step 5 — Commit, PR, merge, deploy

```bash
git add brett/public/index.html brett/public/assets/main.js brett/test/coaching-isolation.test.mjs
git commit -m "fix(brett): isolate coaching mode — remove combat UI bleed [T000251]"
git push -u origin fix/brett-coaching-no-combat
gh pr create ...
gh pr merge --squash --delete-branch
task feature:brett
```

## Korczewski Regression Check

On korczewski (`BRETT_DEFAULT_MODE=mayhem`):
- User visits brett → fetches `/api/config` → gets `availableModes: ['coaching', 'mayhem']`
- Mode select overlay appears → user clicks Mayhem
- `main.js` runs: adds buttons dynamically, calls `window.__brettInitMayhem?.()` (WS is open by then), calls `window.Mayhem?.setEnabled(true)`
- All combat features work as before

No regression expected. The deferred init bridge is a no-op if called before WS opens (WS opens before user can click in mode select), and WS is guaranteed open by the time main.js mode flow completes.

## Edge Cases

- **Fast connection, single coaching mode (mentolder)**: WS opens while config is still fetching. `open` handler fires, no Mayhem.init call anymore → clean. main.js resolves to coaching → no buttons added, no Mayhem init.
- **Admin joining in spectator mode**: `window._mayhemSpectator` is still set correctly in the open handler (no change to that code path).
- **Browser cache**: Old clients with cached `index.html` will still have the old button. Hard-reload clears this. No server-side workaround needed.
