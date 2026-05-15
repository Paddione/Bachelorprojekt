---
ticket_id: T000397
title: Brett Jump + Collision — Implementation Plan
domains: []
status: active
pr_number: null
---

# Brett Jump + Collision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Spring-Mechanik (Leertaste) und Inter-Figur-Kollision mit Impuls-Bounce in `brett/public/index.html`, mit Sync via neuem `jump`-Event über den bestehenden `brett/server.js` WebSocket.

**Spec:** [`docs/superpowers/specs/2026-05-15-brett-jump-collision-design.md`](../specs/2026-05-15-brett-jump-collision-design.md).

**Tech-Stack:** Vanilla Three.js (geladen über `three.min.js`), bestehender Bone-Spring-Loop, Node.js + `ws` Server, Postgres-persisted Brett-State (unverändert).

---

## Task 1 — Konstanten + Figur-State erweitern

**Datei:** `brett/public/index.html`

- [ ] Konstanten-Block einfügen (am Anfang von `<script>`, direkt nach `BONE_NAMES`):
  ```js
  const BODY_RADIUS = 0.30;
  const JUMP_V0 = 4.5;
  const GRAVITY = 12.0;
  const BOUNCE_K_DRAG = 6.0;
  const BOUNCE_K_LAND = 9.0;
  const COLLISION_MAX_ITER = 3;
  ```
- [ ] In `makeMannequin()` (Line 309 ff.) im zurückgegebenen Objekt zusätzlich:
  ```js
  jumping: false,
  jumpV: 0,
  jumpY: 0,
  ```

## Task 2 — Jump-Trigger (Leertaste)

**Datei:** `brett/public/index.html`

- [ ] Globaler Keydown-Listener (nach dem bestehenden `addEventListener('click', …)`-Block für Panel-Toggle, ≈ Line 405):
  ```js
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    const id = STATE.selectedId || STATE.hoveredId;
    if (!id) return;
    const fig = STATE.figures.find(f => f.id === id);
    if (!fig || fig.jumping) return;
    e.preventDefault();
    startJump(fig);
    sendJump(fig.id);
  });
  ```
- [ ] `STATE.hoveredId` initialisieren (Line 143): `window.STATE = { figures: [], selectedId: null, hoveredId: null, stiffness: 0.65, online: 1 };`
- [ ] Im Hover-Handler des bestehenden Pointermove-Codes `STATE.hoveredId` setzen (suche `hits = raycaster.intersectObject(fig.root, true)` ≈ Line 615).

## Task 3 — Jump-Animation im Frame-Loop

**Datei:** `brett/public/index.html`

- [ ] `function startJump(fig)` einfügen (vor dem Frame-Loop ≈ Line 525):
  ```js
  function startJump(fig) {
    fig.jumping = true;
    fig.jumpV = JUMP_V0;
    fig.jumpY = 0;
  }
  ```
- [ ] Im Frame-Loop (Line 531 ff.) **vor** dem Floor-Clamp `if (minY < 0) …` einfügen:
  ```js
  if (fig.jumping) {
    fig.jumpY += fig.jumpV * dt;
    fig.jumpV -= GRAVITY * dt;
    if (fig.jumpY <= 0) {
      fig.jumpY = 0;
      fig.jumpV = 0;
      fig.jumping = false;
      resolveCollisions(fig, BOUNCE_K_LAND); // Landungs-Impact
    }
    fig.root.position.y = fig.jumpY;
  }
  ```
- [ ] Floor-Clamp (Line 566) modifizieren: nur greifen wenn `!fig.jumping`.

## Task 4 — Collision-Resolution

**Datei:** `brett/public/index.html`

- [ ] `function resolveCollisions(movedFig, impulseK)` einfügen (nahe dem Spring-Block, ≈ Line 525):
  ```js
  function resolveCollisions(movedFig, impulseK) {
    for (let iter = 0; iter < COLLISION_MAX_ITER; iter++) {
      let resolved = false;
      for (const other of STATE.figures) {
        if (other === movedFig) continue;
        const dx = other.root.position.x - movedFig.root.position.x;
        const dz = other.root.position.z - movedFig.root.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        const minDist = 2 * BODY_RADIUS;
        if (dist >= minDist || dist === 0) continue;
        const nx = dx / dist, nz = dz / dist;
        const overlap = minDist - dist + 0.02;
        other.root.position.x += nx * overlap;
        other.root.position.z += nz * overlap;
        // Bone-Impuls
        for (const name of BONE_NAMES) {
          other.bone[name].velocity.x += impulseK * nx;
          other.bone[name].velocity.z += impulseK * nz;
        }
        // Broadcast neue Position
        sendMove(other.id, other.root.position.x, other.root.position.z);
        resolved = true;
      }
      if (!resolved) break;
    }
  }
  ```
