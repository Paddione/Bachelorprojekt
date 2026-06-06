---
title: "Brett — Gruppen-Aufstellungs-Lobby + UI-Facelift"
date: 2026-06-06
slug: brett-gruppen-lobby
status: draft
ticket_id: null
domains: [brett, frontend]
---

# Brett — Gruppen-Aufstellungs-Lobby + UI-Facelift

## 1. Kontext & Ausgangslage

Das **Coaching-Systembrett** (`brett/`) ist ein produktionsreifes 3D-Multiplayer-Board
(TypeScript, Three.js 0.184, `ws`-WebSocket, PostgreSQL-JSONB-Persistenz) für
systemische Aufstellungsarbeit. Heute:

- **Figuren**: platzieren, ziehen, Gliedmaßen per CCD-IK bewegen, springen, skalieren,
  Labels/Farben, Gesichter/Körper/Accessoires, benannte Personen (markenabhängig).
- **Session/Coach**: 6-stelliger Code, Phasen `warmup → active → paused → ended`,
  Admin-Token-Handoff, Kick, Coaching-Steps (Text), Idle-Timeout (2 min), Grace-Period.
- **Multiplayer**: Presence, Figuren-Locks mit Namens-Badges, globaler Stiffness-Regler,
  Auto-Save (1 s Debounce) + Snapshots.
- **Auth**: Keycloak/OIDC, `isAdmin`-Claim, Markenfilterung.

**Schmerzpunkt (vom Nutzer benannt):** Es fehlt ein **Hauptmenü → Lobby (mit vorgelagerten
Einstellungen) → Runde starten**-Fluss; das aktuelle UI ist „unschön". Heute bootet der
Client direkt ins Brett; das Rollenmodell ist flach (ein Admin + alle gleichberechtigt,
nur durch kurzzeitige Locks serialisiert).

### Zielszenario

**Gruppen-/Team-Aufstellung** — mehrere Teilnehmer als Stellvertreter, ein Leiter, ggf.
Beobachter. Genau hier hat die Multiplayer-Architektur den größten Hebel und ist heute am
dünnsten ausgestattet.

## 2. Ziele & Nicht-Ziele

### Ziele
1. **Hauptmenü** als erster Screen (Neue Session / Beitreten / Gespeicherte / Einstellungen).
2. **Hybrid-Lobby**: Live-Roster, Rollen-Vergabe, vorgelagerte Einstellungen; Leiter kann
   jederzeit starten; Late-Joiner fallen direkt in die laufende Runde.
3. **Vier vorgelagerte Einstellungen**: Szenario-Vorlage · Rollen & Teilnehmer ·
   Coaching-Ablauf · Board-Optik.
4. **Volle Rollen-Durchsetzung**: Leiter = alles · Stellvertreter = nur eigene Figur(en) ·
   Beobachter = read-only — durchgesetzt im Mutations-Pfad.
5. **UI-Facelift** im **mentolder-Marken-Look**: neue Screens + gemeinsames Design-System,
   inkl. Anhebung der bestehenden In-Board-Panels.
6. **Latente Inkonsistenzen** im berührten Code bereinigen (siehe §4).

### Nicht-Ziele (Out of Scope)
- Tiefen-Mechanik der Aufstellung (Empfindungs-Rückmeldung der Stellvertreter, Blickrichtungs-
  Semantik) — eigener späterer Zyklus.
- Export als Bild/Video, Undo/Redo, Replay/Aufzeichnung.
- Touch/Mobile-Gesten, vollständige Accessibility (a11y) — über die neuen DOM-Screens hinaus.
- korczewski-Kore-Look (bewusst mentolder gewählt).

## 3. Entscheidungen (aus dem Brainstorming)

| Aspekt | Entscheidung |
|---|---|
| Szenario | Gruppen-/Team-Aufstellung |
| Kern-Feature | Hauptmenü → Hybrid-Lobby → Runde starten |
| Lobby-Settings | Alle 4 (Vorlage · Rollen/Teilnehmer · Ablauf · Optik) |
| Lobby-Modell | **Hybrid** (Roster live + jederzeit Start + Late-Join) |
| Rollen | **Volle Durchsetzung** (Figur-Eigentümerschaft) |
| UI-Umfang | Neue Screens **+ gemeinsames Design-System** |
| Optik | Marken-Look **mentolder** |
| Stellvertreter-Rechte | **Default:** Leiter platziert & weist zu; Stellvertreter bewegen
  nur eigene Figur (kein Add/Delete). Toggle `allowRepresentativeAdd` (Default: aus). |
