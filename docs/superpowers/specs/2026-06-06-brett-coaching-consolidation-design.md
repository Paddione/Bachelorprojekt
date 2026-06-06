---
title: "Brett → reines Coaching-Systembrett (Mayhem-Konsolidierung)"
date: 2026-06-06
topic: brett-coaching-consolidation
status: draft
slice: "1 von 5 (Konsolidierung)"
---

# Brett → reines Coaching-Systembrett (Slice 1: Konsolidierung)

## Kontext

`brett/` ist ein Node.js-3D-„Systembrett" (Systemaufstellung/Coaching), ausgeliefert als
`k3d/brett.yaml`. Es trägt heute zwei Modi: **Coaching** (seriöse Aufstellungsarbeit) und
**Mayhem** (ein chaotisches Kampfspiel auf derselben 3D-Engine). Die mentolder-Brand läuft auf
`coaching`, die korczewski-Brand wird per Overlay auf `mayhem` gepatcht (`brett.korczewski.de`).

Dieses Dokument ist die **erste von fünf** geplanten Iterationen. Es beschreibt **ausschließlich
die Konsolidierung**: Mayhem vollständig entfernen, das Mode-Konzept abschaffen, beide Brands auf
ein einziges, ruhiges Coaching-Brett bringen. Die inhaltlichen Erweiterungen (Perspektive,
Session-Sicherheit, Bedeutung, Dokumentation) sind eigene spätere Slices (s. *Roadmap*).

## Ziel / Vision

Ein **einziges, ruhiges Systemaufstellungs-Brett**. Es gibt **kein Mode-Konzept** mehr — Brett
*ist* das Coaching-Brett. Figuren werden bewusst gesetzt und gestellt und stehen still; alles
Spiel-/Action-hafte ist entfernt. Beide Brands (mentolder **und** korczewski) sind danach
coaching-only und verhalten sich identisch (nur Brand-Theming/Routing unterscheidet sie).

## Getroffene Entscheidungen (aus dem Brainstorming)

| Thema | Entscheidung |
|---|---|
| Grundausrichtung | **Reine Aufstellung** (ruhig, statisch, Tiefe statt Spiel) |
| Mayhem-Code | **Hart löschen** — beide Brands werden coaching-only; korczewskis Spiel wird stillgelegt |
| Mode-Konzept | **Ganz entfernen** (`BRETT_DEFAULT_MODE`, `/api/config` Mode-Felder, Mode-Select-Screen) |
| Erster Slice | **Nur Konsolidierung** (Erweiterungen folgen als eigene Specs) |
| Figuren-Walking (Gait) | **Drop** — Neupositionieren bleibt per Ziehen (sofort) |
| Audio | **Stumm in v1** (Web-Audio-Engine entfällt mit Mayhem; ggf. später) |
| Custom-GLB-Personen | **Drop** — bestehendes Aussehen-System (Gesicht/Körper/Accessoires/12 Farben) bleibt |
| Room-Browser | **Drop** — Join-by-Code deckt den Einstieg ab |
| Mayhem-Admin-React-Panel | **Drop** — Phasen-/Teilnehmer-Steuerung bleibt im Coaching-HUD; echte Facilitator-Konsole = späterer Slice |

## Verifizierte Architektur-Fakten (Stand Code, 2026-06-06)

Diese Fakten sind durch Code-Inspektion bestätigt und machen die Arbeit konkret:

1. **`brett/public/assets/scene.js` ist toter Code.** Kein `import` referenziert die Datei; ihr
   einziger Export `setLightIntensity` wird nirgends benutzt. Die **lebende** Szene ist das
   Inline-`<script>` in `index.html` (Z. 313–1937), das `makeMannequin` (482), `addFigure` (629)
   und den `__brettInitMayhem`-Bridge (1460–1471) definiert. → `scene.js` wird **gelöscht**.

2. **`brett/public/assets/main.js` ist ein reiner Mayhem-Bootstrap.** Für Coaching gilt
   `shouldConnectAuxWs('coaching') === false` und `chosen !== 'mayhem'` → main.js tut für Coaching
   **nichts** außer den Mode-Select-Screen zu zeigen. → main.js wird **gelöscht** (samt
   `<script src="assets/main.js">`-Tag in `index.html:1996`).