- [ ] Im Drag-Handler (≈ Line 695, wo `fig.root.position.x = …` während Drag passiert) nach jeder Position-Änderung `resolveCollisions(fig, BOUNCE_K_DRAG)` aufrufen — aber gedrosselt auf ~30 Hz via `if (now - fig._lastCollisionCheck > 33) { … }`.
- [ ] Nach Walk-Tween-Schritt (Line 736-737) ebenfalls `resolveCollisions(fig, BOUNCE_K_DRAG)`.

## Task 5 — Network: Send-Helpers + Jump-Event

**Datei:** `brett/public/index.html`

- [ ] Suche nach bestehendem `sendMove` o.ä. Helper (`grep -n 'ws.send\|wsSend' brett/public/index.html`). Wenn keine `sendJump`-Funktion existiert, neue Helper neben den anderen anlegen:
  ```js
  function sendJump(figId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'jump', id: figId }));
    }
  }
  ```
- [ ] Im WS-`onmessage`-Handler (suche `case 'move'` analog) Case ergänzen:
  ```js
  case 'jump': {
    const fig = STATE.figures.find(f => f.id === msg.id);
    if (fig && !fig.jumping) startJump(fig);
    break;
  }
  ```
- [ ] Bei eingehendem `move`-Event nach dem Anwenden zusätzlich `resolveCollisions(fig, BOUNCE_K_DRAG)` aufrufen, damit auch Empfänger-Clients lokal kippen sehen.

## Task 6 — Server: Jump-Event akzeptieren + broadcasten

**Datei:** `brett/server.js`

- [ ] In der Liste der erlaubten Mutation-Types (Line 392) `'jump'` ergänzen:
  ```js
  if (['add','move','update','delete','clear','optik','stiffness','jump'].includes(msg.type)) {
  ```
- [ ] In `applyMutation` keinen State-Eintrag schreiben für `jump` — Event ist transient. Einfach `case 'jump': break;` am Ende des `switch`.
- [ ] Stelle sicher dass `broadcast(room, msg, ws)` (Line 394) wie heute weiterläuft — keine Änderung nötig, das `jump`-Event geht so an alle anderen Clients.

## Task 7 — UI-Hinweis (Nice-to-have)

**Datei:** `brett/public/index.html`

- [ ] Im Figur-Panel (`#fig-panel`) eine kleine Zeile "**Space** = Sprung" als `<small>` nahe den Preset-Buttons einfügen. Wenn die Stelle nicht offensichtlich ist, in einem Kommentar als Follow-up markieren statt blind anzunehmen.

## Task 8 — Tests + Verifikation

- [ ] Lokal: `task brett:build` (importiert Image in k3d) erfolgreich.
- [ ] Lokal: `task workspace:validate` bleibt grün.
- [ ] Manuelle Smoke-Tests (in zwei Browsern, gleicher Raum):
  - Selektiere Figur A, drücke Leertaste → A springt sichtbar.
  - Drücke Leertaste über A, während A direkt neben B steht → bei Landung wird B verschoben und schlackert.
  - Ziehe A langsam in B hinein → B wird sanft weggeschoben (kein Hard-Stop, keine Überlappung dauerhaft).
  - Im zweiten Browser sind beide Aktionen sichtbar.
- [ ] Performance-Check in der Browser-DevTools-Console (200 Figuren): Frame-Time bleibt < 16 ms.
- [ ] Smoke gegen Production: nach `task feature:brett` einmal `https://brett.mentolder.de` und `https://brett.korczewski.de` öffnen, dasselbe testen.

## Task 9 — PR

- [ ] PR-Titel: `feat(brett): jump (space) + bounce-on-collision für figuren [TICKET_ID]`
- [ ] PR-Body: 2-Bullet-Summary + Test plan (was manuell getestet wurde).
- [ ] Squash-Merge nach grünem CI.

## Task 10 — Post-Merge Deploy

- [ ] `task feature:brett` (rebuild + roll auf mentolder + korczewski).
- [ ] Verify: beide Brett-URLs im Browser, Jump+Collision funktioniert.

---

## Out-of-Scope / Follow-Ups

- Sound-FX für Sprung und Bounce.
- Charge-Jump / Double-Jump.
- Wand/Boundary-Kollision (Brett hat heute keine Wände — separate Design-Frage).
- Friction-Modell für Bounce (heute: Empfänger stoppt sofort).
