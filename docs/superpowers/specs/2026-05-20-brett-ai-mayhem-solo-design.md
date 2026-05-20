# Spec: Brett Solo AI Mayhem — 1 Spieler vs. 3 KI

**Datum:** 2026-05-20  
**Brainstorming-Wahl:** Option A — Quick Solo-Start Button  
**Branch:** `feature/brett-ai-mayhem-mode`

---

## Problem

Mayhem-Modus in Brett ist aktuell ausschließlich über einen Multiplayer-WebSocket-Room erreichbar. Ein Spieler muss erst einen Room öffnen und warten — oder alleine im Room sitzen. Es gibt keinen direkten "Alleine spielen"-Einstieg, obwohl die KI-Bot-Infrastruktur (`MayhemAIBot`) bereits vollständig implementiert ist und Bots automatisch auf `MAX_PLAYERS=4` auffüllen.

## Ziel

Einen **"Alleine spielen"**-Button (Solo-Modus) hinzufügen, der sofort Mayhem mit 3 KI-Gegnern startet — ohne Warten auf andere Spieler, ohne sichtbaren Room-Join-Flow.

## Bestandsaufnahme

```
brett/public/assets/
├── mayhem/
│   ├── ai-bot.js          ✅ MayhemAIBot (215 Zeilen, voll funktional)
│   ├── game-mode.js       ✅ warmup/deathmatch/lms/coop
│   ├── mayhem.js          ✅ Haupt-Engine, MAX_PLAYERS=4, spawnAIBot()
│   └── ...
├── mode-select.mjs        ✅ coaching / ffa Cards
├── mode-state.mjs         ✅ VALID = {coaching, ffa, mode-select}
└── main.js                ✅ mode === 'ffa' → startMayhem()
```

**Was fehlt:**
- Mode `'mayhem-solo'` ist nicht in `VALID` in `mode-state.mjs`
- Kein Button in `mode-select.mjs` für Solo
- `main.js` kennt kein `'mayhem-solo'`-Routing
- Kein privater/isolierter Room-Start ohne Join-Möglichkeit

## Lösung (Option A)

### 1. `mode-state.mjs` — Solo-Mode validieren

```js
const VALID = new Set(['coaching', 'ffa', 'mode-select', 'mayhem-solo']);
```

### 2. `mode-select.mjs` — Solo-Button hinzufügen

Neue Mode-Card neben coaching/ffa:

```html
<button class="mode-card" data-mode="mayhem-solo">
  <span class="mode-icon">🥊</span>
  <span class="mode-title">Mayhem — Solo</span>
  <span class="mode-desc">1 Spieler vs. 3 KI-Gegner · Sofort starten</span>
</button>
```

### 3. `main.js` — Routing für `'mayhem-solo'`

```js
if (mode === 'mayhem-solo') {
  startMayhemSolo();
}
```

### 4. `mayhem.js` — `startMayhemSolo()` Funktion

Startet einen privaten Room (`solo-` + UUID), joined diesen sofort als Host, startet dann `start()` mit `isHost=true`. Da kein anderer den Room-Code kennt, bleibt der Spieler alleine und Bots füllen die 3 freien Slots.

Alternativ: WebSocket-Verbindung komplett überspringen, Bot-Tick direkt im Client ohne WS-Sync.

**Entscheidung:** WS-Verbindung bleibt (minimaler Eingriff), aber Room-ID ist UUID-basiert + nicht joinbar über Room-Browser.

### 5. HUD-Anpassung (optional, bonus)

Im Solo-Modus: HUD zeigt "vs. KI" Badge statt Spielerzahl.

## User Flow

```
Mode-Select → [🥊 Mayhem Solo] → Sofort im Spiel
                                  3 Bots gespawnt
                                  Modus: Deathmatch (default)
                                  R zum Respawn nach Tod
```

## Out of Scope

- KI-Schwierigkeitsstufen (Option D — separates Feature)
- Offline-Modus ohne WebSocket (Option B)
- Einladungs-Link für Freunde (Option C)

## Verifikation

- `node --test brett/test/mode-state.test.mjs` — `mayhem-solo` im VALID-Set
- Manuell: Brett öffnen → Solo-Button → sofort Mayhem mit 3 Bots
- Bestehende Tests bleiben grün