3. **Der lebende Coaching-Client** ist das Inline-Modul `index.html:1938–1965`: importiert
   `coaching/wire.mjs` + `coaching/hud.mjs`, hängt sich an `window.__brettWS` (Großschreibung;
   gesetzt vom Inline-Scene-Script — **nicht** main.js' `window.__brettWs`), mountet Join-Overlay
   oder Coaching-HUD und zeigt den `session_created`-Toast. Dieses Modul gatet aktuell auf
   `cfg.defaultMode === 'coaching'` und muss **unbedingt von der `/api/config`-Mode-Abfrage befreit**
   und unbedingt-laufend gemacht werden.

4. **korczewski-Overlay patcht env per numerischem Index** (`env/3,7,8,11,13`) — Quelle des
   Index-Footguns (s. u.).

## Schnitt im Detail

### A · Server (`brett/server.js`)

**Entfernen:**
- `buildConfig`-Mode-Logik (245–251) und alle Mode-Felder in `/api/config` (267–268).
  `/api/config` darf weiterhin Nicht-Mode-Config liefern (z. B. Brand), aber **kein**
  `defaultMode`/`availableModes` mehr.
- `boardAuthRedirect`-Verzweigung (258–259): das Board ist **immer** SSO-gated (die
  „mayhem bleibt public"-Sonderbehandlung fällt weg).
- Mutationen `mayhem_mode` (1000) und `game_mode_change` (1005).
- Admin-Handler `admin_mayhem_toggle` (1448) und `admin_mode_set` (1455).
- `player_death`-Spiel-Logik (1383–1391) inkl. `handleLmsDeath` (795) und `handleDuelDeath` (804).
- Alle Mayhem-/Game-Mode-Einträge aus `RELAY_TYPES` (766+) und `TRANSIENT_TYPES` (781+)
  (`mayhem_mode`, `hit`, `player_death`, `vehicle_*`, `hero_*`, `duel_*`, …). Nur Coaching- und
  Figuren-Nachrichtentypen bleiben.

**Behalten (unverändert):**
- `session_phase_set` (1010), `session_code_set` (1014), `coaching_steps_set` (1030),
  `admin_coaching_steps_set` (1546).
- Figuren-Mutationen, Snapshots-API, Soft-Locks, Presence, Join-by-Code, PostgreSQL-Persistenz, OIDC/SSO.

**Achten auf:** Der Server ist generisch (relayed/persistiert beliebige Mutationstypen). Nach dem
Entfernen der Mayhem-Typen müssen unbekannte/alte Nachrichtentypen weiterhin **graceful ignoriert**
werden (kein Crash), falls ein veralteter Client sie sendet.

### B · Client (`brett/public/`)

**Komplett löschen:**
- `assets/main.js`, `assets/mode-select.mjs`, `assets/mode-state.mjs`,
  `assets/coaching/ws-gate.mjs`, `assets/loadout-modal.mjs`, `assets/room-browser.js`,
  **`assets/scene.js` (toter Zwilling)**.
- Verzeichnisse: `assets/mayhem/`, `public/admin/`, `assets/touch/`, `assets/sfx/`,
  Mayhem-`assets/skins/`, `assets/game_assets_mentolder/`, `assets/game_assets_korczewski/`.
  *(Vor dem Löschen von `assets/skins/`/`assets/sfx/` verifizieren, dass dort kein Coaching-Asset
  liegt — das Aussehen-System der Coaching-Figuren sitzt in `index.html`, nicht hier.)*
- CSS: `mayhem.css`, `admin.css` (Z. 11–12).

**`index.html` anpassen:**
- Script-Tags entfernen: die 21 Mayhem-Tags (1966–1986), `room-browser.js` (1987), die 7
  Admin-JSX-Tags (1989–1995), `main.js`-Tag (1996).
- **React/Babel-CDN-Tags (8–10)**: per `grep` verifizieren, dass sie *nur* vom Admin-JSX
  (`type="text/babel"`) genutzt werden (Coaching ist Vanilla-DOM); falls ja, entfernen — eliminiert
  eine externe CDN-Abhängigkeit.
- Inline-Scene-Script (313–1937): den `__brettInitMayhem`-Bridge (1460–1471) und alle weiteren
  Mayhem-Hooks strippen; `makeMannequin`/`addFigure`/Figuren- & Szenen-Logik **bleibt**.
- Inline-Coaching-Modul (1938–1965): den `if (cfg.defaultMode === 'coaching')`-Guard entfernen,
  Coaching **unbedingt** laufen lassen; nicht mehr von `/api/config.defaultMode` abhängen.
- Status-Pill-/Hinweistexte: Combat-Formulierungen → Coaching-Anleitung (Auswählen, Ziehen-zum-Stellen).

### C · Manifeste & Deploy

- **`k3d/brett.yaml`**: den `BRETT_DEFAULT_MODE`-env-Eintrag (Index 11, Z. 87–88) entfernen.
- **`prod-korczewski/kustomization.yaml`**: den `op: replace … /env/11 → mayhem`-Patch (125–127)
  entfernen. Die Brand-/URL-Repoints (`env/3` Keycloak, `env/7` public URL, `env/8` website URL,
  `env/13` BRETT_BRAND) **bleiben** — sonst bricht korczewskis OIDC/Routing.

> ⚠️ **Index-Footgun (kritisch):** Das Overlay patcht env **per numerischem Index**. Entfernt man
> `env/11` aus der Base, verschieben sich Index 12 (`BRETT_PRESETS_PATH`) → 11 und Index 13
> (`BRETT_BRAND`) → 12. Der Overlay-Patch `env/13` träfe dann den falschen Eintrag.
> **Empfohlene robuste Lösung:** die korczewski-env-Repoints von index-basiertem JSON6902 auf einen
> **strategic-merge-Patch (by `name`)** umstellen — env-Listen mergen unter strategic merge über den
> `name`-Schlüssel, wodurch die Reihenfolge irrelevant wird. Alternative (fragil): die Indizes von
> Hand nachziehen (`env/13` → `env/12`). In **jedem** Fall ist `task workspace:validate` für
> **beide** Brands Pflicht-Gate.

### D · Tests & Verifikation

- **Mayhem-Tests löschen:** `game-mode.test.js`, `physics.test.js`, `damage.test.mjs`,
  `duel-server-auth.test.js`, `pickups.test.mjs`, `server-mayhem.test.js`, `keybindings.test.js`
  (+ ggf. weitere mayhem-spezifische).
- **`coaching-isolation.test.mjs` umdrehen:** statt „kein Mayhem-UI-Leak" nun **Abwesenheit**
  asserten — kein `assets/mayhem/`-Verzeichnis, keine Mayhem-Script-Tags in `index.html`, kein
  `mayhem`/`game_mode`/`mode-select` mehr in Client/Server-Quellen.
- **Coaching-Suite grün halten/anpassen:** `coaching-steps`, `locks`, `presence`, `phases`,
  `hud-model`, `join-overlay`, `figure-label`, `figure-locks`, `session-state`, `join-code`.
- `npm test` (mit `MOCK_DB=true`) muss vollständig grün sein.
- `task workspace:validate` für **mentolder UND korczewski** (wegen der Overlay-Änderung).
- **Dev-Smoke** auf `brett.localhost`: Figur setzen, stellen/posen, Blickrichtung, Label, Phasen
  durchschalten, Join-by-Code, Snapshot-Persistenz über Reconnect.

### E · Deploy

Push-basiert via `task feature:brett` (Build + Push + Rollout beider Brands). Nach Merge bewusst
deployen; beide Brands sind danach coaching-only. **Hinweis:** korczewskis Mayhem-Spiel ist danach
weg (bewusste Entscheidung). `Recreate`-Strategy + In-Memory-Rooms → Deploy-Zeitpunkt so wählen,
dass keine aktive Session abreißt.

## Risiken & Gotchas

1. **Env-Index-Shift im korczewski-Overlay** (s. C) — höchstes Bruchrisiko; strategic-merge + Validate beider Brands.
2. **`scene.js`/`main.js`-Löschung** — verifiziert ohne Importe; final prüfen, dass das Dockerfile
   `public/` pauschal kopiert (kein expliziter Einzel-Referenz auf die Dateien).
3. **`/api/config.defaultMode`-Abhängigkeit** des Inline-Coaching-Moduls — muss entfernt werden,
   sonst startet Coaching nach dem Mode-Abbau nicht.
4. **Graceful-Ignore** veralteter Nachrichtentypen serverseitig nach Relay-Type-Entfernung.
5. **korczewski OIDC/Routing** muss die Overlay-Änderung überleben (Repoints erhalten).

## Erfolgskriterien (Acceptance)

- [ ] Kein `assets/mayhem/`, kein `mode-select`/`mode-state`/`ws-gate`, kein `scene.js`/`main.js`,
      kein `public/admin/` mehr im Repo.
- [ ] `grep -ri mayhem brett/` liefert keine Treffer in lauffähigem Code (höchstens in Doku/History).
- [ ] Kein Mode-Konzept: kein `BRETT_DEFAULT_MODE`, keine Mode-Felder in `/api/config`, kein Mode-Select-UI.
- [ ] Beide Brands liefern ein identisches Coaching-only-Board; korczewski-OIDC/Routing intakt.
- [ ] `npm test` grün; `task workspace:validate` grün für **beide** Brands.
- [ ] Dev-Smoke auf `brett.localhost` besteht (Figuren, Phasen, Join, Snapshot).

## Out of Scope (spätere Slices — Roadmap)

| Slice | Inhalt |
|---|---|
| 2 · Perspektive & Sicht | POV/Perspektivwechsel, Beobachter-/Free-Fly-Modus, Spotlight/Dim/Freeze |
| 3 · Session-Sicherheit | Undo/Redo, Snapshot-UI, Export (Bild/JSON/PDF) |
| 4 · Bedeutung | Figurentypen (Person/Rolle/abstraktes Element), Beziehungs-/Spannungslinien, Distanz-/Blick-Readouts, Boden-Anker |
| 5 · Dokumentation | Notizen/Repräsentanten-Statements, Timeline/Replay, Session-Templates |
| (quer) | Facilitator-Konsole, ruhiges Audio, GLB-Personen-Modelle |