| Zuschnitt | **Ein Plan**, intern gestaffelt A–E (jede Phase einzeln merge-/grün-bar) |

## 4. Latente Inkonsistenzen, die mitbereinigt werden

Diese Stellen liegen exakt im Arbeitsbereich; das Feature berührt sie ohnehin.

1. **Tote `optik`-Naht.** `ClientMessage` sendet `{ type:'optik', id, value }`
   (`src/types/messages.ts:13`), aber `applyMutation`'s `optik`-Case liest `msg.settings`
   (`src/server/figures.ts:62`) → es wird nie etwas gespeichert. **Fix:** neue
   `admin_set_optik`-Nachricht mit `{ settings: OptikSettings }`; alte `optik`-Variante
   entfällt aus `RELAY_TYPES`.
2. **`admin_handoff_token`-Felddrift.** Typ sagt `toPlayerId`
   (`src/types/messages.ts:23`), Handler liest `msg.targetPlayerId`
   (`src/server/ws-handler.ts:264`). **Fix:** auf ein Feld vereinheitlichen (`targetPlayerId`)
   und Typ + Handler + Client angleichen.
3. **Getypte-vs-Runtime-Drift bei Broadcasts.** Handler broadcastet `session_phase_change`
   mit `{ phase, transitionedAt, reason }` und `admin_token_changed` mit
   `{ holderPlayerId, reason }` (ws-handler.ts:246–255), aber der Union sagt
   `{ phase }` bzw. `{ holder }` (messages.ts:46,48). `broadcast()` nimmt `any` → die Typen
   werden umgangen, Exhaustiveness-Tests schützen nicht. **Fix:** Union an die echten
   Payloads angleichen und Broadcasts typisieren.
4. **Rollen/Settings nicht persistent.** `roomParticipants` (rooms.ts) hält nur
   `{userId,name,color}`; `buildStateFromMutations` serialisiert keine Teilnehmer. Im
   Hybrid-Modus (Reconnect / Late-Join) gingen Rollen sonst verloren. **Fix:** Sentinels
   `__roles__` und `__lobby_settings__` analog `__coaching_steps__`.

## 5. Backend-Architektur

### 5a. Phasen-Modell & Lifecycle

Die Lobby ist **keine** neue Maschine, sondern eine **fünfte Phase vor `warmup`**.

```ts
// src/types/state.ts
export type Phase = 'lobby' | 'warmup' | 'active' | 'paused' | 'ended';
```

- `phases.ts`: `VALID_PHASES` += `'lobby'`; `lobby` ist **nicht** terminal; `transitionPhase`
  erlaubt `lobby → active` (und behält die bestehenden Übergänge).
- `admin_session_create` erzeugt Code + Phase **`lobby`** (statt `warmup`).
- Neuer Übergang **`admin_round_start`**: `lobby → active`. Hybrid = Leiter darf jederzeit
  drücken, unabhängig vom „bereit"-Status der Teilnehmer.
- **Late-Join**: Der `join`-Handler (ws-handler.ts:78–153) verzweigt nach `phase`:
  `active/paused` → direkt ins Brett (bestehender Pfad); `lobby` → Warteraum-State.

### 5b. Protokoll-Erweiterungen

Neue Varianten der discriminated unions in `src/types/messages.ts`:

```ts
// ClientMessage (neu)
| { type: 'admin_round_start' }
| { type: 'admin_assign_role'; targetPlayerId: string; role: Role }
| { type: 'admin_assign_figure'; figureId: string; toPlayerId: string | null }
| { type: 'lobby_set_ready'; ready: boolean }
| { type: 'admin_set_template'; templateId: string }
| { type: 'admin_set_optik'; settings: OptikSettings }

// ServerMessage (neu)
| { type: 'role_changed'; userId: string; role: Role }
| { type: 'figure_owner_changed'; figureId: string; ownerId: string | null }
| { type: 'lobby_ready_changed'; userId: string; ready: boolean }
| { type: 'lobby_settings_change'; templateId?: string; optik?: OptikSettings }
```

Alle neuen Server-Broadcasts werden typisiert; `assertNever`-Exhaustiveness in den Tests
deckt sie ab. Die Drift-Fixes aus §4.2/§4.3 werden hier gleich mit eingezogen.

