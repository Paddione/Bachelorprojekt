---
title: Systembrett — Production-Readiness & Mentolder Voll-Rebrand Implementation Plan
ticket_id: T000540
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Systembrett — Production-Readiness & Mentolder Voll-Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **AUTONOMOUS-EXECUTOR NOTE (Software Factory / DeepSeek):** This plan is written for mechanical execution. Every task gives the EXACT file, line range, and the EXACT strings/CSS/TS to write. Do NOT redesign, do NOT invent values, do NOT "improve" anything beyond what is written. The visual source of truth is the committed design asset `docs/superpowers/specs/assets/2026-06-08-brett-menu-final.html` — when in doubt about a menu value, copy it verbatim from there.

**Goal:** Make Systembrett (`brett/`) production-ready and fully Mentolder-branded by eliminating the legacy token vocabulary, unifying the menu/lobby/board chrome onto the `--brett-*` design system, adding accessibility/connection-status/toast infrastructure, building a live "Offene Sessions" list (frontend + new read endpoint), and shipping a German "Sitzen" pose preset.

**Architecture:** brett is a single-page TS app: server (`brett/src/server/**`, Express + ws) + client (`brett/src/client/**`, Vite + Three.js). The GUI is already token-driven via `brett/src/client/ui/theme.ts` (SSOT). This work is **drift cleanup + veneer + production-readiness + one additive endpoint + one additive pose** — no change to the 3D scene/physics/IK or the WS protocol beyond the additive read endpoint and additive pose. New units are pure-first (view-model/data functions separated from DOM) so they are node-testable.

**Tech Stack:** TypeScript, Vite 5, Express, `ws`, `node:test` via `tsx --test` (offline unit tests), Playwright (E2E, post-deploy), Kustomize/Taskfile (`task feature:brett`).

---

## Conventions & Footguns (read before any task)

- **Token SSOT is `brett/src/client/ui/theme.ts`.** Never hardcode a color/line/font outside it. CSS uses `var(--brett-*)`. Canvas/SVG (which cannot use `var()`) resolves via `resolveToken(name, fallback, getVar)` from `brett/src/client/ui/skin.ts`.
- **`:latest` image is intentional** (`k3d/brett.yaml`). Do not pin a digest. Deploy via `task feature:brett`.
- **`prefers-reduced-motion`** must disable all CSS animations (grain/glow/constellation/pulse).
- **Do NOT touch the 3D scene/physics/IK** (`scene.ts`, `mannequin.ts`, `ground-objects.ts`, `free-fly-camera.ts`, `pov-camera.ts`, `replay-engine.ts`, `scene-lines.ts`). The only additive scene-adjacent change is the new `sitzen` pose map (Task P) and resolving canvas colors via tokens (Task C).
- **Tests run with `MOCK_DB=true`** (see `brett/package.json` `"test"` script: `MOCK_DB=true tsx --test test/*.test.ts test/*.test.js test/*.test.mjs`). Place every new unit test in `brett/test/*.test.ts` using `node:test` + `node:assert/strict` (match existing style, e.g. `brett/test/menu-model.test.ts`).
- **First-time setup (run once before any test step):** `npm ci --prefix brett` (installs deps incl. `tsx`).
- **Single-file test run:** `npm --prefix brett test` runs the WHOLE suite (the script globs `test/*.test.ts`). To run ONE file use `MOCK_DB=true npm --prefix brett exec -- tsx --test test/<file>.test.ts` (run from repo root). The final-gate command (Task V) is plain `npm --prefix brett test`.
- **CI gates** (must all be green): `npm --prefix brett run typecheck`, `npm --prefix brett test`, `npm --prefix brett run build`, and repo-level `task test:all`. The systembrett-template shell test (`scripts/tests/systembrett-template.test.sh`) also runs in CI.
- **Existing token tests are keyed on the LEGACY vocabulary** (`brett/test/facelift-tokens.test.ts` asserts `var(--slate-1`, `var(--brass`, `var(--parchment` and `brett/test/no-hardcoded-brand-css.test.ts` asserts `var(--brett-*`). When you migrate a region to `--brett-*`, you MUST update the corresponding assertions in those tests in the SAME task or `npm test` fails. Each task that edits inline CSS regions calls this out explicitly.
- **`facelift-tokens.test.ts` permits a hex literal ONLY as the fallback in `var(--token, #hex)`.** When you replace a region's tokens, keep that form: `var(--brett-ink-900, #0b111c)`, etc. The plan always shows the `var(--brett-…, #fallback)` form so this stays satisfied.
- **`applyPreset` (client `presets.ts`) iterates EVERY `BONE_NAMES` entry** (`hips, head, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle`) and reads `p[name].x`/`p[name].z`. The new `sitzen` preset MUST define all 14 bones or it throws at runtime.
- **The server has NO `requireAuth` middleware** — only `auth.requireAdmin` (`brett/src/server/auth.ts:72`). Task G adds a `requireAuth`.
- **The session data model has NO title field.** `title` in the `/api/sessions/open` shape is DERIVED deterministically (Task R defines the exact rule).
- **Commit after every task** (frequent commits). Branch is already `feature/systembrett-production-rebrand`. Do NOT open the PR until all tasks + the verification gate (Task V) pass.

---

## File Structure (what gets created / modified)

**New files:**
- `brett/src/client/ui/a11y.ts` — focus-trap + ESC-to-close + focus-restore helper (one impl, used by all modals/drawers).
- `brett/src/client/ui/toast.ts` — central toast/feedback system (error/success/info), pure queue + DOM renderer.
- `brett/src/client/ui/sessions.ts` — pure view-model + DOM renderer for the Offene-Sessions list (analogous to `lobby.ts`).
- `brett/src/client/open-sessions-client.ts` — fetch/poll client for `GET /api/sessions/open` (pure data fns separate from DOM).
- `brett/src/server/open-sessions.ts` — pure `buildOpenSessions(deps)` mapping the in-memory registry → response shape.
- `brett/test/a11y.test.ts`, `brett/test/toast.test.ts`, `brett/test/sessions.test.ts`, `brett/test/open-sessions-client.test.ts`, `brett/test/open-sessions-server.test.ts`, `brett/test/connection-status.test.ts`, `brett/test/preset-sitzen.test.ts` — new unit tests.
- `tests/e2e/specs/brett-rebrand.spec.ts` — post-deploy Playwright E2E.

**Modified files:**
- `brett/src/client/ui/theme.ts` — add the few missing tokens used by canvas-resolution + connection states.
- `brett/src/client/ui/primitives.ts` — add `:disabled` / `:focus-visible` / ghost+danger hover states.
- `brett/src/client/ui/menu.ts` — full menu redesign per the asset (hero/stage/eyebrow/wordmark/sessions/disabled-items/footer + states + aria).
- `brett/src/client/ui/lobby.ts` — apply brand language + states + a11y + copy success toast.
- `brett/src/client/ui/hud.ts` — resolve canvas note-billboard colors via `resolveToken`; add connection-status pill text.
- `brett/src/client/ui/onboarding.ts` — token-driven toast colors (replace inline hex).
- `brett/src/client/ui/fig-panel.ts` — focus-trap/ESC/restore via `a11y.ts`; aria; loading/empty for persons grid (handled with appearance grids).
- `brett/src/client/ui/appearance.ts` — focus-trap/ESC/restore via `a11y.ts`; loading/empty grid states; toast on apply failure.
- `brett/src/client/ui/export.ts` — replace `console.error` with toast; PNG/JSON state feedback parity with PDF.
- `brett/src/client/board-boot.ts` — remove/guard `console.*` (lines ~496/515/527/547).
- `brett/src/client/ws-client.ts` — replace `console.warn` (line ~561) with toast; emit connection-status changes; wire `online-indicator` to connection status.
- `brett/src/client/main.ts` — inject new styles (sessions/toast/a11y), mount the sessions list + polling in the menu, wire toast.
- `brett/src/client/presets.ts` — add `sitzen` pose map.
- `brett/src/server/presets.ts` — add exported `POSE_PRESETS` map incl. `sitzen` (server-side SSOT mirror; see Task P rationale).
- `brett/src/server/index.ts` — register `GET /api/sessions/open` + `requireAuth`.
- `brett/src/server/auth.ts` — add `requireAuth` middleware.
- `brett/public/index.html` — migrate inline CSS regions to `--brett-*`; eindeutsche + add `Sitzen` preset button; aria-labels; mobile/touch fixes; connection-status markup.
- `brett/test/facelift-tokens.test.ts`, `brett/test/no-hardcoded-brand-css.test.ts` — update assertions for the migrated vocabulary.

---

## Phase ordering (independent where possible)

Tasks are grouped so each phase ends at a green gate. Recommended order:
**A (theme tokens) → B (primitives states) → C (toast) → D (a11y) → E (Token-Drift cleanup: index.html + onboarding + hud) → F (menu redesign) → G (sessions BE) → H (sessions FE) → I (lobby) → J (board-chrome a11y/console/export) → K (connection status) → L (mobile) → P (sitzen pose) → V (verify) → W (deploy + E2E)**

Tasks A, B, C, D, G, P are independent and may be parallelized. E/F/H/I/J/K/L touch overlapping files (`index.html`, `main.ts`) — run them in the listed order to avoid conflicts.

---

## Task A: Add missing theme tokens (SSOT)

The drift-map needs canvas-resolvable tokens (`--brett-ink-850` already exists; we add aliases the canvas resolver + connection states reference) and connection-status colors.

**Files:**
- Modify: `brett/src/client/ui/theme.ts:39-96` (tokens object), `:104-156` (themeCss)

- [ ] **Step 1: Write the failing test**

Create `brett/test/theme-tokens.test.ts`:

```ts
// brett/test/theme-tokens.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, themeCss } from '../src/client/ui/theme';

test('theme exposes connection-status + canvas-resolvable tokens', () => {
  assert.equal(typeof tokens.color.statusConnected, 'string');
  assert.equal(typeof tokens.color.statusConnecting, 'string');
  assert.equal(typeof tokens.color.statusDisconnected, 'string');
});

test('themeCss emits the new --brett-status-* vars', () => {
  const css = themeCss();
  assert.ok(css.includes('--brett-status-connected:'));
  assert.ok(css.includes('--brett-status-connecting:'));
  assert.ok(css.includes('--brett-status-disconnected:'));
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/theme-tokens.test.ts` (or `MOCK_DB=true npx --prefix brett tsx --test brett/test/theme-tokens.test.ts`)
Expected: FAIL — `tokens.color.statusConnected` is undefined.

- [ ] **Step 3: Add the tokens**

In `brett/src/client/ui/theme.ts`, inside `tokens.color` (after the `jointHead` entry, before the closing `}` of `color:` at line ~78), add:

```ts
    // Connection-status semantics (Production-Readiness §7.10)
    statusConnected: 'oklch(0.80 0.06 160)',     // sage — verbunden
    statusConnecting: 'oklch(0.86 0.09 75)',     // brass-2 — verbindet…
    statusDisconnected: '#e0796b',               // muted red — getrennt
```

- [ ] **Step 4: Emit them in `themeCss()`**

In `themeCss()`, after the `--brett-joint-head` line (~154), add:

```ts
    `  --brett-status-connected:${c.statusConnected};`,
    `  --brett-status-connecting:${c.statusConnecting};`,
    `  --brett-status-disconnected:${c.statusDisconnected};`,
```

- [ ] **Step 5: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/theme-tokens.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ui/theme.ts brett/test/theme-tokens.test.ts
git commit -m "feat(brett): add connection-status design tokens to theme SSOT"
```

---

## Task B: Primitives — disabled / focus-visible / hover states

`primitives.ts` buttons/fields lack `:disabled` and `:focus-visible`. Add them (P1-1).

**Files:**
- Modify: `brett/src/client/ui/primitives.ts:97-136` (`primitivesCss`)
- Test: `brett/test/primitives-states.test.ts`

- [ ] **Step 1: Write the failing test**

Create `brett/test/primitives-states.test.ts`:

```ts
// brett/test/primitives-states.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primitivesCss } from '../src/client/ui/primitives';

test('primitivesCss defines disabled + focus-visible states for buttons/fields', () => {
  const css = primitivesCss();
  assert.ok(css.includes('.brett-btn:disabled'), 'button disabled state');
  assert.ok(css.includes('.brett-btn:focus-visible'), 'button focus-visible');
  assert.ok(css.includes('.brett-field:focus-visible'), 'field focus-visible');
  assert.ok(css.includes('.brett-btn--ghost:hover'), 'ghost hover');
  assert.ok(css.includes('.brett-btn--danger:hover'), 'danger hover');
});

