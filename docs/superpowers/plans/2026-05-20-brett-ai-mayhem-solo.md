---
brainstorm_choice: A — Quick Solo-Start Button (empfohlen)
brainstorm_session: 1278992-1779301538
ticket_id: T000121
title: "Brett Solo AI Mayhem — 1P vs 3 KI Quick-Start Button"
date: 2026-05-20
status: staged
domains: [brett, website]
branch: feature/brett-ai-mayhem-mode
spec: docs/superpowers/specs/2026-05-20-brett-ai-mayhem-solo-design.md
---

# Plan: Brett Solo AI Mayhem — 1P vs 3 KI Quick-Start Button

## Ziel

Einen "Mayhem Solo"-Button in den Brett Mode-Select Screen einfügen, der sofort Mayhem mit 3 KI-Gegnern startet — ohne Warten auf Mitspieler, minimaler Eingriff in die bestehende Codebasis.

## Hintergrund

Die `MayhemAIBot`-Infrastruktur ist bereits vollständig implementiert und füllt automatisch auf `MAX_PLAYERS=4` auf. Es fehlt lediglich ein Einstiegspunkt, der ohne Multiplayer-Lobby-Flow direkt Mayhem startet.

**Brainstorming-Wahl:** Option A (Quick Solo-Start Button) — ~2h, minimaler Eingriff.

---

## Schritt 1 — `mode-state.mjs`: `'mayhem-solo'` in VALID aufnehmen

**Datei:** `brett/public/assets/mode-state.mjs`

```diff
-const VALID = new Set(['coaching', 'ffa', 'mode-select']);
+const VALID = new Set(['coaching', 'ffa', 'mode-select', 'mayhem-solo']);
```

**Test:** `mode-state.test.mjs` — neuer Case: `setMode('mayhem-solo')` gibt `true` zurück.

---

## Schritt 2 — `mode-select.mjs`: Solo-Card hinzufügen

**Datei:** `brett/public/assets/mode-select.mjs`

Neue Mode-Card-Schaltfläche nach der FFA-Card:

```html
<button class="mode-card" data-mode="mayhem-solo">
  <span class="mode-icon">🥊</span>
  <span class="mode-title">Mayhem — Solo</span>
  <span class="mode-desc">1 Spieler vs. 3 KI-Gegner · Sofort starten</span>
</button>
```

Kein neues Routing nötig — die bestehende `data-mode`-Click-Handler-Logik übernimmt das automatisch via `modeState.setMode(btn.dataset.mode)`.

---

## Schritt 3 — `main.js`: Routing für `'mayhem-solo'`

**Datei:** `brett/public/assets/main.js`

```diff
 if (mode === 'ffa') {
   startMayhem({ ... });
 }
+if (mode === 'mayhem-solo') {
+  startMayhemSolo();
+}
```

---

## Schritt 4 — `mayhem.js`: `startMayhemSolo()` implementieren

**Datei:** `brett/public/assets/mayhem/mayhem.js`

Neue exportierte Funktion `startMayhemSolo()`:

```js
function startMayhemSolo() {
  // Privaten Room mit zufälliger ID erstellen — kein anderer kennt den Code
  const soloRoomId = 'solo-' + crypto.randomUUID();
  // Bestehenden start()-Flow aufrufen; Bot-Fill läuft automatisch da humanCount=1
  start({ roomId: soloRoomId, isSolo: true });
}
```

Anpassung in `start()`:
- `isSolo`-Flag → Room-Browser versteckt diesen Room (nicht joinbar)
- Modus: startet direkt mit `deathmatch` statt `warmup` (oder konfigurierbar)
- HUD: Badge "vs. KI" wenn `isSolo`

---

## Schritt 5 — `room-browser.js`: Solo-Rooms ausblenden

**Datei:** `brett/public/assets/room-browser.js`

Rooms deren ID mit `'solo-'` beginnt werden in der Room-Liste nicht angezeigt:

```diff
 rooms.filter(r => /* ... existierende Filter ... */)
+      .filter(r => !r.id.startsWith('solo-'))
```

---

## Schritt 6 — HUD (optional): "vs. KI" Badge

**Datei:** `brett/public/assets/hud/` (je nach HUD-Implementierung)

Im Solo-Modus einen kleinen "🤖 vs. KI"-Indikator im HUD anzeigen.

---

## Verifikation

### Automatisiert

```bash
# Brett-Unit-Tests inkl. neuem mode-state Case
npm ci --prefix brett && node --test brett/test/mode-state.test.mjs

# Alle Brett-Tests
node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/damage.test.mjs brett/test/pickups.test.mjs brett/test/mode-state.test.mjs

# Template-Test
./scripts/tests/systembrett-template.test.sh
```

### Manuell

1. `task brett:deploy ENV=dev` (oder `brett:build` + lokaler Server)
2. Brett öffnen → Mode-Select → "🥊 Mayhem Solo" Button sichtbar
3. Klick → sofort im Spiel, 3 Bots gespawnt, kein Lobby-Warten
4. Bots bewegen sich, schießen, sterben und respawnen
5. Bots erscheinen **nicht** im Room-Browser

### Regressions-Check

```bash
task test:all
```

---

## Dateien

| Datei | Änderung |
|---|---|
| `brett/public/assets/mode-state.mjs` | `'mayhem-solo'` in VALID |
| `brett/public/assets/mode-select.mjs` | Neue Solo-Card |
| `brett/public/assets/main.js` | Routing `'mayhem-solo'` → `startMayhemSolo()` |
| `brett/public/assets/mayhem/mayhem.js` | `startMayhemSolo()` + `isSolo`-Flag |
| `brett/public/assets/room-browser.js` | Solo-Rooms ausfiltern |
| `brett/test/mode-state.test.mjs` | Neuer Test für `'mayhem-solo'` |

---

## Deploy

```bash
task feature:brett
```

Verify: `https://brett.mentolder.de` + `https://brett.korczewski.de`