`admin_*`-Nachrichten bleiben durch `ws._session.isAdmin` (OIDC-Claim) gegated. Der **Leiter**
ist der Admin-Token-Halter; nur OIDC-Admins können Sessions erzeugen und Rollen zuweisen.

### 5c. Datenmodell & Persistenz

```ts
type Role = 'leiter' | 'stellvertreter' | 'beobachter';

interface Participant {           // src/types/state.ts (erweitert)
  userId: string; name: string; color: string; isAdmin?: boolean;
  role?: Role;                    // neu
  ready?: boolean;                // neu
}

interface Figure {                // erweitert
  /* … bestehende Felder … */
  ownerId?: string;               // welcher Teilnehmer "besitzt" die Figur
}

interface OptikSettings {
  floor?: string;                 // Boden (Preset-Name oder Farbe)
  sky?: 'day' | 'dusk' | 'calm';  // Himmel-Preset
  lightMood?: 'neutral' | 'warm' | 'cool';
}

interface LobbySettings {
  templateId?: string;
  optik?: OptikSettings;
  maxParticipants?: number;
  allowRepresentativeAdd?: boolean;  // Default false
}
```

**Persistenz** (nach dem Muster von `__coaching_steps__`):
- Neue Sentinels `__roles__` (Map `userId → role`) und `__lobby_settings__` in der figureMap.
- In `buildStateFromMutations()` (phases.ts) serialisieren und im `join`-Seed-Block
  (ws-handler.ts:96–118) wieder einlesen.
- `ownerId` reist als Figur-Feld automatisch mit (kein Extra-Aufwand).
- `ready` ist **ephemer** (nur Lobby-Live-Status, nicht persistiert).

**Szenario-Vorlagen** = kuratierte Snapshots: `is_template boolean` + `brand`-Scope auf der
bestehenden `brett_snapshots`-Tabelle. Wiederverwendet die vorhandene Snapshot-CRUD
(`/api/snapshots`), keine neue Tabelle. Migration: additive Spalten mit Defaults.

### 5d. Rechte-Durchsetzung — `canMutate`

Neue, **reine** Funktion in `src/server/permissions.ts`, aufgerufen in `ws-handler` **vor**
Apply/Broadcast jeder Mutation (RELAY_TYPES) **und** vor `figure_lock`:

```ts
function canMutate(ctx: {
  role: Role; playerId: string; figureOwnerId?: string;
  msgType: string; allowRepresentativeAdd: boolean;
}): boolean
```

| Rolle | move / update / jump / lock | add | delete | clear |
|---|---|---|---|---|
| **Leiter** | alle Figuren | ✅ | ✅ | ✅ |
| **Stellvertreter** | nur `ownerId === playerId` | nur wenn `allowRepresentativeAdd` | nur eigene wenn Toggle | ❌ |
| **Beobachter** | ❌ | ❌ | ❌ | ❌ |

Verweigerung → `{ type:'error', reason:'forbidden' }` an den Sender, **kein** Broadcast.
Rolle wird über `ws._session.userId`/`ws._playerId` aus den persistierten `__roles__`
aufgelöst. Vollständig per Matrix-Tests abgedeckt, null Three.js-Abhängigkeit.

> **Fail-closed:** Fehlt eine Rolle (unbekannter Teilnehmer in aktiver Runde), gilt der
> restriktivste Default `beobachter`, bis der Leiter zuweist.

## 6. Frontend-Architektur

### 6a. Client-Screen-Zustandsmaschine

Heute bootet `src/client/main.ts` sofort ins Three.js-Brett. Neu: eine View-Maschine davor.

```
menu  →  lobby  →  board(active/paused)  →  summary(ended)
        ↑ Late-Join bei active springt direkt zu board
```

- Neue `src/client/app-shell.ts`: mountet/unmountet die Three.js-Szene **nur** im
  `board`-View. Menü & Lobby sind reines DOM/HTML (kein WebGL).
- `scene.ts`-Init wird **lazy** (erst bei Rundenstart). Das entkoppelt das Restyling
  vollständig vom laufenden WebGL-Canvas.
- Getrieben vom `phase`-Feld des Servers + lokaler Navigation.

### 6b. Hauptmenü (mentolder-Look)