test('primitivesCss references only var(--brett-*) (no raw brand hex)', () => {
  const css = primitivesCss();
  // strip rosterCss-appended fallbacks: tolerate var(--token, #hex) only
  const stripped = css.replace(/var\([^()]*\)/g, '');
  const hex = stripped.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  assert.equal(hex, null, `unexpected hex in primitivesCss: ${hex?.[0]}`);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/primitives-states.test.ts`
Expected: FAIL — `:disabled`/`:focus-visible` strings absent.

- [ ] **Step 3: Add the states**

In `brett/src/client/ui/primitives.ts`, inside `primitivesCss()`'s returned array, insert these lines AFTER the `.brett-btn--danger{...}` line (line ~117) and BEFORE the `.brett-field{` line:

```ts
    '.brett-btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--brett-ink-900),0 0 0 5px var(--brett-brass-2);}',
    '.brett-btn:disabled,.brett-btn[disabled]{opacity:0.45;cursor:not-allowed;pointer-events:none;}',
    '.brett-btn--ghost:hover{color:var(--brett-brass);border-color:var(--brett-brass);}',
    '.brett-btn--danger:hover{color:var(--brett-brass-2);border-color:var(--brett-line-2);background:transparent;}',
```

And in the `.brett-field` block (after `.brett-field:focus{...}` line ~124), add:

```ts
    '.brett-field:focus-visible{outline:none;border-color:var(--brett-brass);box-shadow:0 0 0 3px var(--brett-brass-dim);}',
    '.brett-field:disabled{opacity:0.5;cursor:not-allowed;}',
```

- [ ] **Step 4: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/primitives-states.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/primitives.ts brett/test/primitives-states.test.ts
git commit -m "feat(brett): add disabled/focus-visible/hover states to UI primitives"
```

---

## Task C: Toast system (`ui/toast.ts`)

Central feedback (P1-5, P2-8). Pure queue + DOM renderer. Token-driven. Replaces silent failures + `console.*`-only paths.

**Files:**
- Create: `brett/src/client/ui/toast.ts`
- Test: `brett/test/toast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `brett/test/toast.test.ts`:

```ts
// brett/test/toast.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToastQueue, toastCss, type ToastKind } from '../src/client/ui/toast';

test('queue: push returns an id and enqueues', () => {
  const q = createToastQueue();
  const id = q.push({ kind: 'error', message: 'boom' });
  assert.equal(typeof id, 'string');
  assert.equal(q.list().length, 1);
  assert.equal(q.list()[0].message, 'boom');
});

test('queue: dismiss removes by id', () => {
  const q = createToastQueue();
  const id = q.push({ kind: 'info', message: 'hi' });
  q.dismiss(id);
  assert.equal(q.list().length, 0);
});

test('queue: caps at 4 (drops oldest)', () => {
  const q = createToastQueue();
  for (let i = 0; i < 6; i++) q.push({ kind: 'info', message: `m${i}` });
  assert.equal(q.list().length, 4);
  assert.equal(q.list()[0].message, 'm2');
});

test('toastCss is token-driven (no standalone hex)', () => {
  const css = toastCss();
  const stripped = css.replace(/var\([^()]*\)/g, '');
  const hex = stripped.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  assert.equal(hex, null, `unexpected hex: ${hex?.[0]}`);
});

test('kinds are the three documented values', () => {
  const kinds: ToastKind[] = ['error', 'success', 'info'];
  assert.equal(kinds.length, 3);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/toast.test.ts`
Expected: FAIL — module `../src/client/ui/toast` not found.

- [ ] **Step 3: Implement `toast.ts`**

Create `brett/src/client/ui/toast.ts` with this exact content:

```ts
// brett/src/client/ui/toast.ts
//
// Central feedback system (Production-Readiness §7.5/§7.8). Two layers:
//   1. Pure queue (createToastQueue) — node-testable, no DOM.
//   2. DOM renderer (mountToastHost + the singleton `toast` API).
// Token-driven; respects prefers-reduced-motion via CSS.

export type ToastKind = 'error' | 'success' | 'info';

export interface ToastInput {
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after ms; 0 = sticky. Default 4000 (errors default 6000). */
  ttlMs?: number;
  /** Optional inline action (e.g. "Erneut versuchen"). */
  action?: { label: string; onClick: () => void };
}

export interface Toast extends ToastInput {
  id: string;
}

const MAX_TOASTS = 4;

export interface ToastQueue {
  push(t: ToastInput): string;
  dismiss(id: string): void;
  list(): Toast[];
  subscribe(fn: (list: Toast[]) => void): () => void;
}

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `toast-${_seq}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Pure queue — no DOM. Caps at MAX_TOASTS (drops oldest). */
export function createToastQueue(): ToastQueue {
  let items: Toast[] = [];
  const subs = new Set<(list: Toast[]) => void>();
  const emit = () => { for (const fn of subs) fn([...items]); };
  return {
    push(t) {
      const toast: Toast = { id: nextId(), ...t };
      items.push(toast);
      if (items.length > MAX_TOASTS) items = items.slice(items.length - MAX_TOASTS);
      emit();
      return toast.id;
    },
    dismiss(id) {
      const before = items.length;
      items = items.filter((x) => x.id !== id);
      if (items.length !== before) emit();
    },
    list() { return [...items]; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// ── DOM renderer (singleton) ────────────────────────────────────────────────

const HOST_ID = 'brett-toast-host';
const STYLE_ID = 'brett-toast-styles';

export function toastCss(): string {
  return [
    `#${HOST_ID}{`,
    '  position:fixed;left:50%;bottom:24px;transform:translateX(-50%);',
    '  display:flex;flex-direction:column;gap:8px;z-index:400;',
    '  width:min(360px,92vw);pointer-events:none;',
    '}',
    '.brett-toast{',
    '  pointer-events:auto;display:flex;align-items:flex-start;gap:10px;',
    '  padding:12px 14px;border-radius:var(--brett-radius-md);',
    '  background:var(--brett-ink-850);color:var(--brett-fg);',
    '  border:1px solid var(--brett-line-2);font-family:var(--brett-font-sans);',
    '  font-size:13.5px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,0.4);',
    '  animation:brett-toast-in 200ms var(--brett-ease-soft);',
    '}',
    '.brett-toast--error{border-left:3px solid var(--brett-status-disconnected);}',
    '.brett-toast--success{border-left:3px solid var(--brett-status-connected);}',
    '.brett-toast--info{border-left:3px solid var(--brett-brass);}',
    '.brett-toast__msg{flex:1 1 auto;min-width:0;}',
    '.brett-toast__action{',
    '  flex:none;background:transparent;border:none;cursor:pointer;',
    '  color:var(--brett-brass);font-weight:600;font-size:13px;padding:0 2px;',
    '  font-family:var(--brett-font-sans);',
    '}',
    '.brett-toast__action:hover{color:var(--brett-brass-2);}',
    '.brett-toast__close{',
    '  flex:none;background:transparent;border:none;cursor:pointer;',
    '  color:var(--brett-mute);font-size:15px;line-height:1;padding:0 2px;',
    '}',
    '.brett-toast__close:hover{color:var(--brett-fg);}',
    '@keyframes brett-toast-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}',
    '@media (prefers-reduced-motion: reduce){.brett-toast{animation:none;}}',
  ].join('\n');
}

export function injectToastStyles(doc: Document = document): void {
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = toastCss();
}

let _queue: ToastQueue | null = null;
let _hostBound = false;

function getHost(doc: Document): HTMLElement {
  let host = doc.getElementById(HOST_ID);
  if (!host) {
    host = doc.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    doc.body.appendChild(host);
  }
  return host;
}

function render(host: HTMLElement, list: Toast[], q: ToastQueue, doc: Document): void {
  host.replaceChildren();
  for (const t of list) {
    const el = doc.createElement('div');
    el.className = `brett-toast brett-toast--${t.kind}`;
    el.dataset.toastId = t.id;
    const msg = doc.createElement('span');
    msg.className = 'brett-toast__msg';
    msg.textContent = t.message;
    el.appendChild(msg);
    if (t.action) {
      const a = doc.createElement('button');
      a.type = 'button';
      a.className = 'brett-toast__action';
      a.textContent = t.action.label;
      a.addEventListener('click', () => { t.action!.onClick(); q.dismiss(t.id); });
      el.appendChild(a);
    }
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'brett-toast__close';
    close.setAttribute('aria-label', 'Schließen');
    close.textContent = '✕';
    close.addEventListener('click', () => q.dismiss(t.id));
    el.appendChild(close);
    host.appendChild(el);
  }
}

/** Singleton toast API. Lazily binds the DOM host + styles on first use. */
export const toast = {
  show(input: ToastInput): string {
    if (typeof document === 'undefined') return '';
    if (!_queue) _queue = createToastQueue();
    injectToastStyles(document);
    const host = getHost(document);
    if (!_hostBound) {
      _hostBound = true;
      _queue.subscribe((list) => render(host, list, _queue!, document));
    }
    const id = _queue.push(input);
    const ttl = input.ttlMs ?? (input.kind === 'error' ? 6000 : 4000);
    if (ttl > 0 && typeof setTimeout !== 'undefined') {
      setTimeout(() => _queue?.dismiss(id), ttl);
    }
    return id;
  },
  error(message: string, action?: ToastInput['action']): string {
    return this.show({ kind: 'error', message, action });
  },
  success(message: string): string {
    return this.show({ kind: 'success', message });
  },
  info(message: string): string {
    return this.show({ kind: 'info', message });
  },
};
```

- [ ] **Step 4: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/toast.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/toast.ts brett/test/toast.test.ts
git commit -m "feat(brett): add central token-driven toast feedback system"
```

---

## Task D: a11y helper (`ui/a11y.ts`)

One focus-trap + ESC-to-close + focus-restore impl for all modals/drawers (P1-3).

**Files:**
- Create: `brett/src/client/ui/a11y.ts`
- Test: `brett/test/a11y.test.ts`

- [ ] **Step 1: Write the failing test**

Create `brett/test/a11y.test.ts`. Tests are PURE — they exercise the focusable-filtering + wrap-index logic without a real DOM:

```ts
// brett/test/a11y.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFocusable, nextFocusIndex } from '../src/client/ui/a11y';

test('isFocusable: visible enabled button is focusable', () => {
  assert.equal(isFocusable({ tag: 'button', disabled: false, hidden: false, tabIndex: 0 }), true);
});

test('isFocusable: disabled / hidden / tabindex=-1 are not', () => {
  assert.equal(isFocusable({ tag: 'button', disabled: true, hidden: false, tabIndex: 0 }), false);
  assert.equal(isFocusable({ tag: 'input', disabled: false, hidden: true, tabIndex: 0 }), false);
  assert.equal(isFocusable({ tag: 'a', disabled: false, hidden: false, tabIndex: -1 }), false);
});

test('nextFocusIndex: forward wraps last→first', () => {
  assert.equal(nextFocusIndex(2, 3, false), 0);
  assert.equal(nextFocusIndex(0, 3, false), 1);
});

test('nextFocusIndex: backward wraps first→last', () => {
  assert.equal(nextFocusIndex(0, 3, true), 2);
  assert.equal(nextFocusIndex(2, 3, true), 1);
});

test('module imports under node without touching the DOM', () => {
  assert.equal(typeof isFocusable, 'function');
  assert.equal(typeof nextFocusIndex, 'function');
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/a11y.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `a11y.ts`**

Create `brett/src/client/ui/a11y.ts`:

```ts
// brett/src/client/ui/a11y.ts
//
// Accessibility helpers (Production-Readiness §7.3). One focus-trap + ESC-to-close
// + focus-restore impl, used by every modal/drawer. Pure predicates (isFocusable,
// nextFocusIndex) are node-testable; the DOM trap (createFocusTrap) confines DOM
// access to its body so the module imports under node/tsx.

/** Pure: shape mirrors the focusability attributes we read off an element. */
export interface FocusableLike {
  tag: string;
  disabled: boolean;
  hidden: boolean;
  tabIndex: number;
}

/** Pure: would this element be reachable by Tab? */
export function isFocusable(el: FocusableLike): boolean {
  if (el.disabled) return false;
  if (el.hidden) return false;
  if (el.tabIndex < 0) return false;
  return true;
}

/** Pure: next index under wrap-around Tab/Shift+Tab. */
export function nextFocusIndex(current: number, count: number, backward: boolean): number {
  if (count <= 0) return 0;
  return backward
    ? (current - 1 + count) % count
    : (current + 1) % count;
}

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface FocusTrap {
  /** Release the trap, remove listeners, and restore focus to the prior element. */
  release(): void;
}

export interface FocusTrapOptions {
  /** Called when ESC is pressed inside the trap. */
  onEscape?: () => void;
  /** Element to focus on activate; default = first focusable in container. */
  initialFocus?: HTMLElement | null;
}

/**
 * Activate a focus trap on `container`. Tab/Shift+Tab cycle within; ESC fires
 * onEscape. Returns a handle whose release() removes listeners and restores the
 * focus that was active before the trap opened.
 */
export function createFocusTrap(container: HTMLElement, opts: FocusTrapOptions = {}): FocusTrap {
  const doc = container.ownerDocument;
  const prevFocused = doc.activeElement as HTMLElement | null;

  const focusables = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((el) => !el.hidden && el.offsetParent !== null);

  const initial = opts.initialFocus ?? focusables()[0] ?? container;
  if (initial && typeof initial.focus === 'function') {
    try { initial.focus(); } catch { /* noop */ }
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      opts.onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (list.length === 0) { e.preventDefault(); return; }
    const idx = list.indexOf(doc.activeElement as HTMLElement);
    const next = nextFocusIndex(idx < 0 ? (e.shiftKey ? 0 : -1) : idx, list.length, e.shiftKey);
    e.preventDefault();
    list[next]?.focus();
  };

  container.addEventListener('keydown', onKeydown as EventListener);

  return {
    release() {
      container.removeEventListener('keydown', onKeydown as EventListener);
      if (prevFocused && typeof prevFocused.focus === 'function') {
        try { prevFocused.focus(); } catch { /* noop */ }
      }
    },
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/a11y.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/a11y.ts brett/test/a11y.test.ts
git commit -m "feat(brett): add focus-trap/ESC/focus-restore a11y helper"
```

---

## Task E: Token-Drift cleanup (Achse 1)

Migrate the legacy token vocabulary in `index.html` inline CSS, `hud.ts` canvas colors, and `onboarding.ts` to `--brett-*` per Spec §4.1 drift-map. **This task also updates the two existing token guard tests** because they assert the OLD vocabulary.

> **Spec coverage in this task:** §4.1 drift-map (all rows), §10.1 (no hardcoded value outside theme.ts), **P2-6** (Onboarding/HUD colors onto tokens — E.2 hud canvas via `resolveToken`, E.3 onboarding inline styles).

### E.1 — `index.html` inline CSS regions

**Files:**
- Modify: `brett/public/index.html:10` (body), `:11-26` (Topbar chrome region), `:122-126` (fig-size-btn), `:145-218` (Appearance Drawer region), `:220-267` (Remaining panels region)
- Modify: `brett/test/facelift-tokens.test.ts`, `brett/test/no-hardcoded-brand-css.test.ts`

- [ ] **Step 1: Update the guard tests FIRST (they encode the target vocabulary)**

In `brett/test/facelift-tokens.test.ts`, replace the token-reference assertions to expect the `--brett-*` vocabulary. Apply these exact edits:

- In test `'E2: appearance-drawer region references expected tokens'` (lines ~57-64), replace its body assertions with:
```ts
  assert.ok(region.includes('var(--brett-surface'), 'must reference --brett-surface');
  assert.ok(region.includes('var(--brett-brass'),   'must reference --brett-brass');
  assert.ok(region.includes('var(--brett-fg'),      'must reference --brett-fg');
  assert.ok(region.includes('var(--brett-radius'),  'must reference --brett-radius-*');
```
- In test `'E4: topbar-chrome region references expected tokens'` (lines ~74-80), replace its body with:
```ts
  assert.ok(region.includes('var(--brett-brass'), 'must reference --brett-brass');
  assert.ok(region.includes('var(--brett-fg'),    'must reference --brett-fg');
  assert.ok(region.includes('var(--brett-ink'),   'must reference --brett-ink-*');
```
- In test `'E5: remaining-panels region references expected tokens'` (lines ~90-96), replace its body with:
```ts
  assert.ok(region.includes('var(--brett-surface'), 'must reference --brett-surface');
  assert.ok(region.includes('var(--brett-brass'),   'must reference --brett-brass');
  assert.ok(region.includes('var(--brett-fg'),      'must reference --brett-fg');
```

The `assertNoStandaloneHex` tests stay as-is (they already permit `var(--token, #hex)` fallbacks — keep that form below).

In `brett/test/no-hardcoded-brand-css.test.ts`, the `LEGACY` array (line 25) is `['#0e1014', '#161a22', '#c8a96e']`. Keep it; our migration removes those literals from `#status-pill`/`#fig-panel`/`#fig-panel-add` (those already use `--brett-*`; this test continues to pass).

- [ ] **Step 2: Run the guard tests, verify they FAIL**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/facelift-tokens.test.ts`
Expected: FAIL — the regions still reference the OLD `var(--slate-1`/`var(--brass`/`var(--parchment`, not `var(--brett-*)`.

- [ ] **Step 3: Migrate the `body` rule (line 10)**

Replace:
```html
    html, body { margin:0; height:100%; background:#0e1014; color:#e7ead0; font-family: ui-sans-serif, system-ui, sans-serif; overflow:hidden; }
```
with:
```html
    html, body { margin:0; height:100%; background:var(--brett-ink-900, #0b111c); color:var(--brett-fg, #eef1f3); font-family:var(--brett-font-sans, ui-sans-serif, system-ui, sans-serif); overflow:hidden; }
```

- [ ] **Step 4: Migrate the Topbar chrome region (lines 12-25)**

Replace this EXACT verbatim block (lines 12-25 of `index.html`, copied 1:1 from the current file):

```html
    #topbar {
      position:fixed; top:0; left:0; right:0; height:36px; display:flex; align-items:center; gap:8px;
      padding:0 10px; background:rgba(14,16,20,0.85); backdrop-filter:blur(6px);
      border-bottom:var(--hairline-soft, 1px solid rgba(231,234,208,0.08)); z-index:10; font-size:13px;
    }
    #topbar .group { display:flex; align-items:center; gap:6px; }
    #topbar .sep { width:1px; height:20px; background:var(--parchment-3, rgba(231,234,208,0.12)); margin:0 6px; }
    .preset-btn { background:transparent; color:var(--parchment, inherit); border:var(--hairline-soft, 1px solid rgba(231,234,208,0.18));
      border-radius:var(--radius-sm, 4px); padding:4px 10px; font:inherit; cursor:pointer; }
    .preset-btn:hover { background:var(--slate-2, rgba(231,234,208,0.08)); }
    .icon-btn { background:transparent; color:var(--parchment, inherit); border:var(--hairline-soft, 1px solid rgba(231,234,208,0.18));
      border-radius:var(--radius-sm, 4px); padding:4px 10px; font:inherit; cursor:pointer; }
    #stiffness { width:160px; accent-color:var(--brass, #c8a96e); }
    #online-indicator { font-size:var(--fs-small, 13px); color:var(--parchment-2, #b9bda3); }
```

with:

```html
    #topbar {
      position:fixed; top:0; left:0; right:0; height:36px; display:flex; align-items:center; gap:8px;
      padding:0 10px; background:var(--brett-ink-900, #0b111c); backdrop-filter:blur(6px);
      border-bottom:1px solid var(--brett-line, rgba(255,255,255,0.07)); z-index:10; font-size:13px;
    }
    #topbar .group { display:flex; align-items:center; gap:6px; }
    #topbar .sep { width:1px; height:20px; background:var(--brett-line-2, rgba(255,255,255,0.12)); margin:0 6px; }
    .preset-btn { background:transparent; color:var(--brett-fg, #eef1f3); border:1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      border-radius:var(--brett-radius-sm, 8px); padding:6px 12px; font:inherit; cursor:pointer; min-height:32px; transition:background var(--brett-dur-fast,150ms),border-color var(--brett-dur-fast,150ms),color var(--brett-dur-fast,150ms); }
    .preset-btn:hover { background:var(--brett-surface-hover, #17202e); }
    .preset-btn:focus-visible { outline:none; border-color:var(--brett-brass, oklch(0.80 0.09 75)); box-shadow:0 0 0 3px var(--brett-brass-dim, oklch(0.80 0.09 75 / 0.14)); }
    .preset-btn:disabled { opacity:0.45; cursor:not-allowed; }
    .icon-btn { background:transparent; color:var(--brett-fg, #eef1f3); border:1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      border-radius:var(--brett-radius-sm, 8px); padding:6px 12px; font:inherit; cursor:pointer; min-height:32px; transition:background var(--brett-dur-fast,150ms),border-color var(--brett-dur-fast,150ms),color var(--brett-dur-fast,150ms); }
    .icon-btn:hover { background:var(--brett-surface-hover, #17202e); }
    .icon-btn:focus-visible { outline:none; border-color:var(--brett-brass, oklch(0.80 0.09 75)); box-shadow:0 0 0 3px var(--brett-brass-dim, oklch(0.80 0.09 75 / 0.14)); }
    .icon-btn:disabled { opacity:0.45; cursor:not-allowed; }
    #stiffness { width:160px; accent-color:var(--brett-brass, oklch(0.80 0.09 75)); }
    #online-indicator { font-size:13px; color:var(--brett-mute, #8c96a3); display:inline-flex; align-items:center; gap:6px; }
```

> Note: this adds `min-height:32px` to preset/icon buttons (touch-target groundwork; final 44px tweak in Task L), `:focus-visible`, `:disabled` (P1-1), and migrates every legacy literal to `var(--brett-*, #fallback)`.

- [ ] **Step 5: Migrate the `fig-panel-btn` rule (lines 38-44)**

Replace:
```html
    #fig-panel-btn {
      background: transparent; color: inherit;
      border: 1px solid rgba(231,234,208,0.18);
      border-radius: 4px; padding: 4px 10px;
      font: inherit; cursor: pointer; white-space: nowrap;
    }
    #fig-panel-btn:hover, #fig-panel-btn.open { background: rgba(231,234,208,0.12); }
```
with:
```html
    #fig-panel-btn {
      background: transparent; color: inherit;
      border: 1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      border-radius: var(--brett-radius-sm, 8px); padding: 6px 12px; min-height:32px;
      font: inherit; cursor: pointer; white-space: nowrap;
    }
    #fig-panel-btn:hover, #fig-panel-btn.open { background: var(--brett-surface-hover, #17202e); }
    #fig-panel-btn:focus-visible { outline:none; border-color:var(--brett-brass, oklch(0.80 0.09 75)); box-shadow:0 0 0 3px var(--brett-brass-dim, oklch(0.80 0.09 75 / 0.14)); }
```

- [ ] **Step 6: Migrate `fig-panel-close`, `fig-panel-label`, `fig-scale-*`, `fig-size-btn` (lines 62-126)**

Replace lines 62-71:
```html
    #fig-panel-close {
      background: none; border: none; color: rgba(231,234,208,0.4);
      cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1;
    }
    #fig-panel-close:hover { color: #e7ead0; }

    .fig-panel-label {
      font-size: 10px; color: rgba(231,234,208,0.5);
      text-transform: uppercase; letter-spacing: 0.08em;
    }
```
with:
```html
    #fig-panel-close {
      background: none; border: none; color: var(--brett-mute, #8c96a3);
      cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1;
    }
    #fig-panel-close:hover { color: var(--brett-fg, #eef1f3); }
    #fig-panel-close:focus-visible { outline:none; color:var(--brett-fg, #eef1f3); box-shadow:0 0 0 2px var(--brett-brass, oklch(0.80 0.09 75)); border-radius:4px; }

    .fig-panel-label {
      font-size: 10px; color: var(--brett-mute, #8c96a3);
      text-transform: uppercase; letter-spacing: 0.08em;
    }
```

Replace lines 119-126:
```html
    #fig-scale-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    #fig-scale-slider { flex: 1; min-width: 80px; accent-color: #c8a96e; }
    #fig-scale-val { font-size: 11px; color: rgba(231,234,208,0.6); min-width: 28px; }
    .fig-size-btn {
      background: rgba(231,234,208,0.07); border: 1px solid rgba(231,234,208,0.18);
      color: inherit; border-radius: 4px; padding: 2px 7px; font-size: 11px; cursor: pointer;
    }
    .fig-size-btn:hover, .fig-size-btn.active { background: rgba(200,169,110,0.22); border-color: #c8a96e; }
```
with:
```html
    #fig-scale-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    #fig-scale-slider { flex: 1; min-width: 80px; accent-color: var(--brett-brass, oklch(0.80 0.09 75)); }
    #fig-scale-val { font-size: 11px; color: var(--brett-mute, #8c96a3); min-width: 28px; }
    .fig-size-btn {
      background: var(--brett-line, rgba(255,255,255,0.07)); border: 1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      color: inherit; border-radius: var(--brett-radius-sm, 8px); padding: 4px 9px; font-size: 11px; cursor: pointer; min-height:28px;
    }
    .fig-size-btn:hover, .fig-size-btn.active { background: var(--brett-brass-dim, oklch(0.80 0.09 75 / 0.14)); border-color: var(--brett-brass, oklch(0.80 0.09 75)); }
    .fig-size-btn:focus-visible { outline:none; box-shadow:0 0 0 2px var(--brett-brass, oklch(0.80 0.09 75)); }
```

- [ ] **Step 7: Migrate the Appearance Drawer region (lines 145-218)**

> **WHY FULL BLOCKS, NOT A SUBSTITUTION TABLE:** the legacy tokens are NOT unique in `index.html` (e.g. `var(--radius-sm, 4px)`, `var(--brass, #c8a96e)`, `var(--slate-1, #161922)`, `var(--slate-2, …)` each appear multiple times across regions). A per-token `Edit` with `replace_all:false` would error on the non-unique old_string, and `replace_all:true` would corrupt OTHER regions. So each edit below is a FULL CSS rule block: every old_string is copied 1:1 from the current `index.html` and is UNIQUE. Apply them in order. Keep the `var(--brett-…, #fallback)` form so the hex-guard tests stay satisfied.

Edit 7a — `#appearance-btn` + hover/disabled. Replace:
```html
    #appearance-btn {
      background: transparent; color: inherit;
      border: var(--hairline-soft, 1px solid rgba(231,234,208,0.18));
      border-radius: var(--radius-sm, 4px); padding: 4px 10px;
      font: inherit; cursor: pointer; white-space: nowrap;
    }
    #appearance-btn:hover, #appearance-btn.open { background: var(--slate-2, rgba(231,234,208,0.12)); }
    #appearance-btn:disabled { opacity: 0.35; cursor: default; }
```
with:
```html
    #appearance-btn {
      background: transparent; color: inherit;
      border: 1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      border-radius: var(--brett-radius-sm, 8px); padding: 6px 12px; min-height:32px;
      font: inherit; cursor: pointer; white-space: nowrap;
    }
    #appearance-btn:hover, #appearance-btn.open { background: var(--brett-surface-hover, #17202e); }
    #appearance-btn:disabled { opacity: 0.35; cursor: default; }
    #appearance-btn:focus-visible { outline:none; border-color:var(--brett-brass, oklch(0.80 0.09 75)); box-shadow:0 0 0 3px var(--brett-brass-dim, oklch(0.80 0.09 75 / 0.14)); }
```

Edit 7b — `#appearance-drawer`. Replace:
```html
    #appearance-drawer {
      position: fixed; top: 36px; right: 0; bottom: 0;
      width: 280px; z-index: 100;
      background: var(--slate-1, #161922); border-left: 1px solid rgba(var(--brass-rgb, 200,169,110),0.25);
      display: flex; flex-direction: column;
      transform: translateX(100%);
      transition: transform 200ms ease;
      overflow-y: auto;
    }
```
with:
```html
    #appearance-drawer {
      position: fixed; top: 36px; right: 0; bottom: 0;
      width: 280px; z-index: 100;
      background: var(--brett-surface, #101826); border-left: 1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      display: flex; flex-direction: column;
      transform: translateX(100%);
      transition: transform 200ms ease;
      overflow-y: auto;
    }
```

Edit 7c — `.drawer-header`. Replace:
```html
    .drawer-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px; border-bottom: var(--hairline-soft, 1px solid rgba(231,234,208,0.08));
      font-size: 11px; font-weight: 600; color: var(--brass, #c8a96e);
      text-transform: uppercase; letter-spacing: 0.1em;
    }
```
with:
```html
    .drawer-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px; border-bottom: 1px solid var(--brett-line, rgba(255,255,255,0.07));
      font-size: 11px; font-weight: 600; color: var(--brett-brass, oklch(0.80 0.09 75));
      text-transform: uppercase; letter-spacing: 0.1em;
    }
```

Edit 7d — `.drawer-close` + hover. Replace:
```html
    .drawer-close { background: none; border: none; color: var(--parchment-3, rgba(231,234,208,0.4)); cursor: pointer; font-size: 16px; padding: 0; line-height: 1; }
    .drawer-close:hover { color: var(--parchment, #e7ead0); }
```
with:
```html
    .drawer-close { background: none; border: none; color: var(--brett-mute, #8c96a3); cursor: pointer; font-size: 16px; padding: 0; line-height: 1; }
    .drawer-close:hover { color: var(--brett-fg, #eef1f3); }
```

Edit 7e — `.drawer-section` + `.drawer-section-title`. Replace:
```html
    .drawer-section { padding: 10px 14px; border-bottom: var(--hairline-soft, 1px solid rgba(231,234,208,0.06)); }
    .drawer-section-title {
      font-size: 10px; color: var(--parchment-3, #7c8071);
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;
    }
```
with:
```html
    .drawer-section { padding: 10px 14px; border-bottom: 1px solid var(--brett-line, rgba(255,255,255,0.07)); }
    .drawer-section-title {
      font-size: 10px; color: var(--brett-mute-2, #6a727e);
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;
    }
```

Edit 7f — `.thumb-item`. Replace:
```html
    .thumb-item {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      cursor: pointer; padding: 4px; border-radius: var(--radius-md, 6px);
      border: 2px solid transparent; transition: border-color 0.12s;
    }
    .thumb-item:hover { border-color: var(--brass-soft, rgba(200,169,110,0.4)); }
    .thumb-item.active { border-color: var(--brass, #c8a96e); }
    .thumb-item img { width: 56px; height: 56px; object-fit: cover; border-radius: var(--radius-sm, 4px); }
    .thumb-item span { font-size: 9px; color: var(--parchment-3, #7c8071); text-align: center; line-height: 1.2; }
```
with:
```html
    .thumb-item {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      cursor: pointer; padding: 4px; border-radius: var(--brett-radius-md, 12px);
      border: 2px solid transparent; transition: border-color 0.12s;
    }
    .thumb-item:hover { border-color: var(--brett-brass-dim, oklch(0.80 0.09 75 / 0.14)); }
    .thumb-item.active { border-color: var(--brett-brass, oklch(0.80 0.09 75)); }
    .thumb-item img { width: 56px; height: 56px; object-fit: cover; border-radius: var(--brett-radius-sm, 8px); }
    .thumb-item span { font-size: 9px; color: var(--brett-mute-2, #6a727e); text-align: center; line-height: 1.2; }
```

Edit 7g — `.acc-group-label`. Replace:
```html
    .acc-group-label { font-size: 9px; color: var(--parchment-3, #7c8071); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
```
with:
```html
    .acc-group-label { font-size: 9px; color: var(--brett-mute-2, #6a727e); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
```

Edit 7h — `.drawer-footer`. Replace:
```html
    .drawer-footer {
      padding: 12px 14px; display: flex; gap: 8px; margin-top: auto;
      border-top: var(--hairline-soft, 1px solid rgba(231,234,208,0.08));
      position: sticky; bottom: 0; background: var(--slate-1, #161922);
    }
```
with:
```html
    .drawer-footer {
      padding: 12px 14px; display: flex; gap: 8px; margin-top: auto;
      border-top: 1px solid var(--brett-line, rgba(255,255,255,0.07));
      position: sticky; bottom: 0; background: var(--brett-surface, #101826);
    }
```

Edit 7i — `.drawer-cancel` + hover. Replace:
```html
    .drawer-cancel {
      flex: 1; background: transparent; color: var(--parchment-2, rgba(231,234,208,0.7));
      border: 1px solid var(--parchment-3, rgba(231,234,208,0.2)); border-radius: var(--radius-md, 6px);
      padding: 8px; font: inherit; font-size: 12px; cursor: pointer;
    }
    .drawer-cancel:hover { background: var(--slate-2, rgba(231,234,208,0.06)); }
```
with:
```html
    .drawer-cancel {
      flex: 1; background: transparent; color: var(--brett-fg-soft, #cdd3d9);
      border: 1px solid var(--brett-line-2, rgba(255,255,255,0.12)); border-radius: var(--brett-radius-md, 12px);
      padding: 8px; font: inherit; font-size: 12px; cursor: pointer; min-height:32px;
    }
    .drawer-cancel:hover { background: var(--brett-surface-hover, #17202e); }
```

Edit 7j — `.drawer-apply` + hover, AND add the focus-visible rule for all three drawer buttons. Replace:
```html
    .drawer-apply {
      flex: 1; background: var(--brass, #c8a96e); color: var(--slate-0, #0e1014);
      border: none; border-radius: var(--radius-md, 6px);
      padding: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .drawer-apply:hover { filter: brightness(1.1); }
```
with:
```html
    .drawer-apply {
      flex: 1; background: var(--brett-brass, oklch(0.80 0.09 75)); color: var(--brett-ink-900, #0b111c);
      border: none; border-radius: var(--brett-radius-md, 12px);
      padding: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; min-height:32px;
    }
    .drawer-apply:hover { filter: brightness(1.1); }
    .drawer-cancel:focus-visible, .drawer-apply:focus-visible, .drawer-close:focus-visible { outline:none; box-shadow:0 0 0 3px var(--brett-brass-dim, oklch(0.80 0.09 75 / 0.14)); }
```

- [ ] **Step 8: Migrate the Remaining panels region (lines 220-267)**

> Same FULL-BLOCK rule as Step 7 (legacy tokens are non-unique across regions). Each old_string below is a complete CSS rule block copied 1:1 from the current `index.html` and is unique. Apply in order.

Edit 8a — `.coop-hud`. Replace:
```html
    .coop-hud {
      display: none; position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      background: var(--slate-0, rgba(10,10,20,.82)); border: 1px solid var(--sage, #4a7);
      border-radius: var(--radius-md, 8px); padding: 8px 20px;
      font-family: var(--font-mono, monospace); color: var(--parchment-2, #b9bda3); font-size: 13px;
      flex-direction: column; gap: 4px; min-width: 220px; z-index: 200;
    }
```
with:
```html
    .coop-hud {
      display: none; position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      background: var(--brett-ink-900, #0b111c); border: 1px solid var(--brett-sage, oklch(0.80 0.06 160));
      border-radius: var(--brett-radius-md, 12px); padding: 8px 20px;
      font-family: var(--brett-font-mono, ui-monospace, monospace); color: var(--brett-mute, #8c96a3); font-size: 13px;
      flex-direction: column; gap: 4px; min-width: 220px; z-index: 200;
    }
```

Edit 8b — `.coop-hud-label`. Replace:
```html
    .coop-hud-label { color: var(--brass, #c8a96e); font-weight: bold; letter-spacing: .1em; }
    .coop-wave-label { font-size: 15px; font-weight: bold; color: var(--parchment, #e7ead0); }
```
with:
```html
    .coop-hud-label { color: var(--brett-brass, oklch(0.80 0.09 75)); font-weight: bold; letter-spacing: .1em; }
    .coop-wave-label { font-size: 15px; font-weight: bold; color: var(--brett-fg, #eef1f3); }
```

Edit 8b-2 — `.coop-enemy-count`. Replace:
```html
    .coop-enemy-count { color: var(--parchment-3, #e87); }
```
with:
```html
    .coop-enemy-count { color: var(--brett-mute, #8c96a3); }
```

Edit 8c — `.coop-progress`. Replace:
```html
    .coop-progress {
      background: var(--slate-2, #1e1e1e); border-radius: var(--radius-sm, 4px); overflow: hidden; height: 4px;
    }
    .coop-progress-bar {
      height: 100%; background: linear-gradient(90deg, var(--sage, #4a7), var(--brass, #c9aa71)); transition: width .5s;
    }
```
with:
```html
    .coop-progress {
      background: var(--brett-ink-800, #17202e); border-radius: var(--brett-radius-sm, 8px); overflow: hidden; height: 4px;
    }
    .coop-progress-bar {
      height: 100%; background: linear-gradient(90deg, var(--brett-sage, oklch(0.80 0.06 160)), var(--brett-brass, oklch(0.80 0.09 75))); transition: width .5s;
    }
```

Edit 8d — `.boss-hp-label` + `.boss-hp-track` + `.boss-hp-bar`. Replace:
```html
    .boss-hp-label { color: var(--danger, #f44); font-size: 11px; margin-bottom: 2px; }
    .boss-hp-track {
      background: var(--slate-2, #1e1e1e); border-radius: var(--radius-sm, 4px); overflow: hidden; height: 6px;
    }
    .boss-hp-bar { width: 100%; height: 100%; background: var(--danger, #f44); transition: width .3s; }
```
with:
```html
    .boss-hp-label { color: var(--brett-status-disconnected, #e0796b); font-size: 11px; margin-bottom: 2px; }
    .boss-hp-track {
      background: var(--brett-ink-800, #17202e); border-radius: var(--brett-radius-sm, 8px); overflow: hidden; height: 6px;
    }
    .boss-hp-bar { width: 100%; height: 100%; background: var(--brett-status-disconnected, #e0796b); transition: width .3s; }
```

Edit 8e — `.session-toast`. Replace:
```html
    .session-toast {
      position: fixed; bottom: 12px; left: 12px; z-index: 100;
      background: var(--slate-1, rgba(22,27,34,0.93)); border: 1px solid var(--slate-3, #2a3340);
      border-radius: var(--radius-lg, 10px); padding: 12px 16px;
      color: var(--parchment, #e6edf3); font: 13px var(--font-sans, system-ui);
      min-width: 200px; box-shadow: var(--shadow-2, 0 4px 12px rgba(0,0,0,0.5));
    }
```
with:
```html
    .session-toast {
      position: fixed; bottom: 12px; left: 12px; z-index: 100;
      background: var(--brett-surface, #101826); border: 1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      border-radius: var(--brett-radius-md, 12px); padding: 12px 16px;
      color: var(--brett-fg, #eef1f3); font: 13px var(--brett-font-sans, system-ui);
      min-width: 200px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
```

Edit 8f — `.session-toast-title` + `.session-toast-code` + `.session-toast-link`. Replace:
```html
    .session-toast-title { font-weight: bold; margin-bottom: 4px; color: var(--sage, #3fb950); }
    .session-toast-code { font-family: var(--font-mono, monospace); font-size: 14px; color: var(--brass, #ffaa44); }
    .session-toast-link {
      color: var(--parchment-2, #58a6ff); text-decoration: none; display: inline-block; margin-top: 6px;
    }
```
with:
```html
    .session-toast-title { font-weight: bold; margin-bottom: 4px; color: var(--brett-sage, oklch(0.80 0.06 160)); }
    .session-toast-code { font-family: var(--brett-font-mono, ui-monospace, monospace); font-size: 14px; color: var(--brett-brass, oklch(0.80 0.09 75)); }
    .session-toast-link {
      color: var(--brett-brass, oklch(0.80 0.09 75)); text-decoration: none; display: inline-block; margin-top: 6px;
    }
```

> After Steps 7+8, the `assertNoStandaloneHex` regex strips `var(…)` then forbids a remaining standalone hex; with everything in `var(--brett-…, #fallback)` form, only the `.session-toast` box-shadow `rgba(0,0,0,0.5)` remains, which is `rgba` not hex — allowed. Do not leave any bare `#hex` outside a `var()` fallback.

- [ ] **Step 9: Run the guard tests, verify they PASS**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/facelift-tokens.test.ts test/no-hardcoded-brand-css.test.ts`
Expected: PASS (all region tests green).

- [ ] **Step 10: Commit**

```bash
git add brett/public/index.html brett/test/facelift-tokens.test.ts brett/test/no-hardcoded-brand-css.test.ts
git commit -m "refactor(brett): migrate board-chrome inline CSS to --brett-* tokens"
```

### E.2 — `hud.ts` canvas note-billboard colors via resolveToken

**Files:**
- Modify: `brett/src/client/ui/hud.ts:228-248`

- [ ] **Step 1: Replace the hardcoded canvas literals**

In `setFigureNoteBillboard` (hud.ts), the canvas draws use literals `'rgba(11,17,28,0.82)'`, `'rgba(200,169,110,0.7)'`, `'#e7ead0'`. Replace them to resolve via the existing `cssVar` resolver (defined at hud.ts:10). Apply these edits:

Replace:
```ts
  ctx.fillStyle = 'rgba(11,17,28,0.82)';
```
with:
```ts
  ctx.fillStyle = resolveToken('--brett-ink-900', '#0b111c', cssVar);
```

Replace:
```ts
  ctx.strokeStyle = 'rgba(200,169,110,0.7)';
```
with:
```ts
  ctx.strokeStyle = resolveToken('--brett-brass', 'oklch(0.80 0.09 75)', cssVar);
```

Replace:
```ts
  ctx.fillStyle = '#e7ead0';
```
with:
```ts
  ctx.fillStyle = resolveToken('--brett-fg', '#eef1f3', cssVar);
```

- [ ] **Step 2: Add the `resolveToken` import**

At the top of hud.ts, line 3 currently is:
```ts
import { lockBadgeStyle, type VarGetter } from './skin';
```
Change it to:
```ts
import { lockBadgeStyle, resolveToken, type VarGetter } from './skin';
```

- [ ] **Step 3: Verify typecheck**

Run: `npm --prefix brett run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/ui/hud.ts
git commit -m "refactor(brett): resolve hud note-billboard canvas colors via theme tokens"
```

### E.3 — `onboarding.ts` token-driven toast colors

**Files:**
- Modify: `brett/src/client/ui/onboarding.ts:77-101`
- Test: `brett/test/onboarding-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `brett/test/onboarding-tokens.test.ts`:

```ts
// brett/test/onboarding-tokens.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('onboarding.ts uses var(--brett-*) styles, not raw legacy hex', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/client/ui/onboarding.ts'), 'utf8');
  // The mountToast inline styles must not contain the old literals.
  assert.ok(!src.includes('rgba(20,22,18,0.88)'), 'old card bg literal removed');
  assert.ok(!src.includes("'#e7ead0'"), 'old parchment button bg removed');
  assert.ok(!src.includes("'#141612'"), 'old button text removed');
  assert.ok(src.includes('var(--brett-'), 'must reference --brett-* tokens');
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/onboarding-tokens.test.ts`
Expected: FAIL — old literals still present.

- [ ] **Step 3: Replace the inline styles**

In `onboarding.ts` `mountToast`, replace the `Object.assign(card.style, {...})` block (lines 77-82):
```ts
  Object.assign(card.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
    maxWidth: '320px', padding: '14px 16px', borderRadius: '12px',
    background: 'rgba(20,22,18,0.88)', color: '#fff', zIndex: '60',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontSize: '14px', lineHeight: '1.4',
  });
```
with:
```ts
  Object.assign(card.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
    maxWidth: '320px', padding: '14px 16px',
    borderRadius: 'var(--brett-radius-md, 12px)',
    background: 'var(--brett-ink-850, #101826)', color: 'var(--brett-fg, #eef1f3)',
    border: '1px solid var(--brett-line-2, rgba(255,255,255,0.12))', zIndex: '60',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontSize: '14px', lineHeight: '1.4',
    fontFamily: 'var(--brett-font-sans, system-ui, sans-serif)',
  });
```

Replace the button style block (lines 98-101):
```ts
  Object.assign(btn.style, {
    background: '#e7ead0', color: '#141612', border: 'none',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  });
```
with:
```ts
  Object.assign(btn.style, {
    background: 'var(--brett-brass, oklch(0.80 0.09 75))',
    color: 'var(--brett-ink-900, #0b111c)', border: 'none',
    padding: '7px 14px', borderRadius: 'var(--brett-radius-pill, 999px)',
    cursor: 'pointer', fontSize: '13px', fontWeight: '600',
    fontFamily: 'var(--brett-font-sans, system-ui, sans-serif)',
  });
```

- [ ] **Step 4: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/onboarding-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/onboarding.ts brett/test/onboarding-tokens.test.ts
git commit -m "refactor(brett): onboarding toast colors onto --brett-* tokens"
```

---

## Task F: Menu redesign (`ui/menu.ts` + `index.html`)

Rebuild the menu to match the design asset `docs/superpowers/specs/assets/2026-06-08-brett-menu-final.html` (Spec §5.1). The asset is the source of truth for structure, classes, values, states, aria. Keep the existing `menuModel`/`isValidJoinCode` pure model (menu-model.test.ts must stay green). The Offene-Sessions list mounts into a placeholder the menu renders (filled by Task H).

> **Spec coverage in this task:** §5.1 (full menu), §5.3 hero/stage brand motif, **P2-9** (inline join-code validation as visible text via `.brett-menu__join-hint`, not just border color), **P2-12** (disabled menu items with a visible "bald verfügbar" tag via `.brett-menu__tag`), P1-1 focus-visible states, P1-2 aria.

**Files:**
- Modify: `brett/src/client/ui/menu.ts` (rewrite `mountMenu` + `menuCss`; the menu renders an empty `#brett-menu-sessions` slot that Task H fills)
- Test: `brett/test/menu-render.test.ts` (new), keep `brett/test/menu-model.test.ts` green

- [ ] **Step 1: Write the failing render test**

Create `brett/test/menu-render.test.ts`. It asserts the static CSS contains the brand structure classes and that the model still gates correctly (DOM-free; we test the css + model, not jsdom render):

```ts
// brett/test/menu-render.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuCss } from '../src/client/ui/menu';

test('menuCss defines the brand structure classes from the design asset', () => {
  const css = menuCss();
  for (const cls of [
    '.brett-menu__hero', '.brett-menu__stage', '.brett-menu__grain', '.brett-menu__glow',
    '.brett-menu__wordmark', '.brett-menu__eyebrow', '.brett-menu__title',
    '.brett-menu__title-em', '.brett-menu__subtitle',
    '.brett-menu__primary', '.brett-menu__join', '.brett-menu__sessions-slot',
    '.brett-menu__disabled', '.brett-menu__tag', '.brett-menu__footer',
  ]) {
    assert.ok(css.includes(cls), `menuCss must define ${cls}`);
  }
});

test('menuCss respects prefers-reduced-motion', () => {
  assert.ok(menuCss().includes('prefers-reduced-motion'), 'must gate animations');
});

test('menuCss is token-driven (no standalone hex outside var fallback)', () => {
  const stripped = menuCss().replace(/var\([^()]*\)/g, '');
  const hex = stripped.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  assert.equal(hex, null, `unexpected hex: ${hex?.[0]}`);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/menu-render.test.ts`
Expected: FAIL — none of the new classes exist yet.

- [ ] **Step 3: Rewrite `mountMenu` + `menuCss`**

Replace the body of `mountMenu` (menu.ts:65-125) and `buildJoinRow` (127-151) and `menuCss` (153-178) with the asset-faithful versions below. Keep `menuModel`/`isValidJoinCode`/interfaces above line 64 unchanged. Add a `sessionsSlot` element with class `brett-menu__sessions-slot` and id `brett-menu-sessions` that Task H fills.

Replace `mountMenu` and `buildJoinRow` with:

```ts
/** Render the Hauptmenü into `container` per the design asset (Blend A+C). */
export function mountMenu(container: HTMLElement, opts: MenuHandlers): void {
  const model = menuModel(opts.user);
  container.replaceChildren();

  const panel = document.createElement('div');
  panel.className = 'brett-menu';

  // Ambient constellation stage + grain + glow (decorative, aria-hidden).
  panel.insertAdjacentHTML('beforeend', STAGE_SVG + GRAIN_GLOW_HTML);

  const inner = document.createElement('div');
  inner.className = 'brett-menu__inner';

  // Hero crown (constellation banner).
  inner.insertAdjacentHTML('beforeend', HERO_SVG);

  // Header: wordmark + eyebrow + title + subtitle.
  const header = document.createElement('header');
  header.className = 'brett-menu__header';
  header.insertAdjacentHTML('beforeend', `
    <div class="brett-menu__wordmark">mentolder<span class="brett-menu__wordmark-dot">.</span></div>
    <div class="brett-menu__eyebrow">
      <span class="brett-menu__bar" aria-hidden="true"></span>
      <span class="brett-menu__eyebrow-label">mentolder</span>
      <span class="brett-menu__sep" aria-hidden="true">.</span>
      <span class="brett-menu__eyebrow-label">Systemische Aufstellung</span>
    </div>
    <h1 class="brett-menu__title">Stell dein System<br><span class="brett-menu__title-em">in den Raum.</span></h1>
    <p class="brett-menu__subtitle">Ein ruhiger Ort, um systemische Aufstellungen zu moderieren — du führst, das Brett hält den Überblick.</p>
  `);
  inner.appendChild(header);

  inner.appendChild(rule());

  // Primary: Neue Session (only when authenticated — model gates it).
  const hasNew = model.items.some((i) => i.id === 'new-session');
  if (hasNew) {
    const primary = document.createElement('section');
    primary.className = 'brett-menu__act brett-menu__primary';
    primary.insertAdjacentHTML('beforeend', `
      <div class="brett-menu__act-text">
        <span class="brett-menu__act-title">Neue Session starten</span>
        <span class="brett-menu__act-note">Leeres Brett, frische Aufstellung.</span>
      </div>
    `);
    const btn = Button({ label: 'Neue Session starten', variant: 'primary', onClick: opts.onNewSession });
    btn.classList.add('brett-menu__primary-btn');
    btn.dataset.itemId = 'new-session';
    primary.appendChild(btn);
    inner.appendChild(primary);
    inner.appendChild(ruleSoft());
  }

  // Join by code.
  inner.appendChild(buildJoinSection(opts));
  inner.appendChild(rule());

  // Offene Sessions slot (filled by open-sessions client in main.ts).
  const sessionsSlot = document.createElement('section');
  sessionsSlot.className = 'brett-menu__sessions-slot';
  sessionsSlot.id = 'brett-menu-sessions';
  sessionsSlot.setAttribute('aria-label', 'Offene Sessions');
  inner.appendChild(sessionsSlot);
  inner.appendChild(rule());

  // Disabled items ("bald verfügbar").
  for (const item of model.items.filter((i) => i.disabled)) {
    const sec = document.createElement('section');
    sec.className = 'brett-menu__act brett-menu__disabled';
    sec.setAttribute('aria-disabled', 'true');
    const note = item.id === 'saved' ? 'Vergangene Sessions wieder öffnen.' : 'Brett, Sprache und Moderation anpassen.';
    sec.insertAdjacentHTML('beforeend', `
      <div class="brett-menu__act-text">
        <span class="brett-menu__act-title">${item.label}</span>
        <span class="brett-menu__act-note">${note}</span>
      </div>
      <span class="brett-menu__tag">bald verfügbar</span>
    `);
    inner.appendChild(sec);
    inner.appendChild(ruleSoft());
  }

  inner.appendChild(rule());

  // Footer: identity + logout.
  const footer = document.createElement('footer');
  footer.className = 'brett-menu__footer';
  const ident = document.createElement('span');
  ident.className = 'brett-menu__ident';
  ident.innerHTML = `Angemeldet als <span class="brett-menu__ident-name">${escapeHtml(opts.user.name)}</span>`;
  const logout = document.createElement('a');
  logout.className = 'brett-menu__logout';
  logout.href = '/auth/logout';
  logout.textContent = 'Abmelden';
  footer.append(ident, logout);
  inner.appendChild(footer);

  panel.appendChild(inner);
  container.appendChild(panel);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rule(): HTMLElement {
  const r = document.createElement('div');
  r.className = 'brett-menu__rule';
  r.setAttribute('aria-hidden', 'true');
  return r;
}
function ruleSoft(): HTMLElement {
  const r = rule();
  r.classList.add('brett-menu__rule--soft');
  return r;
}

function buildJoinSection(opts: MenuHandlers): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'brett-menu__act brett-menu__join-act';
  sec.insertAdjacentHTML('beforeend', `
    <div class="brett-menu__act-text">
      <span class="brett-menu__act-title">Session beitreten</span>
      <span class="brett-menu__act-note">Tritt einer laufenden Aufstellung per Code bei.</span>
    </div>
  `);
  const row = document.createElement('div');
  row.className = 'brett-menu__join';

  const field = Field({ placeholder: 'Session-Code (z. B. KRB-9A2)' });
  field.classList.add('brett-menu__join-input');
  field.setAttribute('aria-label', 'Session-Code');
  field.setAttribute('spellcheck', 'false');
  field.setAttribute('autocomplete', 'off');

  const hint = document.createElement('span');
  hint.className = 'brett-menu__join-hint';
  hint.setAttribute('role', 'alert');
  hint.hidden = true;

  const go = Button({
    label: 'Beitreten',
    variant: 'ghost',
    onClick: () => {
      const code = field.value.trim();
      if (isValidJoinCode(code)) {
        field.classList.remove('brett-field--invalid');
        hint.hidden = true;
        opts.onJoin(code);
      } else {
        field.classList.add('brett-field--invalid');
        hint.textContent = 'Bitte einen gültigen Code im Format XXX-XXX eingeben.';
        hint.hidden = false;
      }
    },
  });
  go.classList.add('brett-menu__join-go');

  row.append(field, go);
  sec.append(row, hint);
  return sec;
}
```

Add these module-level SVG/HTML constants near the top of menu.ts (after the imports, before `MenuUser`). Copy the SVG geometry verbatim from the design asset:

```ts
const STAGE_SVG = `
<div class="brett-menu__stage" aria-hidden="true">
  <svg viewBox="0 0 540 860" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <g class="brett-menu__stage-edges" stroke="var(--brett-brass)" stroke-width="1" fill="none">
      <line x1="270" y1="170" x2="96" y2="74"/><line x1="270" y1="170" x2="452" y2="92"/>
      <line x1="270" y1="170" x2="120" y2="320"/><line x1="270" y1="170" x2="430" y2="306"/>
      <line x1="96" y1="74" x2="120" y2="320"/><line x1="452" y1="92" x2="430" y2="306"/>
      <line x1="120" y1="320" x2="430" y2="306"/><line x1="120" y1="320" x2="64" y2="500"/>
      <line x1="430" y1="306" x2="484" y2="520"/><line x1="64" y1="500" x2="484" y2="520"/>
      <line x1="64" y1="500" x2="156" y2="688"/><line x1="484" y1="520" x2="392" y2="706"/>
      <line x1="156" y1="688" x2="392" y2="706"/><line x1="156" y1="688" x2="270" y2="788"/>
      <line x1="392" y1="706" x2="270" y2="788"/>
    </g>
    <g class="brett-menu__stage-nodes">
      <circle class="n-core" cx="270" cy="170" r="13"/>
      <circle class="n-sage s1" cx="96" cy="74" r="6"/><circle class="n-brass s2" cx="452" cy="92" r="6.5"/>
      <circle class="n-fg s3" cx="120" cy="320" r="5.5"/><circle class="n-sage s4" cx="430" cy="306" r="6"/>
      <circle class="n-brass s5" cx="64" cy="500" r="5"/><circle class="n-sage s6" cx="484" cy="520" r="5.5"/>
      <circle class="n-fg s7" cx="156" cy="688" r="5"/><circle class="n-brass s8" cx="392" cy="706" r="4.5"/>
      <circle class="n-sage s9" cx="270" cy="788" r="5"/>
    </g>
  </svg>
</div>`;

const GRAIN_GLOW_HTML = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="brett-grain">
  <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" stitchTiles="stitch" result="noise"/>
  <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.4 0"/>
</filter></svg>
<div class="brett-menu__grain" aria-hidden="true"></div>
<div class="brett-menu__glow" aria-hidden="true"></div>`;

const HERO_SVG = `
<section class="brett-menu__hero" aria-hidden="true"><div class="brett-menu__hero-svg">
  <svg viewBox="0 0 440 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <g class="brett-menu__hero-edges" stroke="var(--brett-brass)" stroke-width="1" fill="none">
      <line x1="220" y1="100" x2="92" y2="48"/><line x1="220" y1="100" x2="356" y2="54"/>
      <line x1="220" y1="100" x2="120" y2="158"/><line x1="220" y1="100" x2="328" y2="152"/>
      <line x1="220" y1="100" x2="218" y2="32"/><line x1="92" y1="48" x2="120" y2="158"/>
      <line x1="356" y1="54" x2="328" y2="152"/><line x1="218" y1="32" x2="356" y2="54"/>
      <line x1="218" y1="32" x2="92" y2="48"/><line x1="120" y1="158" x2="328" y2="152"/>
    </g>
    <g class="brett-menu__hero-nodes">
      <circle class="n-core" cx="220" cy="100" r="12"/>
      <circle class="n-brass nb1" cx="218" cy="32" r="6.5"/><circle class="n-sage nb2" cx="92" cy="48" r="5.5"/>
      <circle class="n-brass nb3" cx="356" cy="54" r="6"/><circle class="n-fg nb4" cx="120" cy="158" r="5"/>
      <circle class="n-sage nb5" cx="328" cy="152" r="5.5"/><circle class="n-fg nb6" cx="62" cy="110" r="3.5"/>
      <circle class="n-brass nb7" cx="388" cy="106" r="4"/>
    </g>
  </svg>
</div></section>`;
```

Replace `menuCss()` (153-178) with the asset CSS, ported to `--brett-*` tokens (copy values from the asset 1:1, swap raw colors → tokens). Use this exact `menuCss`:

```ts
export function menuCss(): string {
  return [
    '.brett-menu{position:relative;box-sizing:border-box;width:min(512px,94vw);min-height:760px;',
    '  margin:40px auto;padding:26px 38px 34px;overflow:hidden;color:var(--brett-fg);',
    '  background:radial-gradient(120% 70% at 50% -8%, oklch(0.80 0.09 75 / 0.07) 0%, oklch(0.80 0.09 75 / 0) 42%),',
    '    radial-gradient(120% 90% at 8% 0%, oklch(0.80 0.09 75 / 0.05) 0%, oklch(0.80 0.09 75 / 0) 46%),var(--brett-ink-900);',
    '  border:1px solid var(--brett-line);border-radius:var(--brett-radius);',
    '  font-family:var(--brett-font-sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;}',
    '.brett-menu *,.brett-menu *::before,.brett-menu *::after{box-sizing:border-box;}',
    '.brett-menu__inner{position:relative;z-index:2;}',
    // stage
    '.brett-menu__stage{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.14;',
    '  -webkit-mask-image:radial-gradient(140% 105% at 50% 14%,rgba(0,0,0,1) 0%,rgba(0,0,0,1) 34%,rgba(0,0,0,.45) 68%,transparent 100%);',
    '  mask-image:radial-gradient(140% 105% at 50% 14%,rgba(0,0,0,1) 0%,rgba(0,0,0,1) 34%,rgba(0,0,0,.45) 68%,transparent 100%);}',
    '.brett-menu__stage svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.brett-menu__stage-edges line{opacity:.42;stroke-dasharray:3 6;animation:brett-drift 13s linear infinite;}',
    '.brett-menu__stage-nodes circle{transform-box:fill-box;transform-origin:center;}',
    // hero
    '.brett-menu__hero{position:relative;height:168px;margin:0 -10px 26px;border:1px solid var(--brett-line);',
    '  border-radius:18px;overflow:hidden;backdrop-filter:blur(2px);',
    '  background:radial-gradient(110% 130% at 50% 18%, oklch(0.80 0.09 75 / 0.07) 0%, oklch(0.80 0.09 75 / 0) 58%),',
    '    linear-gradient(180deg, var(--brett-ink-850) 0%, var(--brett-ink-900) 100%);}',
    '.brett-menu__hero-svg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px 26px;}',
    '.brett-menu__hero-svg svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.brett-menu__hero-edges line{opacity:.3;stroke-dasharray:3 5;animation:brett-dash 9s linear infinite;}',
    '.brett-menu__hero-nodes circle{transform-box:fill-box;transform-origin:center;}',
    // shared nodes
    '.brett-menu .n-core{fill:var(--brett-brass);filter:drop-shadow(0 0 9px oklch(0.80 0.09 75 / .55));animation:brett-corepulse 4.2s ease-in-out infinite;}',
    '.brett-menu .n-brass{fill:var(--brett-brass-2);filter:drop-shadow(0 0 5px oklch(0.80 0.09 75 / .4));}',
    '.brett-menu .n-sage{fill:var(--brett-sage);filter:drop-shadow(0 0 4px oklch(0.80 0.06 160 / .35));}',
    '.brett-menu .n-fg{fill:var(--brett-fg-soft);}',
    '.brett-menu__hero-nodes .nb1,.brett-menu__stage-nodes .s1{animation:brett-float 7.4s ease-in-out infinite .6s;}',
    '.brett-menu__hero-nodes .nb2,.brett-menu__stage-nodes .s2{animation:brett-float 6.8s ease-in-out infinite 1.1s;}',
    '.brett-menu__hero-nodes .nb3,.brett-menu__stage-nodes .s3{animation:brett-float 7.9s ease-in-out infinite .3s;}',
    '.brett-menu__hero-nodes .nb4,.brett-menu__stage-nodes .s4{animation:brett-float 6.4s ease-in-out infinite .9s;}',
    '.brett-menu__hero-nodes .nb5,.brett-menu__stage-nodes .s5{animation:brett-float 8.2s ease-in-out infinite 1.4s;}',
    '.brett-menu__hero-nodes .nb6,.brett-menu__stage-nodes .s6{animation:brett-float 7.1s ease-in-out infinite .2s;}',
    '.brett-menu__hero-nodes .nb7,.brett-menu__stage-nodes .s7{animation:brett-float 6.6s ease-in-out infinite 1.0s;}',
    // grain + glow
    '.brett-menu__grain{position:absolute;inset:-40%;pointer-events:none;z-index:1;opacity:.2;mix-blend-mode:overlay;filter:url(#brett-grain);animation:brett-gdrift 8s steps(6) infinite;}',
    '.brett-menu__glow{position:absolute;top:-120px;left:50%;width:480px;height:380px;transform:translateX(-50%);pointer-events:none;z-index:1;filter:blur(8px);animation:brett-glowpulse 9s ease-in-out infinite;',
    '  background:radial-gradient(circle at 50% 40%, oklch(0.80 0.09 75 / 0.18) 0%, oklch(0.80 0.09 75 / 0.08) 36%, oklch(0.80 0.09 75 / 0) 66%);}',
    // header
    '.brett-menu__wordmark{font-family:var(--brett-font-serif);font-weight:400;font-size:19px;letter-spacing:-.01em;color:var(--brett-fg-soft);margin-bottom:22px;}',
    '.brett-menu__wordmark-dot{color:var(--brett-brass);}',
    '.brett-menu__eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:22px;}',
    '.brett-menu__bar{width:26px;height:2px;background:var(--brett-brass);flex:none;border-radius:2px;}',
    '.brett-menu__eyebrow-label{font-family:var(--brett-font-mono);font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--brett-brass);}',
    '.brett-menu__sep{color:var(--brett-sage);font-family:var(--brett-font-mono);font-size:11px;transform:translateY(-1px);}',
    '.brett-menu__title{margin:0 0 18px;font-family:var(--brett-font-serif);font-weight:300;font-size:44px;line-height:1.04;letter-spacing:-.018em;color:var(--brett-fg);}',
    '.brett-menu__title-em{font-style:italic;font-weight:300;color:var(--brett-brass-2);}',
    '.brett-menu__subtitle{margin:0;max-width:40ch;color:var(--brett-mute);font-size:15px;line-height:1.6;}',
    // rules
    '.brett-menu__rule{height:1px;background:var(--brett-line-2);margin:26px 0;}',
    '.brett-menu__rule--soft{background:var(--brett-line);margin:4px 0;}',
    // sessions slot (filled by Task H; the menu-render test asserts this class exists)
    '.brett-menu__sessions-slot{display:block;}',
    // acts
    '.brett-menu__act{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 0;}',
    '.brett-menu__primary{flex-direction:column;align-items:stretch;gap:14px;}',
    '.brett-menu__act-text{display:flex;flex-direction:column;gap:3px;min-width:0;}',
    '.brett-menu__act-title{font-family:var(--brett-font-serif);font-weight:400;font-size:21px;letter-spacing:-.01em;color:var(--brett-fg);}',
    '.brett-menu__act-note{font-size:13.5px;color:var(--brett-mute);line-height:1.45;}',
    '.brett-menu__primary-btn{width:100%;border-radius:var(--brett-radius-pill);padding:14px 22px;}',
    // join
    '.brett-menu__join{display:flex;gap:10px;margin-top:14px;width:100%;}',
    '.brett-menu__join-input{flex:1 1 auto;min-width:0;border-radius:var(--brett-radius-pill);}',
    '.brett-menu__join-go{flex:none;border-radius:var(--brett-radius-pill);}',
    '.brett-menu__join-hint{display:block;margin-top:8px;color:var(--brett-status-disconnected);font-size:12.5px;}',
    // disabled
    '.brett-menu__disabled{opacity:.52;cursor:not-allowed;}',
    '.brett-menu__disabled .brett-menu__act-title{color:var(--brett-fg-soft);}',
    '.brett-menu__tag{flex:none;font-family:var(--brett-font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--brett-mute);padding:5px 11px;border:1px solid var(--brett-line-2);border-radius:var(--brett-radius-pill);white-space:nowrap;}',
    // footer
    '.brett-menu__footer{display:flex;align-items:center;justify-content:space-between;gap:16px;}',
    '.brett-menu__ident{font-size:13.5px;color:var(--brett-mute);}',
    '.brett-menu__ident-name{color:var(--brett-fg-soft);font-style:italic;font-family:var(--brett-font-serif);font-size:15.5px;}',
    '.brett-menu__logout{background:none;border:none;padding:4px 2px;cursor:pointer;text-decoration:none;font-family:var(--brett-font-sans);font-size:13.5px;font-weight:600;color:var(--brett-fg-soft);transition:color var(--brett-dur-base) var(--brett-ease-soft);}',
    '.brett-menu__logout:hover{color:var(--brett-brass);}',
    '.brett-menu__logout:focus-visible{outline:none;color:var(--brett-brass);box-shadow:0 0 0 3px var(--brett-brass-dim);border-radius:6px;}',
    // keyframes
    '@keyframes brett-corepulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.12);opacity:.9;}}',
    '@keyframes brett-float{0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);}}',
    '@keyframes brett-dash{to{stroke-dashoffset:-16;}}',
    '@keyframes brett-drift{to{stroke-dashoffset:-18;}}',
    '@keyframes brett-glowpulse{0%,100%{opacity:.85;transform:translateX(-50%) scale(1);}50%{opacity:1;transform:translateX(-50%) scale(1.05);}}',
    '@keyframes brett-gdrift{0%{transform:translate(0,0);}100%{transform:translate(-3%,4%);}}',
    '@media (max-width:560px){.brett-menu{padding:20px 18px 26px;min-height:auto;}.brett-menu__title{font-size:34px;}.brett-menu__act{flex-direction:column;align-items:stretch;}}',
    '@media (prefers-reduced-motion: reduce){.brett-menu__grain,.brett-menu__glow,.brett-menu__hero-edges line,.brett-menu__stage-edges line,.brett-menu .n-core,.brett-menu__hero-nodes circle,.brett-menu__stage-nodes circle{animation:none;}}',
  ].join('\n');
}
```

> Note: `oklch(...)` literals inside gradients/shadows are brand-color expressions matching `theme.ts`'s brass/sage; they are NOT hex, so the `menu-render.test.ts` hex check passes. They mirror the asset 1:1.

- [ ] **Step 4: Run, verify pass (render test + model test stay green)**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/menu-render.test.ts test/menu-model.test.ts`
Expected: PASS (both files).

- [ ] **Step 5: Typecheck**

Run: `npm --prefix brett run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ui/menu.ts brett/test/menu-render.test.ts
git commit -m "feat(brett): rebuild menu to mentolder Blend A+C design (hero/stage/sessions slot)"
```

---

## Task G: Offene Sessions — backend (`/api/sessions/open`)

New auth-gated read endpoint + pure mapping `registry → response shape` (Spec §6.2). The shape:
```json
{ "sessions": [ { "code":"KRB-9A2","title":"…","leiterName":"Patrick","participantCount":3,"status":"laeuft" } ] }
```

**Title derivation rule (deterministic, no data-model change):** `title = "Aufstellung von " + leiterName` when a leiter name is known, else `"Session " + code`. `status`: `"laeuft"` if phase ∈ {`active`,`paused`}, else `"wartet"` (lobby/warmup). Only sessions whose phase is NOT `ended` and that are present in `sessionCodeIndex` are listed.

**Files:**
- Create: `brett/src/server/open-sessions.ts`
- Modify: `brett/src/server/auth.ts` (add `requireAuth`)
- Modify: `brett/src/server/index.ts` (register route)
- Test: `brett/test/open-sessions-server.test.ts`

- [ ] **Step 1: Write the failing pure-mapping test**

Create `brett/test/open-sessions-server.test.ts`:

```ts
// brett/test/open-sessions-server.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenSessions, deriveStatus, deriveTitle, type OpenSessionsDeps } from '../src/server/open-sessions';

function deps(over: Partial<OpenSessionsDeps> = {}): OpenSessionsDeps {
  return {
    sessionCodeIndex: new Map<string, string>(),
    buildState: () => null,
    listParticipants: () => [],
    resolveName: () => undefined,
    ...over,
  };
}

test('deriveStatus maps phases', () => {
  assert.equal(deriveStatus('active'), 'laeuft');
  assert.equal(deriveStatus('paused'), 'laeuft');
  assert.equal(deriveStatus('lobby'), 'wartet');
  assert.equal(deriveStatus('warmup'), 'wartet');
  assert.equal(deriveStatus(null), 'wartet');
});

test('deriveTitle uses leiterName when present, else code', () => {
  assert.equal(deriveTitle('Patrick', 'KRB-9A2'), 'Aufstellung von Patrick');
  assert.equal(deriveTitle(undefined, 'KRB-9A2'), 'Session KRB-9A2');
});

test('buildOpenSessions: empty registry → empty list', () => {
  assert.deepEqual(buildOpenSessions(deps()), { sessions: [] });
});

test('buildOpenSessions: maps an active session with leiter + participants', () => {
  const idx = new Map([['KRB-9A2', 'room-1']]);
  const out = buildOpenSessions(deps({
    sessionCodeIndex: idx,
    buildState: (room) => room === 'room-1'
      ? { sessionPhase: 'active', roles: { u1: 'leiter', u2: 'beobachter' } }
      : null,
    listParticipants: (room) => room === 'room-1'
      ? [{ userId: 'u1', name: 'Patrick', color: '#fff' }, { userId: 'u2', name: 'Anna', color: '#fff' }, { userId: 'u3', name: 'Ben', color: '#fff' }]
      : [],
    resolveName: (room, userId) => (userId === 'u1' ? 'Patrick' : undefined),
  }));
  assert.equal(out.sessions.length, 1);
  assert.deepEqual(out.sessions[0], {
    code: 'KRB-9A2',
    title: 'Aufstellung von Patrick',
    leiterName: 'Patrick',
    participantCount: 3,
    status: 'laeuft',
  });
});

test('buildOpenSessions: excludes ended sessions', () => {
  const idx = new Map([['END-001', 'room-x']]);
  const out = buildOpenSessions(deps({
    sessionCodeIndex: idx,
    buildState: () => ({ sessionPhase: 'ended', roles: {} }),
  }));
  assert.equal(out.sessions.length, 0);
});

test('buildOpenSessions: lobby session → wartet, code-based title when no leiter', () => {
  const idx = new Map([['MNT-4K7', 'room-2']]);
  const out = buildOpenSessions(deps({
    sessionCodeIndex: idx,
    buildState: () => ({ sessionPhase: 'lobby', roles: {} }),
    listParticipants: () => [{ userId: 'u9', name: 'Cem', color: '#fff' }],
  }));
  assert.equal(out.sessions[0].status, 'wartet');
  assert.equal(out.sessions[0].leiterName, '');
  assert.equal(out.sessions[0].title, 'Session MNT-4K7');
  assert.equal(out.sessions[0].participantCount, 1);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/open-sessions-server.test.ts`
Expected: FAIL — module `../src/server/open-sessions` not found.

- [ ] **Step 3: Implement `open-sessions.ts`**

Create `brett/src/server/open-sessions.ts`:

```ts
// brett/src/server/open-sessions.ts
//
// Pure registry → response-shape mapping for GET /api/sessions/open (Spec §6.2).
// No Express, no DB — fully node-testable. The route in index.ts injects the live
// registry/state-builder/participant-lister as deps.

export type OpenSessionStatus = 'laeuft' | 'wartet';

export interface OpenSessionEntry {
  code: string;
  title: string;
  leiterName: string;
  participantCount: number;
  status: OpenSessionStatus;
}

export interface OpenSessionsResponse {
  sessions: OpenSessionEntry[];
}

export interface OpenSessionsDeps {
  /** code → roomToken (sessions.sessionCodeIndex). */
  sessionCodeIndex: Map<string, string>;
  /** room → built state (phases.buildStateFromMutations) or null. */
  buildState: (room: string) => { sessionPhase?: string | null; roles?: Record<string, string> } | null;
  /** room → live participants (rooms.listParticipants). */
  listParticipants: (room: string) => Array<{ userId: string; name: string; color: string }>;
  /** room + userId → display name (from live participants), or undefined. */
  resolveName: (room: string, userId: string) => string | undefined;
}

/** Pure: phase → list status. active/paused = laeuft; else wartet. */
export function deriveStatus(phase: string | null | undefined): OpenSessionStatus {
  return phase === 'active' || phase === 'paused' ? 'laeuft' : 'wartet';
}

/** Pure: leiterName ? "Aufstellung von X" : "Session CODE". */
export function deriveTitle(leiterName: string | undefined, code: string): string {
  return leiterName ? `Aufstellung von ${leiterName}` : `Session ${code}`;
}

/** Pure: build the open-sessions response from the injected registry. */
export function buildOpenSessions(deps: OpenSessionsDeps): OpenSessionsResponse {
  const sessions: OpenSessionEntry[] = [];
  for (const [code, room] of deps.sessionCodeIndex.entries()) {
    const state = deps.buildState(room);
    const phase = state?.sessionPhase ?? null;
    if (phase === 'ended') continue;
    const roles = state?.roles ?? {};
    const leiterId = Object.keys(roles).find((id) => roles[id] === 'leiter');
    const leiterName = leiterId ? deps.resolveName(room, leiterId) : undefined;
    const participantCount = deps.listParticipants(room).length;
    sessions.push({
      code,
      title: deriveTitle(leiterName, code),
      leiterName: leiterName ?? '',
      participantCount,
      status: deriveStatus(phase),
    });
  }
  return { sessions };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/open-sessions-server.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add `requireAuth` to `auth.ts`**

In `brett/src/server/auth.ts`, after `requireAdmin` (ends line 77), add:

```ts
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).session?.userId) return next();
  const e2eSecret = process.env.BRETT_OIDC_SECRET;
  if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
  res.status(401).json({ error: 'unauthenticated' });
}
```

- [ ] **Step 6: Register the route in `index.ts`**

In `brett/src/server/index.ts`, add the import of the mapper near the other imports (after `import * as presets from './presets';`, line ~16):
```ts
import { buildOpenSessions } from './open-sessions';
```

Then register the route — insert it right after the existing `app.get('/api/join', ...)` block (after line 95):

```ts
// GET /api/sessions/open — live list of joinable sessions for authenticated users
// (Spec §6.2). Read-only; lists only code/title/leiter/count/status (no sensitive
// content). Maps the in-memory registry via the pure buildOpenSessions().
app.get('/api/sessions/open', auth.requireAuth, (_req: any, res: any) => {
  const out = buildOpenSessions({
    sessionCodeIndex: sessions.sessionCodeIndex,
    buildState: (room) => phases.buildStateFromMutations(room),
    listParticipants: (room) => rooms.listParticipants(room),
    resolveName: (room, userId) =>
      rooms.listParticipants(room).find((p) => p.userId === userId)?.name,
  });
  res.json(out);
});
```

> `sessions`, `phases`, `rooms`, `auth` are ALREADY namespace-imported in index.ts (verified: lines 11/13/14/15 — `import * as auth from './auth';`, `import * as phases from './phases';`, `import * as sessions from './sessions';`, `import * as rooms from './rooms';`). Do NOT add new imports — just add the single `import { buildOpenSessions } from './open-sessions';` line shown above.

- [ ] **Step 7: Typecheck + full brett test**

Run: `npm --prefix brett run typecheck && MOCK_DB=true npm --prefix brett exec -- tsx --test test/open-sessions-server.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add brett/src/server/open-sessions.ts brett/src/server/auth.ts brett/src/server/index.ts brett/test/open-sessions-server.test.ts
git commit -m "feat(brett): add GET /api/sessions/open read endpoint + requireAuth"
```

---

## Task H: Offene Sessions — frontend (`sessions.ts` + `open-sessions-client.ts` + menu wiring)

Pure view-model + renderer (Spec §6.1) with Loading/Empty/Error states, + polling client, + menu mount.

**Files:**
- Create: `brett/src/client/open-sessions-client.ts`, `brett/src/client/ui/sessions.ts`
- Modify: `brett/src/client/main.ts` (mount + poll + inject styles)
- Test: `brett/test/open-sessions-client.test.ts`, `brett/test/sessions.test.ts`

### H.1 — fetch/poll client

- [ ] **Step 1: Write the failing test**

Create `brett/test/open-sessions-client.test.ts`:

```ts
// brett/test/open-sessions-client.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenSessions } from '../src/client/open-sessions-client';

test('parseOpenSessions: valid payload → entries', () => {
  const out = parseOpenSessions({ sessions: [
    { code: 'KRB-9A2', title: 'T', leiterName: 'P', participantCount: 3, status: 'laeuft' },
  ]});
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'KRB-9A2');
  assert.equal(out[0].status, 'laeuft');
});

test('parseOpenSessions: missing/invalid → []', () => {
  assert.deepEqual(parseOpenSessions(null), []);
  assert.deepEqual(parseOpenSessions({}), []);
  assert.deepEqual(parseOpenSessions({ sessions: 'nope' }), []);
});

test('parseOpenSessions: drops malformed rows, coerces count, defaults status', () => {
  const out = parseOpenSessions({ sessions: [
    { code: 'OK1-OK1', title: 'T', leiterName: '', participantCount: '5', status: 'laeuft' },
    { title: 'no code' },
    { code: 'WRT-001', title: 'W', leiterName: 'A', participantCount: 1, status: 'bogus' },
  ]});
  assert.equal(out.length, 2);
  assert.equal(out[0].participantCount, 5);
  assert.equal(out[1].status, 'wartet'); // unknown status normalizes to wartet
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/open-sessions-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `open-sessions-client.ts`**

Create `brett/src/client/open-sessions-client.ts`:

```ts
// brett/src/client/open-sessions-client.ts
//
// Fetch + poll client for GET /api/sessions/open (Spec §6.1). Pure parsing
// (parseOpenSessions) is node-testable; fetchOpenSessions / startPolling do the IO.

export type OpenSessionStatus = 'laeuft' | 'wartet';

export interface OpenSession {
  code: string;
  title: string;
  leiterName: string;
  participantCount: number;
  status: OpenSessionStatus;
}

/** Pure: validate + normalize the API payload into a typed list. */
export function parseOpenSessions(payload: unknown): OpenSession[] {
  const raw = (payload as any)?.sessions;
  if (!Array.isArray(raw)) return [];
  const out: OpenSession[] = [];
  for (const r of raw) {
    if (!r || typeof r.code !== 'string' || !r.code) continue;
    out.push({
      code: r.code,
      title: typeof r.title === 'string' ? r.title : `Session ${r.code}`,
      leiterName: typeof r.leiterName === 'string' ? r.leiterName : '',
      participantCount: Number.isFinite(Number(r.participantCount)) ? Number(r.participantCount) : 0,
      status: r.status === 'laeuft' ? 'laeuft' : 'wartet',
    });
  }
  return out;
}

/** Fetch the open-sessions list. Throws on non-OK so the caller can show Error. */
export async function fetchOpenSessions(signal?: AbortSignal): Promise<OpenSession[]> {
  const res = await fetch('/api/sessions/open', { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`sessions/open ${res.status}`);
  return parseOpenSessions(await res.json());
}

export interface PollHandle { stop(): void; }

/**
 * Poll every `intervalMs` (default 5000) while the document is visible. Pauses on
 * `visibilitychange` (hidden) and resumes when visible (Spec §6.1). Fires
 * onResult on success and onError on failure (never throws to the caller).
 */
export function startOpenSessionsPolling(opts: {
  intervalMs?: number;
  onResult: (list: OpenSession[]) => void;
  onError: (err: unknown) => void;
}): PollHandle {
  const intervalMs = opts.intervalMs ?? 5000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let controller: AbortController | null = null;

  const tick = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    controller?.abort();
    controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    try {
      opts.onResult(await fetchOpenSessions(controller?.signal));
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      opts.onError(err);
    }
  };

  const start = () => { if (!timer) timer = setInterval(tick, intervalMs); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } controller?.abort(); };

  const onVisibility = () => { if (document.hidden) stop(); else { void tick(); start(); } };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  void tick();
  start();

  return {
    stop() {
      stop();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/open-sessions-client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/open-sessions-client.ts brett/test/open-sessions-client.test.ts
git commit -m "feat(brett): add open-sessions fetch/poll client (visibility-aware)"
```

### H.2 — sessions view-model + renderer

- [ ] **Step 1: Write the failing test**

Create `brett/test/sessions.test.ts`:

```ts
// brett/test/sessions.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenSessionsViewModel, sessionsCss } from '../src/client/ui/sessions';

const rows = [
  { code: 'KRB-9A2', title: 'Aufstellung von Patrick', leiterName: 'Patrick', participantCount: 3, status: 'laeuft' as const },
  { code: 'MNT-4K7', title: 'Session MNT-4K7', leiterName: '', participantCount: 1, status: 'wartet' as const },
];

test('view-model: loading flag', () => {
  const vm = buildOpenSessionsViewModel({ phase: 'loading' });
  assert.equal(vm.phase, 'loading');
  assert.equal(vm.count, 0);
});

test('view-model: ready maps rows + count', () => {
  const vm = buildOpenSessionsViewModel({ phase: 'ready', sessions: rows });
  assert.equal(vm.phase, 'ready');
  assert.equal(vm.count, 2);
  assert.equal(vm.rows[0].code, 'KRB-9A2');
  assert.equal(vm.rows[0].metaLine, 'Leitung: Patrick · 3 Teilnehmer · läuft');
  assert.equal(vm.rows[1].metaLine, '1 Teilnehmer · wartet');
});

test('view-model: empty when ready with no sessions', () => {
  const vm = buildOpenSessionsViewModel({ phase: 'ready', sessions: [] });
  assert.equal(vm.phase, 'empty');
  assert.equal(vm.count, 0);
});

test('view-model: error phase carries the retry flag', () => {
  const vm = buildOpenSessionsViewModel({ phase: 'error' });
  assert.equal(vm.phase, 'error');
});

test('sessionsCss is token-driven (no standalone hex)', () => {
  const stripped = sessionsCss().replace(/var\([^()]*\)/g, '');
  const hex = stripped.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  assert.equal(hex, null, `unexpected hex: ${hex?.[0]}`);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/sessions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sessions.ts`**

Create `brett/src/client/ui/sessions.ts`:

```ts
// brett/src/client/ui/sessions.ts
//
// Offene-Sessions list (Spec §6.1) — pure view-model (buildOpenSessionsViewModel)
// + DOM renderer (mountOpenSessions). View matches the design asset's "open-final"
// section: eyebrow + count badge, rows with status dot, title, code, meta, hover/
// focus "Beitreten" pill. States: loading / empty / error / ready.

import type { OpenSession, OpenSessionStatus } from '../open-sessions-client';

export type SessionsPhase = 'loading' | 'ready' | 'empty' | 'error';

export interface SessionRowVM {
  code: string;
  title: string;
  status: OpenSessionStatus;
  metaLine: string;
  ariaLabel: string;
}

export interface OpenSessionsViewModel {
  phase: SessionsPhase;
  count: number;
  rows: SessionRowVM[];
}

export interface SessionsInput {
  phase: SessionsPhase;
  sessions?: OpenSession[];
}

const STATUS_LABEL: Record<OpenSessionStatus, string> = { laeuft: 'läuft', wartet: 'wartet' };

function metaLine(s: OpenSession): string {
  const parts: string[] = [];
  if (s.leiterName) parts.push(`Leitung: ${s.leiterName}`);
  parts.push(`${s.participantCount} Teilnehmer`);
  parts.push(STATUS_LABEL[s.status]);
  return parts.join(' · ');
}

/** Pure: derive the render-model. `ready` with 0 sessions collapses to `empty`. */
export function buildOpenSessionsViewModel(input: SessionsInput): OpenSessionsViewModel {
  if (input.phase === 'ready') {
    const sessions = input.sessions ?? [];
    if (sessions.length === 0) return { phase: 'empty', count: 0, rows: [] };
    return {
      phase: 'ready',
      count: sessions.length,
      rows: sessions.map((s) => ({
        code: s.code,
        title: s.title,
        status: s.status,
        metaLine: metaLine(s),
        ariaLabel: `Beitreten: ${s.title}, Code ${s.code}`,
      })),
    };
  }
  return { phase: input.phase, count: 0, rows: [] };
}

export interface SessionsHandlers {
  onJoin: (code: string) => void;
  onRetry: () => void;
}

/** Render the list into `container` (idempotent — replaces children). */
export function mountOpenSessions(container: HTMLElement, vm: OpenSessionsViewModel, handlers: SessionsHandlers): void {
  container.replaceChildren();

  const head = document.createElement('div');
  head.className = 'brett-sessions__head';
  head.insertAdjacentHTML('beforeend', `
    <div class="brett-sessions__eyebrow">
      <span class="brett-sessions__bar" aria-hidden="true"></span>
      <span class="brett-sessions__eyebrow-label">Offene Sessions</span>
    </div>`);
  if (vm.phase === 'ready') {
    const count = document.createElement('span');
    count.className = 'brett-sessions__count';
    count.textContent = String(vm.count);
    head.appendChild(count);
  }
  container.appendChild(head);

  if (vm.phase === 'loading') {
    const sk = document.createElement('div');
    sk.className = 'brett-sessions__skeletons';
    sk.innerHTML = '<div class="brett-sessions__skeleton"></div>'.repeat(3);
    container.appendChild(sk);
    return;
  }

  if (vm.phase === 'empty') {
    const empty = document.createElement('p');
    empty.className = 'brett-sessions__empty';
    empty.textContent = 'Aktuell keine offenen Sessions. Tritt einer Aufstellung per Code bei.';
    container.appendChild(empty);
    return;
  }

  if (vm.phase === 'error') {
    const err = document.createElement('div');
    err.className = 'brett-sessions__error';
    const msg = document.createElement('span');
    msg.textContent = 'Offene Sessions konnten nicht geladen werden.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'brett-sessions__retry';
    retry.textContent = 'Erneut versuchen';
    retry.addEventListener('click', handlers.onRetry);
    err.append(msg, retry);
    container.appendChild(err);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'brett-sessions__list';
  for (const row of vm.rows) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'brett-sessions__row';
    a.href = `/api/join?code=${encodeURIComponent(row.code)}`;
    a.setAttribute('role', 'button');
    a.setAttribute('aria-label', row.ariaLabel);
    a.addEventListener('click', (e) => { e.preventDefault(); handlers.onJoin(row.code); });
    a.innerHTML = `
      <span class="brett-sessions__status"><span class="brett-sessions__dot brett-sessions__dot--${row.status}" aria-hidden="true"></span></span>
      <span class="brett-sessions__main">
        <span class="brett-sessions__line1">
          <span class="brett-sessions__title">${escapeHtml(row.title)}</span>
          <span class="brett-sessions__code">${escapeHtml(row.code)}</span>
        </span>
        <span class="brett-sessions__meta">${escapeHtml(row.metaLine)}</span>
      </span>
      <span class="brett-sessions__join"><span class="brett-sessions__pill">Beitreten</span><span class="brett-sessions__arrow" aria-hidden="true">→</span></span>`;
    li.appendChild(a);
    list.appendChild(li);
  }
  container.appendChild(list);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sessionsCss(): string {
  return [
    '.brett-sessions__head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;}',
    '.brett-sessions__eyebrow{display:flex;align-items:center;gap:10px;}',
    '.brett-sessions__bar{width:26px;height:2px;background:var(--brett-brass);flex:none;border-radius:2px;}',
    '.brett-sessions__eyebrow-label{font-family:var(--brett-font-mono);font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--brett-brass);}',
    '.brett-sessions__count{flex:none;min-width:22px;height:22px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--brett-font-mono);font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--brett-brass-2);background:oklch(0.80 0.09 75 / 0.12);border:1px solid oklch(0.80 0.09 75 / 0.32);border-radius:var(--brett-radius-pill);}',
    '.brett-sessions__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;}',
    '.brett-sessions__row{position:relative;display:flex;align-items:center;gap:14px;padding:15px 16px;text-decoration:none;cursor:pointer;background:var(--brett-ink-800);border:1px solid var(--brett-line);border-radius:var(--brett-radius-md);transition:transform var(--brett-dur-base) var(--brett-ease-soft),border-color var(--brett-dur-base),background var(--brett-dur-base),box-shadow var(--brett-dur-base);}',
    '.brett-sessions__row:hover{transform:translateY(-1px);border-color:oklch(0.80 0.09 75 / .5);background:var(--brett-ink-750);box-shadow:0 14px 34px -22px oklch(0.80 0.09 75 / .7),0 0 0 1px oklch(0.80 0.09 75 / .12);}',
    '.brett-sessions__row:focus-visible{outline:none;transform:translateY(-1px);border-color:var(--brett-brass-2);box-shadow:0 0 0 3px var(--brett-brass-dim);}',
    '.brett-sessions__status{flex:none;display:flex;align-items:center;}',
    '.brett-sessions__dot{width:9px;height:9px;border-radius:var(--brett-radius-pill);display:inline-block;}',
    '.brett-sessions__dot--laeuft{background:var(--brett-sage);animation:brett-livepulse 2.6s ease-out infinite;}',
    '.brett-sessions__dot--wartet{background:var(--brett-brass);box-shadow:0 0 6px oklch(0.80 0.09 75 / .5);}',
    '.brett-sessions__main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px;}',
    '.brett-sessions__line1{display:flex;align-items:baseline;gap:10px;min-width:0;}',
    '.brett-sessions__title{font-family:var(--brett-font-serif);font-weight:400;font-size:18px;letter-spacing:-.01em;color:var(--brett-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color var(--brett-dur-base);}',
    '.brett-sessions__row:hover .brett-sessions__title,.brett-sessions__row:focus-visible .brett-sessions__title{color:var(--brett-brass-2);}',
    '.brett-sessions__code{flex:none;font-family:var(--brett-font-mono);font-size:11px;letter-spacing:.1em;color:var(--brett-mute);padding:2px 7px;border:1px solid var(--brett-line-2);border-radius:6px;}',
    '.brett-sessions__meta{font-size:12.5px;color:var(--brett-mute);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.brett-sessions__join{flex:none;display:flex;align-items:center;gap:4px;}',
    '.brett-sessions__pill{font-family:var(--brett-font-sans);font-weight:600;font-size:13px;color:var(--brett-ink-900);background:var(--brett-brass);padding:7px 15px;border-radius:var(--brett-radius-pill);opacity:0;transform:translateX(6px);transition:opacity var(--brett-dur-base),transform var(--brett-dur-base),background var(--brett-dur-base);white-space:nowrap;}',
    '.brett-sessions__row:hover .brett-sessions__pill,.brett-sessions__row:focus-visible .brett-sessions__pill{opacity:1;transform:translateX(0);}',
    '.brett-sessions__row:hover .brett-sessions__pill{background:var(--brett-brass-2);}',
    '.brett-sessions__arrow{font-size:17px;color:var(--brett-mute);transition:opacity var(--brett-dur-base),transform var(--brett-dur-base);}',
    '.brett-sessions__row:hover .brett-sessions__arrow,.brett-sessions__row:focus-visible .brett-sessions__arrow{opacity:0;transform:translateX(8px);width:0;}',
    // skeletons / empty / error
    '.brett-sessions__skeletons{display:flex;flex-direction:column;gap:10px;}',
    '.brett-sessions__skeleton{height:62px;border-radius:var(--brett-radius-md);background:var(--brett-ink-800);border:1px solid var(--brett-line);opacity:.6;animation:brett-skeleton 1.4s ease-in-out infinite;}',
    '.brett-sessions__empty{margin:0;color:var(--brett-mute);font-size:13.5px;line-height:1.5;}',
    '.brett-sessions__error{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--brett-mute);font-size:13.5px;}',
    '.brett-sessions__retry{background:transparent;border:1px solid var(--brett-line-2);color:var(--brett-brass);border-radius:var(--brett-radius-pill);padding:6px 14px;font-family:var(--brett-font-sans);font-size:13px;font-weight:600;cursor:pointer;min-height:32px;}',
    '.brett-sessions__retry:hover{border-color:var(--brett-brass);}',
    '.brett-sessions__retry:focus-visible{outline:none;box-shadow:0 0 0 3px var(--brett-brass-dim);}',
    '@keyframes brett-livepulse{0%{box-shadow:0 0 0 0 oklch(0.80 0.06 160 / .5);}70%{box-shadow:0 0 0 7px oklch(0.80 0.06 160 / 0);}100%{box-shadow:0 0 0 0 oklch(0.80 0.06 160 / 0);}}',
    '@keyframes brett-skeleton{0%,100%{opacity:.4;}50%{opacity:.7;}}',
    '@media (prefers-reduced-motion: reduce){.brett-sessions__dot--laeuft,.brett-sessions__skeleton{animation:none;}}',
    '.brett-sessions__styles-id{}',
  ].join('\n');
}

const SESSIONS_STYLE_ID = 'brett-sessions-styles';

export function injectSessionsStyles(doc: Document = document): void {
  let style = doc.getElementById(SESSIONS_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = SESSIONS_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = sessionsCss();
}
```

- [ ] **Step 4: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/sessions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/sessions.ts brett/test/sessions.test.ts
git commit -m "feat(brett): add Offene-Sessions view-model + renderer with loading/empty/error states"
```

### H.3 — wire into the menu (main.ts)

- [ ] **Step 1: Inject styles + mount + poll in `main.ts`**

In `brett/src/client/main.ts`, add imports after line 12:
```ts
import { injectSessionsStyles, mountOpenSessions, buildOpenSessionsViewModel } from './ui/sessions';
import { startOpenSessionsPolling, type PollHandle, type OpenSession } from './open-sessions-client';
import { injectToastStyles } from './ui/toast';
```

In `main()`, after the existing `injectLobbyStyles();` (line 77), add:
```ts
  injectSessionsStyles();
  injectToastStyles();
```

Add a module-level poll handle near the top (after the imports):
```ts
let _sessionsPoll: PollHandle | null = null;
```

`mountSessionsList(menuRoot)` MUST run INSIDE the `if (menuRoot) { … }` guard (it does `menuRoot.querySelector('#brett-menu-sessions')` — calling it when `menuRoot` is null would throw). It must be the LAST statement inside that block, after the `mountMenu(...)` call returns and before the block's closing `}` (NOT at line 134, which is OUTSIDE the guard). Replace this EXACT verbatim end-of-block (the `mountMenu` call's last handler + its closing `});` + the block's closing `}`):
```ts
      onSettings: () => { /* disabled menu item — see FE-4; settings screen lands later */ },
    });
  }
```
with:
```ts
      onSettings: () => { /* disabled menu item — see FE-4; settings screen lands later */ },
    });
    mountSessionsList(menuRoot);
  }
```

Add this function after `startNewSession` (after line 153):
```ts
// Mount the Offene-Sessions list into the menu's #brett-menu-sessions slot and
// start visibility-aware polling. Loading → ready/empty/error states (Spec §6.1).
function mountSessionsList(menuRoot: HTMLElement): void {
  const slot = menuRoot.querySelector<HTMLElement>('#brett-menu-sessions');
  if (!slot) return;
  const join = (code: string) => { window.location.href = `/api/join?code=${encodeURIComponent(code)}`; };
  const render = (phase: 'loading' | 'ready' | 'error', sessions?: OpenSession[]) => {
    mountOpenSessions(slot, buildOpenSessionsViewModel({ phase, sessions }), {
      onJoin: join,
      onRetry: () => { render('loading'); _sessionsPoll?.stop(); _sessionsPoll = startPoll(); },
    });
  };
  const startPoll = (): PollHandle => startOpenSessionsPolling({
    onResult: (list) => render('ready', list),
    onError: () => render('error'),
  });
  render('loading');
  _sessionsPoll?.stop();
  _sessionsPoll = startPoll();
}
```

Stop polling when leaving the menu: in `renderView` (line 38-48), at the end of the function body add:
```ts
  if (!showMenu && _sessionsPoll) { _sessionsPoll.stop(); _sessionsPoll = null; }
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix brett run typecheck`
Expected: PASS.

- [ ] **Step 3: Build (smoke the Vite bundle)**

Run: `npm --prefix brett run build`
Expected: build succeeds (vite build + tsc server).

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/main.ts
git commit -m "feat(brett): mount Offene-Sessions list + polling in the menu"
```

---

## Task I: Lobby — brand language + states + a11y + copy success toast

Apply the brand veneer (Spec §5.2): the lobby is already token-clean, so this is veneer + states + copy-success toast.

**Files:**
- Modify: `brett/src/client/ui/lobby.ts:107` (copy button → success toast), `:223-248` (lobbyCss eyebrow/states)
- Test: extend `brett/test/lobby-render.test.ts` is NOT required (model unchanged); add `brett/test/lobby-css.test.ts`

- [ ] **Step 1: Write the failing CSS test**

Create `brett/test/lobby-css.test.ts`:

```ts
// brett/test/lobby-css.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lobbyCss } from '../src/client/ui/lobby';

test('lobbyCss adds eyebrow + token-driven section styling', () => {
  const css = lobbyCss();
  // NOTE: assert ONLY on the eyebrow class. `lobbyCss()` already contains
  // `letter-spacing` (in .brett-lobby__title / .brett-lobby__section-title), so an
  // `|| css.includes('letter-spacing')` clause would make this test pass before any
  // change — the TDD red step would never go red. Keep this assertion eyebrow-only.
  assert.ok(css.includes('.brett-lobby__eyebrow'), 'has eyebrow class');
});

test('lobbyCss is token-driven (no standalone hex)', () => {
  const stripped = lobbyCss().replace(/var\([^()]*\)/g, '');
  const hex = stripped.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
  assert.equal(hex, null, `unexpected hex: ${hex?.[0]}`);
});
```

- [ ] **Step 2: Run, verify it fails (or passes the hex check already; the eyebrow assert fails)**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-css.test.ts`
Expected: the eyebrow test FAILS (class not yet present).

- [ ] **Step 3: Add the copy-success toast**

In `lobby.ts`, add the toast import at the top (after line 10):
```ts
import { toast } from './toast';
```

Change the copy button (line 107) from:
```ts
    const copy = Button({ label: 'Kopieren', variant: 'ghost', onClick: () => handlers.onCopyCode(vm.sessionCode!) });
```
to:
```ts
    const copy = Button({
      label: 'Kopieren',
      variant: 'ghost',
      onClick: () => { handlers.onCopyCode(vm.sessionCode!); toast.success('Session-Code kopiert.'); },
    });
    copy.setAttribute('aria-label', `Session-Code ${vm.sessionCode} kopieren`);
```

- [ ] **Step 4: Add the eyebrow class to `lobbyCss`**

In `lobbyCss()` returned array, after the `.brett-lobby__title{...}` line (~228), add:
```ts
    '.brett-lobby__eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:16px;}',
    '.brett-lobby__eyebrow-bar{width:26px;height:2px;background:var(--brett-brass);border-radius:2px;}',
    '.brett-lobby__eyebrow-label{font-family:var(--brett-font-mono);font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--brett-brass);}',
```

Then render an eyebrow in `mountLobby`: after `header.appendChild(title);` (line 102), add:
```ts
  const eyebrow = document.createElement('div');
  eyebrow.className = 'brett-lobby__eyebrow';
  eyebrow.innerHTML = '<span class="brett-lobby__eyebrow-bar" aria-hidden="true"></span><span class="brett-lobby__eyebrow-label">Kontrollraum</span>';
  header.insertBefore(eyebrow, title);
```

- [ ] **Step 5: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-css.test.ts test/lobby-render.test.ts`
Expected: PASS (lobby-render still green; lobby-css green).

- [ ] **Step 6: Typecheck + commit**

```bash
npm --prefix brett run typecheck
git add brett/src/client/ui/lobby.ts brett/test/lobby-css.test.ts
git commit -m "feat(brett): lobby brand veneer (eyebrow) + copy success toast + aria"
```

---

## Task J: Board chrome — a11y, console removal, export feedback

P1-3 (focus-trap), P1-4 (no console.*), P1-5 (export feedback).

### J.1 — Remove/guard `console.*` in the prod path

**Files:**
- Modify: `brett/src/client/board-boot.ts:496,515,527,547`, `brett/src/client/ws-client.ts:561`, `brett/src/client/ui/export.ts:192`
- Test: `brett/test/no-console-prod.test.ts`

- [ ] **Step 1: Write the failing guard test**

Create `brett/test/no-console-prod.test.ts`:

```ts
// brett/test/no-console-prod.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLIENT = resolve(import.meta.dirname, '../src/client');
// Prod-path client files that must not call console.* (debug-gated allowed).
const FILES = ['board-boot.ts', 'ws-client.ts', 'ui/export.ts'];

for (const f of FILES) {
  test(`${f} has no ungated console.* in the prod path`, () => {
    const src = readFileSync(resolve(CLIENT, f), 'utf8');
    // Allow console.* only inside an `if (DEBUG)`-style guard or a comment.
    const lines = src.split('\n');
    const offenders = lines.filter((l) => {
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*')) return false;
      if (!/console\.(log|warn|error|info|debug)/.test(t)) return false;
      return !/DEBUG|__brettDebug/.test(t); // gated lines are fine
    });
    assert.deepEqual(offenders, [], `ungated console.* in ${f}:\n${offenders.join('\n')}`);
  });
}
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/no-console-prod.test.ts`
Expected: FAIL — current console.* calls flagged.

- [ ] **Step 3: Add a debug flag + replace board-boot logs**

In `board-boot.ts`, add near the top (after the imports):
```ts
const DEBUG = typeof window !== 'undefined' && Boolean((window as any).__brettDebug);
```

Then guard each console call:
- Line ~496 `console.log('[brett] scene up');` → `if (DEBUG) console.log('[brett] scene up');`
- Line ~515 `console.warn('[brett/replay] replay=1 but no room param');` → `if (DEBUG) console.warn('[brett/replay] replay=1 but no room param');`
- Line ~527 `console.error('[brett/replay] failed to load replay data', eventsRes.status, snapshotRes.status);` → `if (DEBUG) console.error('[brett/replay] failed to load replay data', eventsRes.status, snapshotRes.status);`
- Line ~547 `console.error('[brett/replay] error starting replay mode:', err);` → `if (DEBUG) console.error('[brett/replay] error starting replay mode:', err);`

- [ ] **Step 4: Replace ws-client log with a toast**

In `ws-client.ts`, add the toast import at the top:
```ts
import { toast } from './ui/toast';
```
Replace line ~561 `console.warn('[brett] server error:', msg.reason);` with:
```ts
      toast.error(`Serverfehler: ${msg.reason ?? 'unbekannt'}`);
```

- [ ] **Step 5: Replace export.ts log with a toast**

In `export.ts`, add the toast import at the top (with the other UI imports):
```ts
import { toast } from './toast';
```
Replace line ~192 `console.error('[brett] PDF-Export fehlgeschlagen:', err);` with:
```ts
        toast.error('PDF-Export fehlgeschlagen.');
```

- [ ] **Step 6: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/no-console-prod.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck + commit**

```bash
npm --prefix brett run typecheck
git add brett/src/client/board-boot.ts brett/src/client/ws-client.ts brett/src/client/ui/export.ts brett/test/no-console-prod.test.ts
git commit -m "fix(brett): remove ungated console.* from prod path; surface errors via toast"
```

### J.2 — Export PNG/JSON state feedback parity (P2-8)

**Files:**
- Modify: `brett/src/client/ui/export.ts` (PNG + JSON handlers)

- [ ] **Step 1: Add success/error toasts to PNG + JSON export**

> **REALITY (verified against `export.ts:179-185`):** the PNG and JSON handlers are SYNCHRONOUS and have NO try/catch — they are `() => { exportPng(canvas); }` / `() => { exportJson(); }`. Only the PDF handler (lines 187-198) is async and uses a `.catch().finally()` chain. So do NOT make PNG/JSON async; wrap each in a plain SYNCHRONOUS `try { … } catch { … }`. (The toast import was already added in Task J.1 Step 5 — `import { toast } from './toast';` — do not add it twice.)

Edit 1 — PNG handler. Replace this EXACT verbatim block:
```ts
  btnPng?.addEventListener('click', () => {
    exportPng(canvas);
  });
```
with:
```ts
  btnPng?.addEventListener('click', () => {
    try {
      exportPng(canvas);
      toast.success('PNG exportiert.');
    } catch {
      toast.error('PNG-Export fehlgeschlagen.');
    }
  });
```

Edit 2 — JSON handler. Replace this EXACT verbatim block:
```ts
  btnJson?.addEventListener('click', () => {
    exportJson();
  });
```
with:
```ts
  btnJson?.addEventListener('click', () => {
    try {
      exportJson();
      toast.success('JSON exportiert.');
    } catch {
      toast.error('JSON-Export fehlgeschlagen.');
    }
  });
```

> Leave the PDF handler unchanged here — Task J.1 Step 5 already replaced its `console.error('[brett] PDF-Export fehlgeschlagen:', err);` line with `toast.error('PDF-Export fehlgeschlagen.');`. The PDF handler keeps its existing `.catch().finally()` chain (it manages the `btnPdf.disabled` / `btnPdf.textContent` busy-state); do NOT convert it to try/catch.

- [ ] **Step 2: Typecheck + build**

Run: `npm --prefix brett run typecheck && npm --prefix brett run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): PNG/JSON export success+error feedback via toast (parity with PDF)"
```

### J.3 — Focus-trap + ESC + restore for fig-panel + appearance-drawer (P1-3)

**Files:**
- Modify: `brett/src/client/ui/fig-panel.ts:57-89`, `brett/src/client/ui/appearance.ts:81-102,216-252`

- [ ] **Step 1: Wire `a11y` into the fig-panel**

In `fig-panel.ts`, add the import at the top:
```ts
import { createFocusTrap, type FocusTrap } from './a11y';
```
Add a module-level handle (after line 59, near the other module constants):
```ts
let _figPanelTrap: FocusTrap | null = null;
```
In `openFigPanel()` (61-66), after `figPanel.hidden = false;`, add:
```ts
  _figPanelTrap = createFocusTrap(figPanel, { onEscape: closeFigPanel });
```
In `closeFigPanel()` (68-72), at the start of the function body, add:
```ts
  _figPanelTrap?.release();
  _figPanelTrap = null;
```

- [ ] **Step 2: Wire `a11y` into the appearance drawer**

In `appearance.ts`, add the import:
```ts
import { createFocusTrap, type FocusTrap } from './a11y';
```
Add a module-level handle (after line 87, near `_preOpenAppearance`):
```ts
let _drawerTrap: FocusTrap | null = null;
```
In `openAppearanceDrawer()` (89-96), after `appearanceDrawer.classList.add('open');`, add (NOTE: the trap call is wrapped in an `if (appearanceDrawer)` guard so it stays type-safe after Task J.6 makes `appearanceDrawer` nullable — `createFocusTrap` requires a non-null `HTMLElement`):
```ts
  if (appearanceDrawer) {
    _drawerTrap = createFocusTrap(appearanceDrawer, { onEscape: () => {
      const fig = STATE.figures.find(f => f.id === STATE.selectedId);
      if (fig && _preOpenAppearance) applyAppearanceToFig(fig, _preOpenAppearance);
      closeAppearanceDrawer();
    } });
  }
```
In `closeAppearanceDrawer()` (98-102), at the start, add:
```ts
  _drawerTrap?.release();
  _drawerTrap = null;
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix brett run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/ui/fig-panel.ts brett/src/client/ui/appearance.ts
git commit -m "feat(brett): focus-trap + ESC-close + focus-restore for fig-panel & appearance drawer"
```

### J.4 — Loading/empty grid states + apply-failure feedback (P2-7)

**Files:**
- Modify: `brett/src/client/ui/appearance.ts:216-252` (`initAppearance` catch → toast; empty grids)

- [ ] **Step 1: Add empty/error feedback to `initAppearance`**

In `appearance.ts`, add the toast import:
```ts
import { toast } from './toast';
```
In `initAppearance()` (216-222), replace the `catch { /* keep defaults */ }` with a visible-feedback fallback:
```ts
  } catch {
    toast.error('Aussehen-Vorlagen konnten nicht geladen werden.');
  }
```
In the `applyBtn?.addEventListener('click', ...)` handler (246-251), wrap the `sendUpdate` in a try/catch:
```ts
  applyBtn?.addEventListener('click', () => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (!fig) { closeAppearanceDrawer(); return; }
    try {
      sendUpdate(fig, { appearance: { ...fig.appearance } });
      toast.success('Aussehen übernommen.');
    } catch {
      toast.error('Aussehen konnte nicht übernommen werden.');
    }
    closeAppearanceDrawer();
  });
```
In `buildFaceGrid`/`buildBodyGrid`/`buildAccGrid`, when the source list is empty, append an empty hint.

> **CRITICAL ANCHOR (TDZ/TS2448):** In `buildFaceGrid` and `buildBodyGrid` the list variable (`const faces` / `const bodies`) is declared AFTER the `grid.innerHTML = '';` line. The empty-hint block reads that variable, so it MUST be inserted AFTER the `const …` declaration line, NOT after `grid.innerHTML = '';` (inserting after `innerHTML` references the variable before its declaration → TS2448 / temporal-dead-zone error). In `buildAccGrid`, `names` is a function parameter (already in scope), so inserting after its `grid.innerHTML = '';` is safe.

Apply these THREE exact verbatim edits (each old_string is unique to its function):

Edit 1 — `buildFaceGrid`, change:
```ts
  grid.innerHTML = '';
  const faces = Object.keys(PLACEMENT_SPEC.faces || {}).filter(k => !k.startsWith('_'));
```
to:
```ts
  grid.innerHTML = '';
  const faces = Object.keys(PLACEMENT_SPEC.faces || {}).filter(k => !k.startsWith('_'));
  if (faces.length === 0) { const e = document.createElement('p'); e.className = 'drawer-empty'; e.textContent = 'Keine Vorlagen verfügbar.'; grid.appendChild(e); }
```

Edit 2 — `buildBodyGrid`, change:
```ts
  grid.innerHTML = '';
  const bodies = Object.keys(PLACEMENT_SPEC.bodies || {}).filter(k => !k.startsWith('_'));
```
to:
```ts
  grid.innerHTML = '';
  const bodies = Object.keys(PLACEMENT_SPEC.bodies || {}).filter(k => !k.startsWith('_'));
  if (bodies.length === 0) { const e = document.createElement('p'); e.className = 'drawer-empty'; e.textContent = 'Keine Vorlagen verfügbar.'; grid.appendChild(e); }
```

Edit 3 — `buildAccGrid` (`names` is the function parameter, already in scope; insert right after the null-option append so the empty hint is visible when there are no accessories), change:
```ts
  grid.appendChild(nullEl);
  for (const name of names) {
```
to:
```ts
  grid.appendChild(nullEl);
  if (names.length === 0) { const e = document.createElement('p'); e.className = 'drawer-empty'; e.textContent = 'Keine Vorlagen verfügbar.'; grid.appendChild(e); }
  for (const name of names) {
```

Add the `.drawer-empty` style to `index.html`'s Appearance Drawer region (after `.thumb-item.null-item.active img` rule ~line 193):
```html
    .drawer-empty { font-size: 10px; color: var(--brett-mute, #8c96a3); padding: 8px 2px; }
```

- [ ] **Step 2: Typecheck + build**

Run: `npm --prefix brett run typecheck && npm --prefix brett run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add brett/src/client/ui/appearance.ts brett/public/index.html
git commit -m "feat(brett): appearance drawer loading/empty states + apply success/error toast"
```

### J.5 — aria-labels on icon/emoji buttons (P1-2)

**Files:**
- Modify: `brett/public/index.html:299-360` (presets, PHYS/IK, export, aussehen, fig-panel-btn)

- [ ] **Step 1: Add aria-labels to the topbar buttons**

In `index.html`, add `aria-label` to each emoji/icon button (the visible text is decorative). Apply these exact edits:

- `<button id="fig-panel-btn" aria-expanded="false" aria-controls="fig-panel">＋ Figur ▾</button>` → add `aria-label="Figur hinzufügen oder bearbeiten"`:
  `<button id="fig-panel-btn" aria-expanded="false" aria-controls="fig-panel" aria-label="Figur hinzufügen oder bearbeiten">＋ Figur ▾</button>`
- `<button id="appearance-btn" disabled title="Aussehen bearbeiten">✦ Aussehen</button>` → add `aria-label="Aussehen bearbeiten"`.
- `<button id="btn-export-png" class="icon-btn" title="...">📷 PNG</button>` → add `aria-label="Als PNG exportieren"`.
- `<button id="btn-export-json" class="icon-btn" title="...">{ } JSON</button>` → add `aria-label="Als JSON exportieren"`.
- `<button id="btn-export-pdf" class="icon-btn" title="...">📄 PDF</button>` → add `aria-label="Als PDF exportieren"`.
- The PHYS/IK spans (lines 308/310) are not interactive; add `aria-hidden="true"` to the emoji-only spans is NOT needed (they carry `title`). Leave as-is.
- `<button id="fig-panel-add">＋ Klick auf Brett zum Platzieren</button>` keeps its descriptive text (no aria needed).

- [ ] **Step 2: Commit**

```bash
git add brett/public/index.html
git commit -m "a11y(brett): add aria-labels to topbar icon/emoji buttons"
```

### J.6 — Harden top-level `getElementById(...)!` (P1-4, Spec §7.4)

`hud.ts:6` and `appearance.ts:81-85` do non-null `getElementById(...)!` at module load. These modules load only in the board context, so the elements exist there; but a missing element should fail soft, not crash the module. Make the references defensive without changing the call sites that already null-check.

**Files:**
- Modify: `brett/src/client/ui/hud.ts:6`, `brett/src/client/ui/appearance.ts:81`

- [ ] **Step 1: Guard the hud status-pill reference**

In `hud.ts`, line 6 is:
```ts
const pillEl = document.getElementById('status-pill')!;
```
Change it to a nullable lookup and guard the two write sites. Replace line 6 with:
```ts
const pillEl = document.getElementById('status-pill');
```
Then in `updateStatusPill()` every `pillEl.textContent = '…';` must become `if (pillEl) pillEl.textContent = '…';`. There are 6 such assignments in `updateStatusPill` (the drag, POV, free-fly, observer, no-fig, and default branches). Prefix each with `if (pillEl) `. (TypeScript will flag the un-guarded ones under `strictNullChecks`, so the typecheck step confirms you got all of them.)

- [ ] **Step 2: Guard the appearance-drawer top-level reference**

In `appearance.ts`, line 81 is:
```ts
const appearanceDrawer = document.getElementById('appearance-drawer')!;
```
Change it to:
```ts
const appearanceDrawer = document.getElementById('appearance-drawer');
```

Now `appearanceDrawer` is `HTMLElement | null`. Apply these THREE exact verbatim edits to guard every member access (each old_string below is unique in the file):

Edit 1 — in `openAppearanceDrawer`, change:
```ts
  appearanceDrawer.classList.add('open');
```
to:
```ts
  appearanceDrawer?.classList.add('open');
```

Edit 2 — in `closeAppearanceDrawer`, change:
```ts
  appearanceDrawer.classList.remove('open');
```
to:
```ts
  appearanceDrawer?.classList.remove('open');
```

Edit 3 — in `initAppearance`, change:
```ts
    if (appearanceDrawer.classList.contains('open')) {
```
to:
```ts
    if (appearanceDrawer?.classList.contains('open')) {
```

> **IMPORTANT — the `createFocusTrap(appearanceDrawer, …)` ARGUMENT (Task J.3):** `createFocusTrap`'s first parameter is a non-null `HTMLElement`, so passing `appearanceDrawer` (now `HTMLElement | null`) would be a TS2345 error. Task J.3 ALREADY wraps that call in `if (appearanceDrawer) { _drawerTrap = createFocusTrap(appearanceDrawer, …); }`, so inside that block TypeScript narrows `appearanceDrawer` to `HTMLElement` and the call is type-safe. Do NOT add `?.` to the `createFocusTrap` argument and do NOT remove the J.3 guard.

The typecheck step (Step 3) confirms all accesses are guarded — zero `Object is possibly 'null'` and zero TS2345 errors.

- [ ] **Step 3: Typecheck (this is the gate that catches missed guards)**

Run: `npm --prefix brett run typecheck`
Expected: PASS — zero `Object is possibly 'null'` errors. If any appear, guard the flagged line.

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/ui/hud.ts brett/src/client/ui/appearance.ts
git commit -m "fix(brett): harden top-level getElementById refs in hud/appearance (P1-4)"
```

---

## Task K: Connection-status indicator

P2-10: replace the bare online-count with "verbunden / verbindet … / getrennt" derived from ws-client states.

**Files:**
- Modify: `brett/src/client/ws-client.ts` (emit status on open/close/connecting), `brett/public/index.html:352` (markup), `brett/src/client/ui/hud.ts` (optional pill text)
- Test: `brett/test/connection-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `brett/test/connection-status.test.ts`:

```ts
// brett/test/connection-status.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionLabel, type ConnState } from '../src/client/ws-client';

test('connectionLabel maps each state to German copy', () => {
  assert.equal(connectionLabel('connected'), 'verbunden');
  assert.equal(connectionLabel('connecting'), 'verbindet …');
  assert.equal(connectionLabel('disconnected'), 'getrennt');
});

test('ConnState union is the three values', () => {
  const s: ConnState[] = ['connected', 'connecting', 'disconnected'];
  assert.equal(s.length, 3);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/connection-status.test.ts`
Expected: FAIL — `connectionLabel` not exported.

- [ ] **Step 3: Add `connectionLabel` + status emission to ws-client**

In `ws-client.ts`, add near the top (after the imports):
```ts
export type ConnState = 'connected' | 'connecting' | 'disconnected';

/** Pure: connection state → German status copy (Spec §7.10). */
export function connectionLabel(s: ConnState): string {
  return s === 'connected' ? 'verbunden' : s === 'connecting' ? 'verbindet …' : 'getrennt';
}

function setConnState(s: ConnState): void {
  const ind = typeof document !== 'undefined' ? document.getElementById('online-indicator') : null;
  if (!ind) return;
  ind.dataset.conn = s;
  const dot = ind.querySelector('.conn-dot');
  const label = ind.querySelector('.conn-label');
  if (label) label.textContent = connectionLabel(s);
  if (dot) (dot as HTMLElement).dataset.conn = s;
}
```

In `connectWS()`, call `setConnState`:
- After `const ws = new WebSocket(...)` (line ~171) add: `setConnState('connecting');`
- Inside `ws.addEventListener('open', () => { setWsReady(true); ... })` (line 174), add `setConnState('connected');` as the first statement.
- Inside `ws.addEventListener('close', () => { setWsReady(false); ... })` (line 182), add `setConnState('disconnected');` as the first statement.

- [ ] **Step 4: Update the markup in index.html**

In `index.html`, replace line 352:
```html
      <span id="online-indicator">● <span id="online-count">1</span> online</span>
```
with:
```html
      <span id="online-indicator" data-conn="connecting">
        <span class="conn-dot" data-conn="connecting" aria-hidden="true"></span>
        <span class="conn-label">verbindet …</span>
        <span class="conn-sep" aria-hidden="true">·</span>
        <span id="online-count">1</span> online
      </span>
```

Add the dot styling to the Topbar chrome region in index.html (after the `#online-indicator` rule from Task E Step 4):
```html
    #online-indicator .conn-dot { width:8px; height:8px; border-radius:999px; background:var(--brett-status-connecting, oklch(0.86 0.09 75)); display:inline-block; }
    #online-indicator .conn-dot[data-conn="connected"] { background:var(--brett-status-connected, oklch(0.80 0.06 160)); }
    #online-indicator .conn-dot[data-conn="disconnected"] { background:var(--brett-status-disconnected, #e0796b); }
    #online-indicator .conn-sep { color:var(--brett-line-2, rgba(255,255,255,0.12)); margin:0 2px; }
```

> The existing `info` message handler (ws-client.ts:442-448) still updates `#online-count` — leave it. We only added the connection-state dot/label around it.

- [ ] **Step 5: Run, verify pass + build**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/connection-status.test.ts && npm --prefix brett run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ws-client.ts brett/public/index.html
git commit -m "feat(brett): connection-status indicator (verbunden/verbindet/getrennt)"
```

---

## Task L: Mobile breakpoints + touch targets (P2-11)

Ensure drawers/panels/modals work on mobile; touch targets ≥ 44 px; topbar scroll shadow.

**Files:**
- Modify: `brett/public/index.html` (media queries + min-height bumps)

- [ ] **Step 1: Bump touch targets to ≥44px on coarse pointers**

In `index.html`, add a `@media (pointer: coarse)` block at the end of the `<style>` (before `</style>` line 290):
```html
    /* ── Touch targets ≥ 44px on coarse pointers (Production-Readiness §7.11) ── */
    @media (pointer: coarse) {
      .preset-btn, .icon-btn, #fig-panel-btn, #appearance-btn,
      .drawer-cancel, .drawer-apply, .fig-size-btn, #fig-panel-add {
        min-height: 44px;
      }
      .brett-sessions__row { padding: 18px 16px; }
    }
```

- [ ] **Step 2: Add a topbar horizontal-scroll shadow indicator**

Replace the existing `@media (max-width: 600px)` `#topbar` rule (lines 131-143) with one that adds a right-edge fade:
```html
    @media (max-width: 600px) {
      #topbar {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        min-height: 44px;
        height: auto;
        flex-wrap: nowrap;
        -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%);
                mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%);
      }
      #topbar::-webkit-scrollbar { display: none; }
      #stiffness { width: 90px; }
      #status-pill { font-size: 11px; padding: 6px 10px; }
    }
```

- [ ] **Step 3: Ensure fig-panel + appearance-drawer fit small screens**

The appearance drawer already has `@media (max-width:480px){ #appearance-drawer { width:100%; } }` (line 216-218). Add a fig-panel mobile rule near it:
```html
    @media (max-width: 480px) {
      #fig-panel { position: fixed; top: 44px; left: 0; right: 0; width: auto; max-height: calc(100vh - 60px); overflow-y: auto; border-radius: 0 0 var(--brett-radius-md, 12px) var(--brett-radius-md, 12px); }
    }
```

- [ ] **Step 4: Build (CSS-only change; smoke)**

Run: `npm --prefix brett run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): mobile breakpoints, ≥44px touch targets, topbar scroll-shadow"
```

---

## Task P: Pose presets — Eindeutschung + new "Sitzen" pose

Spec §5.4. Eindeutsche the visible labels (keys unchanged), add the `sitzen` pose to client + server, add the `Sitzen` button between Stehen and Knien.

> **Server rationale:** the server has no pose map today (`brett/src/server/presets.ts` is figure-pack/appearance presets only). The spec mandates a server pendant. Add a NEW exported `POSE_PRESETS` constant to `brett/src/server/presets.ts` mirroring the client map, so the server-side SSOT exists for future validation. It is additive and imported by nothing yet — but a unit test asserts the two maps agree.

**Files:**
- Modify: `brett/src/client/presets.ts:5-60` (add `sitzen`)
- Modify: `brett/src/server/presets.ts` (add `POSE_PRESETS` with all poses incl. `sitzen`)
- Modify: `brett/public/index.html:299-304` (eindeutsche labels + add Sitzen button)
- Test: `brett/test/preset-sitzen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `brett/test/preset-sitzen.test.ts`:

```ts
// brett/test/preset-sitzen.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/client/presets';
import { POSE_PRESETS } from '../src/server/presets';

const BONES = ['hips','head','lShoulder','rShoulder','lElbow','rElbow','lWrist','rWrist','lHip','rHip','lKnee','rKnee','lAnkle','rAnkle'];

test('client PRESETS has a complete sitzen pose (all 14 bones)', () => {
  const p = PRESETS['sitzen'];
  assert.ok(p, 'sitzen exists');
  for (const b of BONES) assert.ok(p[b], `sitzen.${b} defined`);
  assert.equal(p.lHip.x, -1.5708);
  assert.equal(p.lKnee.x, 1.5708);
});

test('server POSE_PRESETS mirrors the client pose keys', () => {
  assert.deepEqual(Object.keys(POSE_PRESETS).sort(), Object.keys(PRESETS).sort());
});

test('server sitzen angles equal client sitzen angles', () => {
  assert.deepEqual(POSE_PRESETS['sitzen'], PRESETS['sitzen']);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/preset-sitzen.test.ts`
Expected: FAIL — `sitzen` missing + `POSE_PRESETS` not exported.

- [ ] **Step 3: Add `sitzen` to client `presets.ts`**

In `brett/src/client/presets.ts`, inside the `PRESETS` object, insert the `sitzen` entry AFTER the `stand` block (after line 14) and before `kneel`:

```ts
  sitzen: {
    hips:{x:0,z:0}, head:{x:0,z:0},
    lShoulder:{x:0.1,z: 0.08}, rShoulder:{x:0.1,z:-0.08},
    lElbow:{x:0.2,z:0}, rElbow:{x:0.2,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.5708,z:0}, rHip:{x:-1.5708,z:0},
    lKnee:{x: 1.5708,z:0}, rKnee:{x: 1.5708,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
```

- [ ] **Step 4: Add `POSE_PRESETS` to server `presets.ts`**

In `brett/src/server/presets.ts`, append at the END of the file (after `savePresets`):

```ts
// ── Pose presets (server SSOT mirror of client presets.ts; Spec §5.4) ─────────
// Joint-angle maps (bone → {x,z} radians). Additive: mirrors the client PRESETS
// so the server has a validation-ready copy. Keep in sync with
// brett/src/client/presets.ts.
export const POSE_PRESETS: Record<string, Record<string, { x: number; z: number }>> = {
  stand: {
    hips:{x:0,z:0}, head:{x:0,z:0},
    lShoulder:{x:0,z: 0.05}, rShoulder:{x:0,z:-0.05},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:0,z:0}, rHip:{x:0,z:0},
    lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  sitzen: {
    hips:{x:0,z:0}, head:{x:0,z:0},
    lShoulder:{x:0.1,z: 0.08}, rShoulder:{x:0.1,z:-0.08},
    lElbow:{x:0.2,z:0}, rElbow:{x:0.2,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.5708,z:0}, rHip:{x:-1.5708,z:0},
    lKnee:{x: 1.5708,z:0}, rKnee:{x: 1.5708,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  kneel: {
    hips:{x:0,z:0}, head:{x:-0.05,z:0},
    lShoulder:{x:0.1,z: 0.25}, rShoulder:{x:0.1,z:-0.25},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.3,z:0}, rHip:{x:-1.3,z:0},
    lKnee:{x: 1.7,z:0}, rKnee:{x: 1.7,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  prone: {
    hips:{x:-1.5,z:0}, head:{x:0.2,z:0},
    lShoulder:{x:-1.2,z: 0.1}, rShoulder:{x:-1.2,z:-0.1},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:0,z:0}, rHip:{x:0,z:0},
    lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  crawl: {
    hips:{x:-1.4,z:0}, head:{x:0.15,z:0},
    lShoulder:{x:-1.3,z: 0.05}, rShoulder:{x:-1.3,z:-0.05},
    lElbow:{x:0.1,z:0}, rElbow:{x:0.1,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.3,z:0}, rHip:{x:-1.3,z:0},
    lKnee:{x: 1.55,z:0}, rKnee:{x: 1.55,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  slump: {
    hips:{x:-0.7,z:0}, head:{x:0.5,z:0},
    lShoulder:{x:0.6,z: 0.35}, rShoulder:{x:0.6,z:-0.35},
    lElbow:{x:0.4,z:0}, rElbow:{x:0.4,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.4,z:0}, rHip:{x:-1.4,z:0},
    lKnee:{x: 1.3,z:0}, rKnee:{x: 1.3,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  tpose: {
    hips:{x:0,z:0}, head:{x:0,z:0},
    lShoulder:{x:0,z: 1.5708}, rShoulder:{x:0,z:-1.5708},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:0,z:0}, rHip:{x:0,z:0},
    lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
};
```

- [ ] **Step 5: Eindeutsche labels + add Sitzen button in index.html**

In `index.html`, replace the preset button group (lines 299-304):
```html
      <button class="preset-btn" data-preset="stand">Stand</button>
      <button class="preset-btn" data-preset="kneel">Kneel</button>
      <button class="preset-btn" data-preset="prone">Prone</button>
      <button class="preset-btn" data-preset="crawl">Crawl</button>
      <button class="preset-btn" data-preset="slump">Slump</button>
      <button class="preset-btn" data-preset="tpose">T-Pose</button>
```
with (keys unchanged; labels eingedeutscht; `Sitzen` added between Stehen and Knien):
```html
      <button class="preset-btn" data-preset="stand">Stehen</button>
      <button class="preset-btn" data-preset="sitzen">Sitzen</button>
      <button class="preset-btn" data-preset="kneel">Knien</button>
      <button class="preset-btn" data-preset="prone">Liegen</button>
      <button class="preset-btn" data-preset="crawl">Kriechen</button>
      <button class="preset-btn" data-preset="slump">Sacken</button>
      <button class="preset-btn" data-preset="tpose">T-Pose</button>
```

- [ ] **Step 6: Run, verify pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/preset-sitzen.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck + build**

Run: `npm --prefix brett run typecheck && npm --prefix brett run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add brett/src/client/presets.ts brett/src/server/presets.ts brett/public/index.html brett/test/preset-sitzen.test.ts
git commit -m "feat(brett): German pose labels + new Sitzen pose (client+server presets)"
```

> **Design-sensible note (for the human review-gate, NOT the executor):** after deploy, visually verify the `sitzen` joint angles look natural. If they look off, fine-tune via `dev-flow-execute` (Opus) — do NOT have the autonomous executor guess new angles.

---

## Task V: Full verification gate

Run every gate the CI runs. All must be green before opening the PR.

**Files:** none (verification only)

- [ ] **Step 1: brett typecheck**

Run: `npm --prefix brett run typecheck`
Expected: no errors.

- [ ] **Step 2: brett unit tests (all)**

Run: `npm --prefix brett test`
Expected: all tests pass (existing + new: theme-tokens, primitives-states, toast, a11y, onboarding-tokens, facelift-tokens, no-hardcoded-brand-css, menu-render, menu-model, open-sessions-server, open-sessions-client, sessions, lobby-css, lobby-render, no-console-prod, connection-status, preset-sitzen).

- [ ] **Step 3: brett build**

Run: `npm --prefix brett run build`
Expected: vite build + tsc server build succeed.

- [ ] **Step 4: grep checks from Spec §10**

Run these and confirm the expected output:

```bash
# §10.1 — no legacy literals left in inline CSS (outside var fallbacks). These
# should only appear as the #fallback inside var(--brett-…, #hex):
grep -nE '#e7ead0|#0e1014' brett/public/index.html | grep -v 'var(--brett'
# Expected: NO lines (every legacy literal is now a var() fallback or removed).

# §10.3 — no ungated console.* in the prod client path:
grep -rnE 'console\.(log|warn|error|info|debug)' brett/src/client \
  | grep -v 'DEBUG' | grep -v '__brettDebug' | grep -v '\.test\.'
# Expected: NO lines.

# legacy --parchment / --slate / --hairline-soft references gone from index.html:
grep -nE '--parchment|--slate|--hairline-soft|--brass,|--brass-rgb|--brass-soft' brett/public/index.html
# Expected: NO lines (all migrated to --brett-*).
```

If any grep returns lines, fix the offending file (re-run the relevant task's edits) before proceeding.

- [ ] **Step 5: repo-level offline tests**

Run: `task test:all`
Expected: green (unit + factory + manifests + … ; brett changes do not touch repo bats, but the systembrett-template shell test runs in CI — confirm `bash scripts/tests/systembrett-template.test.sh` passes locally).

- [ ] **Step 6: Commit any fixes from the grep gate**

```bash
git add -A
git commit -m "chore(brett): verification-gate fixes" --allow-empty
```

(Skip the commit if the grep gate produced no fixes.)

---

## Task W: Deploy + E2E

Deploy via `task feature:brett`, verify the SERVED `dist/client` (not just pod-ready), then run E2E (Spec §9/§13).

**Files:**
- Create: `tests/e2e/specs/brett-rebrand.spec.ts`

> **Deploy footgun (MEMORY: deploy from a fresh tree):** `task feature:brett` builds from the cwd working tree. Run it from THIS worktree (`/tmp/wt-systembrett-production-rebrand`), with the branch merged to `main` first (PR merged), or from a worktree off `origin/main` after merge. Do NOT deploy from a stale `main` checkout.

- [ ] **Step 1: Write the E2E spec — HUMAN / OPUS TASK (NOT for the autonomous factory)**

> **DO NOT auto-execute this step.** Authoring + wiring this Playwright spec requires judgment about the live brett auth/storageState plumbing that the autonomous (DeepSeek) executor cannot reliably get right — there is NO generic auth helper in `tests/e2e/helpers/` (that directory contains ONLY `billing.ts`). Brett E2E auth is done via a **Playwright setup project**, not a helper import. A human (or Opus via `dev-flow-execute`) must wire it.
>
> **The real wiring (verified against `tests/e2e/playwright.config.ts`):**
> - Auth is seeded by the setup spec `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts`, registered as the project `brett-mentolder-setup` (`testMatch: '**/brett-mentolder-auth-setup.spec.ts'`).
> - The authenticated brett tests run under the `brett-mentolder` project, which `dependencies: ['brett-mentolder-setup']` and loads `storageState: '.auth/mentolder-brett.json'`. Its `testMatch` array currently lists `brett-mannequin.spec.ts` / `brett-roles.spec.ts` (etc.).
> - To wire the new spec: add `'**/brett-rebrand.spec.ts'` to the `brett-mentolder` project's `testMatch` array so it inherits that project's `storageState` + `baseURL`. (The korczewski brand runs a separate `korczewski` project with its own setup; add it there too if the spec should cover both brands.)
> - Do NOT invent a `tests/e2e/helpers/` auth import — the spec gets its authenticated context purely from the project's `storageState`, so it needs no auth code of its own.

Create `tests/e2e/specs/brett-rebrand.spec.ts` (Playwright). The spec body below needs no auth import — it relies on the `brett-mentolder` project's `storageState`. Cover Spec §9:

```ts
import { test, expect } from '@playwright/test';

// Brett rebrand E2E (Spec §9). Runs post-deploy against the live brand.
// Authenticated context comes from the `brett-mentolder` Playwright project's
// storageState (.auth/mentolder-brett.json, seeded by brett-mentolder-setup) — no
// auth import here. Wire via the project testMatch (see Step 1 note above).

test.describe('Systembrett rebrand', () => {
  test('menu renders with hero, eyebrow, and sessions section', async ({ page }) => {
    await page.goto('/'); // brett base URL via playwright project config
    await expect(page.locator('.brett-menu__hero')).toBeVisible();
    await expect(page.locator('.brett-menu__eyebrow-label').first()).toContainText('mentolder');
    await expect(page.locator('#brett-menu-sessions')).toBeVisible();
  });

  test('sessions section shows a state (loading→empty or rows)', async ({ page }) => {
    await page.goto('/');
    // Either the empty hint or at least one row eventually appears.
    await expect(
      page.locator('.brett-sessions__empty, .brett-sessions__row, .brett-sessions__error').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('join row is keyboard-focusable when sessions exist', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('.brett-sessions__row').first();
    if (await row.count()) {
      await row.focus();
      await expect(row).toBeFocused();
      await expect(row.locator('.brett-sessions__pill')).toBeVisible();
    }
  });

  test('GET /api/sessions/open returns the documented shape', async ({ request }) => {
    const res = await request.get('/api/sessions/open');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.sessions)).toBeTruthy();
    if (body.sessions.length) {
      const s = body.sessions[0];
      expect(typeof s.code).toBe('string');
      expect(['laeuft', 'wartet']).toContain(s.status);
      expect(typeof s.participantCount).toBe('number');
    }
  });
});
```

> **Wiring (human/Opus):** register the spec by adding `'**/brett-rebrand.spec.ts'` to the `brett-mentolder` project's `testMatch` array in `tests/e2e/playwright.config.ts` (and the `korczewski` project's `testMatch` for cross-brand coverage). That project supplies the authenticated `storageState` (`.auth/mentolder-brett.json`, seeded by the `brett-mentolder-setup` project). No `tests/e2e/helpers/` auth import is needed — that directory only has `billing.ts`.

- [ ] **Step 2: Commit the spec**

```bash
git add tests/e2e/specs/brett-rebrand.spec.ts
git commit -m "test(brett): E2E for rebranded menu, sessions list, and /api/sessions/open"
```

- [ ] **Step 3: Open the PR (after Task V is green)**

Use the dev-flow PR mechanics for this branch. PR title: `feat(brett): production-readiness & mentolder voll-rebrand`. PR body summarizes the phases + links the spec + the menu asset. Wait for CI (typecheck/test/build/`task test:all`) green.

- [ ] **Step 4: After merge — deploy**

Run: `task feature:brett`
(Builds + imports/pushes `:latest` for both brands. `:latest` is intentional — do not pin.)

- [ ] **Step 5: Verify the SERVED bundle (not just pod-ready)**

```bash
# Confirm the rebranded menu CSS class shipped into the served dist/client.
kubectl --context fleet -n workspace exec deploy/brett -- sh -c \
  "grep -rl 'brett-menu__hero' dist/client/assets/ | head -1"
# Expected: a hashed JS/CSS asset path (the menu class is in the bundle).
kubectl --context fleet -n workspace-korczewski exec deploy/brett -- sh -c \
  "grep -rl 'brett-menu__hero' dist/client/assets/ | head -1"
# Expected: same for the korczewski brand.
```

If grep finds nothing, the deploy shipped a stale image — rebuild from a fresh tree off `origin/main` and re-deploy.

- [ ] **Step 6: Run E2E against the live brands**

Run the brett E2E project (Spec §9). Use the repo's e2e runner against both brands:
```bash
bash scripts/task-oracle.sh 'run brett e2e tests against mentolder and korczewski'
```
Expected: the four `brett-rebrand.spec.ts` tests pass on both brands.

- [ ] **Step 7: Human review-gate (Spec §10)**

This is the design-quality gate the autonomous executor CANNOT self-certify. The human reviewer (or Opus via `dev-flow-execute`) compares the live menu to `docs/superpowers/specs/assets/2026-06-08-brett-menu-final.html` and confirms acceptance criteria §10.1–§10.7. Any design-sensible miss (menu fidelity, `sitzen` angles) is fixed by Opus, not the executor.

---

## Acceptance Criteria (Spec §10) — final checklist

- [ ] §10.1 — No hardcoded color/line value in the GUI outside `theme.ts` (drift-map §4.1 fully done) — verified by the Task V grep gate + `facelift-tokens.test.ts` + `no-hardcoded-brand-css.test.ts`.
- [ ] §10.2 — Menu matches the design asset (hero crown, ambient stage, sessions list, all states) — human review-gate.
- [ ] §10.3 — All P1 met; `grep -rn "console\." brett/src/client` (prod path) empty / debug-gated — Task V Step 4.
- [ ] §10.4 — `GET /api/sessions/open` returns the shape; menu shows Loading/Empty/Error — Task G/H + E2E.
- [ ] §10.5 — Keyboard run-through menu→lobby→board with no focus trap; modals ESC-closable — Task D/J + E2E.
- [ ] §10.6 — `task test:all` + brett typecheck green — Task V.
- [ ] §10.7 — `prefers-reduced-motion` disables animations — verified in menu/sessions/toast CSS (each has the media query).

---

## Out of Scope (Spec §11)

- No change to 3D scene/physics/IK or the WS protocol (only the additive read endpoint + additive `sitzen` pose).
- No i18n framework — consistent German only.
- "Gespeicherte Aufstellungen" / "Einstellungen" stay disabled ("bald verfügbar").
- No fine-grained sessions visibility/permissions this iteration (noted for later, Spec §6.2).

## Deferred (P3, out of scope for this run)

These Spec §7 P3 items are intentionally NOT addressed by any task in this plan — they have no task and no executor action this iteration. Documented here so their absence is deliberate, not an oversight:

- **P3-13 — Consolidate `window.__brettFeatures` reads.** Multiple modules read the `__brettFeatures` flag bag directly (e.g. `export.ts:168-170`). Centralizing them behind a single typed accessor is a refactor with no user-visible change; deferred to a future cleanup iteration.
- **P3-15 — Keyboard-shortcut hints.** Surfacing discoverable hints for keyboard shortcuts is a net-new UX feature beyond the production-readiness/rebrand scope of this run; deferred.