```
+======================================================+
|                 S Y S T E M B R E T T                |
|              Systemische Aufstellung                 |
|        +--------------------------------------+      |
|        |   >  Neue Session starten            |  (nur Leiter/Admin)
|        +--------------------------------------+      |
|        |   #  Session beitreten   [ Code ___ ]|      |
|        +--------------------------------------+      |
|        |   []  Gespeicherte Aufstellungen     |      |
|        +--------------------------------------+      |
|        |   *  Einstellungen                   |      |
|        +--------------------------------------+      |
|   angemeldet als: Anna (Leiter)            [Logout]  |
+======================================================+
```

### 6c. Lobby — der „Kontrollraum"

```
+==========================================================================+
|  LOBBY     Session-Code: KRB-9A2  [Kopieren]            Phase: Lobby      |
+----------------------------------+---------------------------------------+
| TEILNEHMER (4)                   |  VORGELAGERTE EINSTELLUNGEN           |
|  (A) Anna       [Leiter   v]  x  |  Vorlage:   [ Familie (5 Fig.)  v]   |
|  (B) Ben        [Stellv.  v]  x  |  Optik:     [ Ruhig / Warm      v]   |
|  (C) Cem        [Stellv.  v]  x  |  Ablauf:    [ 5 Schritte  bearb.]    |
|  (D) Dana       [Beob.    v]  x  |  Max.Teiln: [ 8 ]                     |
|  o  (wartet ...)                 |  Figuren-Zuweisung:                   |
|  Bereit: * * o *                 |   Vater->Ben  Mutter->Cem  Kind->(–)  |
+----------------------------------+---------------------------------------+
|  [ Bereit (Haken) ] (Teilnehmer)        [  > Runde starten  ] (Leiter)   |
+==========================================================================+
```

Rollen-Dropdown & Figuren-Zuweisung nur für den Leiter; Beitretende sehen ihren Status +
„Bereit"-Toggle. Roster aus Presence (`presence_join`/`leave` + `role_changed`/`lobby_ready_changed`).

### 6d. Design-System (mentolder)

- Neue `src/client/ui/theme.ts` + CSS-Custom-Properties: **Tokens** (mentolder-Palette,
  Typo, Spacing, Radii, Schatten). Da Brett ein eigenständiger Deploy ist, werden die
  mentolder-Marken-Tokens aus der Website **extrahiert** und als Brett-eigene SSOT abgelegt
  (bewusste, dokumentierte Duplizierung — keine Laufzeit-Kopplung an die Website).
- **Basis-Primitive**: `Panel`, `Button`, `Field`, `Drawer`, `RosterItem`, `Badge/Avatar`.
- Bestehende Panels (`fig-panel`, `appearance`, `hud`, Status-Pill) konsumieren die Tokens.
- **300-Zeilen-Modulbudget** gilt (aus dem TS-Refactor); Primitive ggf. splitten.

## 7. Settings-Substanz (die 4)

| Setting | Verdrahtung | Belebt |
|---|---|---|
| **Vorlage** | Template-Snapshot laden → seedet Figuren (+ optional Rollen-Vorschlag) in Lobby/Board | Snapshot-CRUD (`is_template`) |
| **Rollen & Teilnehmer** | Rollen-Zuweisung, Max-Teiln., Paletten-Erweiterung (>6 Farben) | Presence + `__roles__` |
| **Coaching-Ablauf** | Schritte in Lobby bauen/wählen, bei Rundenstart aktiv | `coachingSteps` (existiert) |
| **Board-Optik** | `OptikSettings` (Boden/Himmel/Licht-Stimmung) bei Szene-Mount angewandt | `__optik__` + `admin_set_optik` |

**Paletten-Erweiterung:** `PARTICIPANT_PALETTE` (rooms.ts:6) hat 6 Farben und wrappt per
`% length` — keine harte Grenze, aber Farb-Recycling >6. Für Gruppen → Palette erweitern oder
deterministisch generieren (HSL-Rotation), gedeckelt durch `maxParticipants`.

## 8. Testing-Strategie

- **Unit** (`node --test`, `MOCK_DB=true`):
  - `canMutate`-Matrix (alle Rollen × Mutationstypen × Eigentümerschaft × Toggle).
  - Phasen-Übergänge inkl. `lobby` (lobby→active, terminal-guard unverändert).
  - Message-**Exhaustiveness** (`assertNever`) für alle neuen Varianten.
  - Persistenz-Roundtrip `__roles__` / `__lobby_settings__` (build → seed → build).
  - Template-Load (Snapshot → Figuren-Seed) und Optik-Apply (Server-State).
- **Client-Logik** (pure, ohne WebGL): View-Maschinen-Übergänge, Message-Router.
- **E2E** (Playwright, via `/auth/e2e-login`): create → lobby → Rolle zuweisen → Runde
  starten → **Beobachter kann nicht bewegen**. Playwright-Projekt gemäß dev-flow-Gotchas.
- **Gates grün**: `tsc --noEmit`, 300-Zeilen-Budget, bestehende
  Systembrett-Template-Validierung, `task test:all`.

## 9. Phasen-Schnitt A–E (ein Plan, intern gestaffelt)

Jede Phase ist eigenständig merge-/grün-bar (typecheck + tests + build). Reihenfolge:
**Fundament → Fluss → Rechte → Substanz → Politur**.

| Phase | Liefert (mergebar) | Grün sein müssen |
|---|---|---|
| **A** | Design-Tokens + Primitive + **Hauptmenü** + View-Maschinen-Gerüst (Szene lazy); Status/fig-panel angeglichen | View-Maschine, Typecheck, Build |
| **B** | `lobby`-Phase + Lobby-Screen + Live-Roster + Rollen-**Vergabe** (Anzeige) + Hybrid-Start/Late-Join + Protokoll-Drift-Fix (§4.2/§4.3) | Phasen, Exhaustiveness, Presence-Roundtrip |
| **C** | `ownerId` + `canMutate` (Beobachter read-only, Stellvertreter own-only) + Figuren-Zuweisung | canMutate-Matrix, E2E-Beobachter-Gate |
| **D** | Die 4 Settings mit Substanz (Vorlage/Optik/Ablauf verdrahtet + bei Start angewandt); `__optik__`-Naht repariert (§4.1) | Template-Load, Optik-Apply, Persistenz |
| **E** | Rest-Facelift (appearance-Drawer, HUD-Badges, restliche Panels) | Typecheck, optional visuelle Regression |

**Abhängigkeiten:** A vor allen (Design-System + View-Maschine sind Fundament). B vor C
(Rollen-Vergabe vor -Durchsetzung). D nach B/C (Settings nutzen Lobby + Rollen). E zuletzt.

## 10. Risiken & offene Punkte

- **mentolder-Token-Extraktion**: exakte Marken-Werte (Farben/Font) müssen aus der Website
  gezogen werden — in Phase A als erste Aufgabe verifizieren.
- **Szene-Lazy-Mount-Refactor** (6a) ist der invasivste Client-Eingriff; Regressions-Risiko
  für bestehende Board-Interaktion → in Phase A durch Smoke-Test absichern.
- **Persistenz-Migration** `brett_snapshots` (`is_template`, `brand`) muss additiv +
  defaultet sein (kein Bruch bestehender Snapshots).
- **isAdmin vs. Leiter**: Mapping klar halten — nur OIDC-Admins erzeugen Sessions/vergeben
  Rollen; Stellvertreter/Beobachter sind Nicht-Admin-Teilnehmer.
- **Deploy**: `task feature:brett` baut+importiert das `:latest`-Image neu (CI-`:latest`-Warnung
  ist erwartet, kein Fix).

## 11. Betroffene Dateien (Orientierung)

- `src/types/state.ts` — `Phase`, `Participant`, `Figure`, neue `Role`/`OptikSettings`/`LobbySettings`.
- `src/types/messages.ts` — neue Union-Varianten + Drift-Fix.
- `src/server/phases.ts` — `lobby`-Phase, Sentinel-Serialisierung.
- `src/server/figures.ts` — `applyMutation` (optik-Fix, `ownerId`), neue Sentinels.
- `src/server/permissions.ts` — **neu**, `canMutate`.
- `src/server/ws-handler.ts` — `canMutate`-Gate, neue Message-Cases, Late-Join-Verzweigung.
- `src/server/rooms.ts` — Paletten-Erweiterung, Rolle/Ready am Participant.
- `src/server/sessions.ts` — Session-Create in `lobby`.
- `src/server/index.ts` — Snapshot-Routes für Templates (`is_template`).
- `src/client/app-shell.ts` — **neu**, View-Maschine.
- `src/client/main.ts` — Lazy-Scene-Bootstrap.
- `src/client/ui/theme.ts` + Primitive — **neu**, Design-System.
- `src/client/ui/menu.ts`, `src/client/ui/lobby.ts` — **neu**, Screens.
- `src/client/ws-client.ts` — neue Server-Message-Handler.
- DB: `brett_snapshots`-Migration (additive Spalten).
