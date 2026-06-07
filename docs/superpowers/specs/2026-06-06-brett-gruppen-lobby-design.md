---
title: "Brett — Gruppen-Aufstellungs-Lobby + UI-Facelift"
date: 2026-06-06
slug: brett-gruppen-lobby
status: draft
ticket_id: null
domains: [brett, frontend]
---

# Brett — Gruppen-Aufstellungs-Lobby + UI-Facelift

> **Review-Stand:** Diese Spec wurde durch einen adversarialen 6-Linsen-Review (gegen den
> echten Code verifiziert) gehärtet. 57 bestätigte Befunde (6 Blocker, 29 Major) sind
> eingearbeitet. Die wichtigsten Design-Korrekturen sind als ⚠️ markiert.

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
- **Auth**: Keycloak/OIDC, `isAdmin`-Claim, Markenfilterung. Brett läuft als **per-Marke
  Deploy** gegen die per-Namespace `shared-db` (`/website`); mentolder=`workspace`,
  korczewski=`workspace-korczewski` → die `brett_snapshots`-Tabellen sind physisch getrennt.

**Schmerzpunkt (vom Nutzer benannt):** Es fehlt ein **Hauptmenü → Lobby (mit vorgelagerten
Einstellungen) → Runde starten**-Fluss; das aktuelle UI ist „unschön". Heute bootet der
Client direkt ins Brett; das Rollenmodell ist flach (ein Admin + alle gleichberechtigt,
nur durch kurzzeitige Locks serialisiert).

### Zielszenario

**Gruppen-/Team-Aufstellung** — mehrere Teilnehmer als Stellvertreter, ein Leiter, ggf.
Beobachter.

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
- Tiefen-Mechanik der Aufstellung (Empfindungs-Rückmeldung, Blickrichtungs-Semantik).
- Export als Bild/Video, Undo/Redo, Replay/Aufzeichnung.
- Touch/Mobile-Gesten, vollständige a11y über die neuen DOM-Screens hinaus.
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
| Stellvertreter-Rechte | **Default:** Leiter platziert & weist zu; Stellvertreter bewegen nur eigene Figur (kein Add/Delete). Toggle `allowRepresentativeAdd` (Default: aus). |
| Session-Creator | Erhält Rolle **`leiter`** + Admin-Token. |
| Zuschnitt | **Ein Plan**, intern gestaffelt A–E (jede Phase einzeln merge-/grün-bar) |

## 4. Latente Inkonsistenzen, die mitbereinigt werden

Diese Stellen liegen exakt im Arbeitsbereich; das Feature berührt sie ohnehin. **Alle gegen
den Code verifiziert.**

1. **Tote `optik`-Naht.** `ClientMessage` sendet `{ type:'optik', id, value }`
   (`messages.ts:13`), aber `applyMutation`'s `optik`-Case liest `msg.settings`
   (`figures.ts:63`, Label `:62`) → es wird nie etwas gespeichert. **Fix:** neue
   `admin_set_optik`-Nachricht mit `{ settings: OptikSettings }`; alte `optik`-Variante
   entfällt aus `RELAY_TYPES` und aus dem Union.
2. **`admin_handoff_token`-Felddrift.** Typ sagt `toPlayerId` (`messages.ts:23`), Handler
   liest `msg.targetPlayerId` (`ws-handler.ts:264`). **Fix:** auf `targetPlayerId`
   vereinheitlichen (Typ + Handler + Client).
3. **Getypte-vs-Runtime-Drift bei Broadcasts.** Handler broadcastet `session_phase_change`
   mit `{ phase, transitionedAt, reason }` und `admin_token_changed` mit
   `{ holderPlayerId, reason }` (`ws-handler.ts:246–255`), aber der Union sagt `{ phase }`
   bzw. `{ holder }` (`messages.ts:46,48`). `broadcast()` nimmt `any` → Typen werden
   umgangen. **Fix:** Union an die echten Payloads angleichen, Broadcasts typisieren.
4. **Rollen/Settings nicht persistent.** `roomParticipants` (rooms.ts:4) hält nur
   `{userId,name,color}`; `buildStateFromMutations` serialisiert **keine** Teilnehmer
   (verifiziert: phases.ts:26–54 emittiert nur Figuren + Sentinels). **Fix:** Sentinels
   `__roles__` und `__lobby_settings__` analog `__coaching_steps__`.
5. **⚠️ `jump` wird nie relayed (NEU).** `jump` ist **nicht** in `RELAY_TYPES`
   (`ws-handler.ts:37`) und hat **keinen** `applyMutation`-Case → der Server **verwirft**
   `{type:'jump'}` still; der Sprung propagiert nie zwischen Clients (latenter Bug). Typen
   existieren auf beiden Unions (`messages.ts:9,34`), der Client sendet/empfängt nur lokal.
   **Fix:** `jump` zu `RELAY_TYPES` hinzufügen (relayed + per canMutate gegated). **Kein**
   `applyMutation`-Case nötig — `jump` ist ephemere Animation (client-only `jumping/jumpV`
   in `mannequin.ts`), nie persistiert; der Relay-Pfad toleriert RELAY_TYPES ohne
   `applyMutation`-Branch (kein `default` im switch).
6. **⚠️ `sessionPhase`-vs-`phase` Persist/Seed-Drift (NEU).** `buildStateFromMutations`
   emittiert `result.sessionPhase`/`sessionCreatedAt`/`sessionLastActivity`
   (`phases.ts:46,49,50`), während der join-Seed-Block `state.phase`/`createdAt`/
   `lastActivity` liest (`ws-handler.ts:100,109,112`) **und** `freshState.phase` sendet
   (`ws-handler.ts:145`, immer `undefined`). Nach DB-Round-Trip ist die Phase damit
   verloren — fatal für die View-Maschine (§6a), die auf `phase` triggert. **Fix (eng):**
   Seed liest `state.sessionPhase`, Snapshot sendet `phase: freshState.sessionPhase`;
   bestehende Tests/Fixtures, die auf `sessionPhase` prüfen, bleiben gültig.

## 5. Backend-Architektur

### 5a. Phasen-Modell, Lifecycle & Late-Join

Die Lobby ist **keine** neue Maschine, sondern eine **fünfte Phase vor `warmup`**.

```ts
// src/types/state.ts
export type Phase = 'lobby' | 'warmup' | 'active' | 'paused' | 'ended';
```

- `phases.ts`: `VALID_PHASES` += `'lobby'`; `lobby` ist **nicht** terminal.
- **⚠️ Per-Edge-Allowlist:** `transitionPhase` (phases.ts:17–24) hat heute **keine**
  Kanten-Prüfung (erlaubt jede Nicht-Terminal-Phase → jede Zielphase). Mit `lobby` wäre
  sonst `active → lobby` möglich. **Fix:** explizite erlaubte Übergänge —
  `lobby→active`, `active↔paused`, `*→ended`; alles andere ablehnen.
- `admin_session_create` seedet Phase **`lobby`** statt `warmup` (sessions.ts:115). **Test-
  Abgleich:** `test/session-state.test.ts:51–60` (erwartet `sessionPhase==='warmup'`) auf
  `'lobby'` umstellen + Titel anpassen.
- **`admin_round_start`**: `lobby → active`. **Idempotent**: bei bereits `active` no-op
  (kein Doppel-Start bei Re-Klick).
- **⚠️ Idle-Sweep schützt die Lobby:** `checkSessionIdle` (sessions.ts:195) exemptiert nur
  `warmup`/`ended` → eine offene Lobby würde nach 2 min zu `ended` gesweept. **Fix:**
  `lobby` in die Exempt-Bedingung aufnehmen.

#### ⚠️ Late-Join-Guard-Umbau (BLOCKER)

Heute lehnt `shouldRejectReconnect` (sessions.ts:167–185) **jede** `active`/`paused`-
Verbindung mit 409 ab, durchgesetzt im WS-Upgrade in `verifyClient` (index.ts:264–279) —
**bevor** der join-Handler läuft. `test/reconnect-guard.test.ts:35–41` zementiert das
("first join during active also forbidden"). **Damit ist Hybrid-Late-Join unmöglich.**

**Umbau (Phase B):**
1. **PlayerId in den Handshake fädeln:** `verifyClient` liest
   `url.searchParams.get('playerId')` und übergibt ihn (statt hartem `null`,
   index.ts:269); der Client hängt `&playerId=<id>` an die `/sync`-URL.
2. **`shouldRejectReconnect(room, playerId)` neu:** nutzt `wasPreviouslyInRoom(room,
   playerId)` (Signal existiert, gefüllt via `player_join`/`trackPlayerInRoom`,
   ws-handler.ts:204–206). Neue Matrix:
   - `lobby`/`warmup`/keine Session → **annehmen** (unverändert)
   - `ended` → **ablehnen** (410)
   - `active`/`paused`: **echter Late-Joiner** (`!wasPreviouslyInRoom`) → **annehmen**;
     true Reconnect eines bereits aktiven Spielers → 409 (wie gewünscht)
3. **Test:** `reconnect-guard.test.ts:35–41` invertieren (Late-Joiner während `active` →
   admit; vorher-im-Raum → reject; `ended` → reject).

#### ⚠️ Leiter-Disconnect & Grace (Major)

Die Grace-Maschinerie (`beginTokenGrace`, `setRoomAdminPresence`, `reclaimAdminToken`,
sessions.ts:78–109) ist **nicht** in `ws-handler` verdrahtet (nur für Tests re-exportiert).
**Fix:** im `ws.on('close')` (ws-handler.ts:295–317): verlässt der aktuelle
Admin-Token-Halter in einer Nicht-`ended`-Phase, `beginTokenGrace` starten und bei Ablauf
an den nächsten anwesenden Admin/Leiter weiterreichen (oder Lobby auflösen, falls keiner da).

#### ⚠️ WS-Session-Sync-Härtung (Major)

`ws._session` wird im synchronen `next()`-Callback gesetzt
(`sessionMiddleware(req,{},()=>{ws._session=req.session})`, ws-handler.ts:52–56) — nicht
garantiert vor der ersten Message. **Fix:** `ws.on('message')`-Body hinter ein
`ws._sessionReady`-Flag gaten (bis dahin puffern oder `{type:'error',reason:'not-ready'}`),
damit die isAdmin/Rollen-Auflösung nie auf `undefined` läuft.

### 5b. Protokoll-Erweiterungen & Dispatch-Verdrahtung

```ts
type Role = 'leiter' | 'stellvertreter' | 'beobachter';

// ClientMessage (neu)
| { type: 'admin_round_start' }
| { type: 'admin_assign_role'; targetPlayerId: string; role: Role }
| { type: 'admin_assign_figure'; figureId: string; toPlayerId: string | null }
| { type: 'admin_set_template'; templateId: string }
| { type: 'admin_set_optik'; settings: OptikSettings }
| { type: 'lobby_set_ready'; ready: boolean }   // einzige NICHT-privilegierte Neuerung

// ServerMessage (neu)
| { type: 'role_changed'; userId: string; role: Role }
| { type: 'figure_owner_changed'; figureId: string; ownerId: string | null }
| { type: 'lobby_ready_changed'; userId: string; ready: boolean }
| { type: 'lobby_settings_change'; templateId?: string; optik?: OptikSettings }
```

**⚠️ Auth-Verdrahtung (BLOCKER — nicht optional):** Der isAdmin-Check läuft **nur** für
`msg.type ∈ ADMIN_TYPES` (ws-handler.ts:215). Eine privilegierte Nachricht, die **nicht**
in `ADMIN_TYPES` steht, fällt mit **null Auth** durch. Daher:
- Alle fünf `admin_*` (`admin_round_start`, `admin_assign_role`, `admin_assign_figure`,
  `admin_set_template`, `admin_set_optik`) **MÜSSEN** in `ADMIN_TYPES` (ws-handler.ts:41–43)
  **UND** je ein `case` im post-isAdmin-`switch` (ws-handler.ts:220+) erhalten (Membership
  ohne `case` ist ein stiller No-op). **NICHT** in `RELAY_TYPES`, **NICHT** in einem
  parallelen switch.
- `lobby_set_ready` ist die **einzige** neue, bewusst nicht-privilegierte Nachricht
  (Teilnehmer-Selbstmeldung) — gehört nicht in `ADMIN_TYPES`, aber braucht eine eigene
  Behandlung (nicht über RELAY_TYPES).
- **`admin_assign_role`/`admin_assign_figure`** validieren, dass `targetPlayerId` aktuelles
  Mitglied ist: `listParticipants(room).some(p => p.userId === targetPlayerId)`, sonst
  `{type:'error', reason:'not-in-room'}`.

**Optik-Propagation:** `admin_set_optik` aktualisiert den Server-State; die Verteilung an
andere Clients läuft über `lobby_settings_change{optik}` (auch in-board, nicht nur Lobby) —
inkl. **neuem Client-Handler** in `ws-client.ts`.

**Drift-Fixes** (§4.2/§4.3): `admin_handoff_token`-Feld, `session_phase_change`/
`admin_token_changed`-Payloads an den Union angleichen.

**Exhaustiveness ist hand-gepflegt:** `test/messages.test.ts` hält `routeServer`/
`routeClient`-Switches (Z. 17–70) **und** ein dupliziertes `HANDLED_SERVER_TYPES`-Literal
(Z. 8–13) — **drei** Stellen, die im Gleichschritt mit dem Union zu pflegen sind. Die
`assertNever`-Default-Branches sind tsc-erzwungen (neue Variante → Build-Fehler bis `case`
ergänzt), aber `HANDLED_SERVER_TYPES` muss von Hand nachgezogen werden.

### 5c. Datenmodell & Persistenz

```ts
interface Participant {           // erweitert
  userId: string; name: string; color: string; isAdmin?: boolean;
  role?: Role;                    // neu
  ready?: boolean;                // neu, ephemer (Live-Lobby-Status)
}
interface Figure { /* … */ ownerId?: string; }   // server-authoritativ (s. u.)
interface OptikSettings { floor?: string; sky?: 'day'|'dusk'|'calm'; lightMood?: 'neutral'|'warm'|'cool'; }
interface LobbySettings { templateId?: string; optik?: OptikSettings; maxParticipants?: number; allowRepresentativeAdd?: boolean; }
```

- **⚠️ Eine kanonische Identität.** Heute mischen sich `ws._session?.userId`, `ws._playerId`
  (aus client-gelieferter `msg.playerId`, ws-handler.ts:124) und `'anon'`. Ein Helper
  `resolvePlayerId(ws)` = **`ws._session?.userId` (OIDC-first)**, Anon-Fallback nur ohne
  Session, wird **überall** genutzt: Participant-Map-Key, `ws._playerId`, Lock-Owner,
  `removeParticipant`, `Figure.ownerId`, `__roles__`-Keys, `canMutate.ctx.playerId`.
- **⚠️ Rollen-Identität ist authentifiziert.** Bei vorhandener Session wird `playerId`
  **ausschließlich** aus `ws._session.userId` gesetzt; `msg.playerId` wird ignoriert
  (ws-handler.ts:124 **und** der `player_join`-Write :205). `'anon'` darf **nie** eine Rolle
  über `beobachter` tragen. (Sonst: `{type:'join', playerId:'<Leiter-userId>'}` erbt die
  Leiter-Rolle — Eskalation.)
- **⚠️ `ownerId` server-authoritativ.** `applyMutation` merged Client-`add`/`update`
  wholesale (figures.ts:23–29, 41–53). `ownerId` MUSS aus Client-Payloads gestript werden,
  genau wie `id` (figures.ts:42): `const { id, ownerId, ...safeChanges } = msg.changes`
  bei update; bei add `delete figData.ownerId` vor dem Spread. Eigentümerschaft ändert sich
  nur über `admin_assign_figure`.
- **Persistenz** (Muster `__coaching_steps__`): Sentinels `__roles__` (Map `userId→role`) +
  `__lobby_settings__` in der figureMap, serialisiert in `buildStateFromMutations` und
  re-seeded im join-Block. **⚠️ Seed als reine Funktion:** den inline-Seed
  (ws-handler.ts:86–118) in eine exportierte `seedFigureMapFromState(map, state): void`
  (figures.ts/phases.ts) extrahieren → macht den Persistenz-Roundtrip unit-testbar.
- **Szenario-Vorlagen** = kuratierte Snapshots: nur additive Spalte **`is_template boolean`**
  auf `brett_snapshots` (**keine `brand`-Spalte** — die per-Namespace-DBs sind ohnehin
  physisch getrennt, §1; YAGNI). Laden via bestehende Route `/api/snapshots/:id`
  (index.ts:145–218) → **kein** reiner Unit-Test, sondern Route/DB-Test oder ein extrahierter
  reiner Seeder.

### 5d. Rechte-Durchsetzung — `canMutate` als alleiniger Chokepoint

**⚠️ (BLOCKER):** `canMutate` ist der **einzige** Gate für das **gesamte** (post-§4.1)
`RELAY_TYPES`-Set **plus** `figure_lock`, mit **fail-closed Default-Deny**: jeder Relay-Typ,
der nicht explizit in der Matrix steht, wird abgelehnt. (Sonst umgeht z. B. `snapshot` —
ersetzt das **ganze** Figurenset — jede Rollenprüfung.)

Reine Funktion in `src/server/permissions.ts`, aufgerufen **vor** Apply/Broadcast im
`if (RELAY_TYPES.has(msg.type))`-Block (ws-handler.ts:201) **und** im `figure_lock`-Branch
(ws-handler.ts:178–192, mit `figureOwnerId` aus `figureMaps.get(room).get(msg.id)?.ownerId`):

| Typ | Leiter | Stellvertreter | Beobachter |
|---|---|---|---|
| `move` `update` `jump` `delete` | ✅ alle | nur `ownerId===playerId` | ❌ |
| `figure_lock` | ✅ alle | nur `ownerId===playerId` | ❌ |
| `add` | ✅ | nur wenn `allowRepresentativeAdd` (ownerId=self) | ❌ |
| `clear` `snapshot` `stiffness` | ✅ (leiter-only) | ❌ | ❌ |
| `request_state_snapshot` | ✅ read | ✅ read | ✅ read (read-only, kein Broadcast) |
| *(jeder andere RELAY_TYPE)* | **Default-Deny** | **Default-Deny** | **Default-Deny** |

- Verweigerung → `{type:'error', reason:'forbidden'}` an den Sender, **kein** Broadcast
  (auch beim Lock — nicht `figure_lock_denied`).
- **`jump`** wird (§4.5) zu `RELAY_TYPES` ergänzt und wie `move` behandelt.
- **Fail-closed-Identität:** Rolle wird **ausschließlich** über `ws._session.userId`
  aufgelöst (nie `msg.playerId`, nie `'anon'`). Unbekannt/anonym → `beobachter`.
- `canMutate`'s `msgType`-Param ist die Relay-Type-Union (nicht `string`), Default-Deny ist
  damit typgetrieben.
- Vollständig per Matrix-Tests abgedeckt, null Three.js-Abhängigkeit.

## 6. Frontend-Architektur

### 6a. Client-Screen-Zustandsmaschine

Heute bootet `main.ts` sofort ins Three.js-Brett. Neu: eine View-Maschine davor.

```
menu  →  lobby  →  board(active/paused)  →  summary(ended)
        ↑ Late-Join bei active springt direkt zu board
```

- Neue `src/client/app-shell.ts`: mountet/unmountet die Three.js-Szene **nur** im
  `board`-View; `scene.ts`-Init wird **lazy**. (Review bestätigt: `main.ts` ruft `initScene`
  eigenständig → der Lazy-Mount kann in Phase A ohne die Lobby landen.)
- Getrieben vom **`sessionPhase`**-Feld (nach §4.6-Fix; nicht dem heute toten `phase`).

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

Hinweis: In **Phase A** erzeugt „Neue Session" noch den `warmup`-Fluss (Lobby kommt in B);
der Button wird in A bereits gezeigt, seedet aber erst ab B die `lobby`-Phase.

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

#### ⚠️ Client-Router-Lücken (Major)

`ws-client.ts` `onWsMessage` (Z. 103–248) hat `default: break` und **ignoriert heute alle**
Presence/Session-Nachrichten. Für Lobby/Roster/View-Maschine müssen Cases **hinzugefügt**
werden (nicht nur erweitert): `init`, `presence_join`, `presence_leave`,
`session_phase_change`, `session_created`, `session_ended`, `admin_token_changed`,
`coaching_steps_change`, `error` **plus** die neuen `role_changed`, `figure_owner_changed`,
`lobby_ready_changed`, `lobby_settings_change`.

#### ⚠️ Presence in der Lobby (Major)

Presence wird heute nur emittiert, wenn die Session **bereits aktiv** ist: `addParticipant`
+ `presence_join` hängen hinter `if (activeState && activeState.sessionCode)`
(ws-handler.ts:123–132); `presence_leave` hinter `ws._session?.userId` (ws-handler.ts:304).
**Fix:** Roster-Liveness unabhängig von OIDC — `presence_join`/`leave` auch in `lobby`
emittieren, gekeyt auf die **kanonische Identität** (`resolvePlayerId`, §5c), nicht
`ws._session.userId`.

### 6d. Design-System (mentolder)

- Neue `src/client/ui/theme.ts` + CSS-Custom-Properties: **Tokens** (mentolder-Palette,
  Typo, Spacing, Radii, Schatten), **extrahiert** aus der Website und als Brett-eigene SSOT
  abgelegt (bewusste, dokumentierte Duplizierung — keine Laufzeit-Kopplung).
- **Basis-Primitive**: `Panel`, `Button`, `Field`, `Drawer`, `RosterItem`, `Badge/Avatar`.
- Bestehende Panels (`fig-panel`, `appearance`, `hud`, Status-Pill) konsumieren die Tokens.
- Das **300-Zeilen-Modulbudget** ist eine **Konvention** (kein CI-Gate) — als Richtlinie
  behandeln, Primitive ggf. splitten.

## 7. Settings-Substanz (die 4)

| Setting | Verdrahtung | Belebt |
|---|---|---|
| **Vorlage** | Template-Snapshot via `/api/snapshots/:id` laden → Figuren-Seed (+ optional Rollen-Vorschlag) | Snapshot-CRUD (`is_template`) |
| **Rollen & Teilnehmer** | Rollen-Zuweisung, Max-Teiln., Paletten-Erweiterung (>6 Farben) | Presence + `__roles__` |
| **Coaching-Ablauf** | Schritte in Lobby bauen/wählen, bei Rundenstart aktiv | `coachingSteps` (existiert) |
| **Board-Optik** | `admin_set_optik` → Server-State → `lobby_settings_change{optik}` → bei Szene-Mount angewandt | `__optik__`-Naht (§4.1) |

**Paletten-Erweiterung:** `PARTICIPANT_PALETTE` (rooms.ts:6) hat 6 Farben + `% length`-Wrap
(Farb-Recycling >6, keine harte Grenze) → erweitern oder HSL-Rotation, gedeckelt durch
`maxParticipants`.

## 8. Testing-Strategie

> **⚠️ Korrektur:** Die Brett-Suite läuft **nicht** über `task test:all` (das ist die
> Website/Infra-BATS-Suite). Brett-Tests laufen via `npm test` / `npm run typecheck` /
> `npm run build` im `brett/`-Workspace (CI: `build-brett.yml` + Brett-Typecheck-Gate).

- **Unit** (`node --test` + tsx, `MOCK_DB=true`, Import der **echten** `applyMutation`/
  `buildStateFromMutations` aus `../src/server/index` — Muster `session-state.test.ts`):
  - `canMutate`-Matrix (alle Rollen × Typen × Eigentümerschaft × Toggle; inkl. Asserts, dass
    `request_state_snapshot`/Read **nie** für Beobachter verweigert wird, und dass
    `snapshot`/`stiffness`/`clear` leiter-only sind; Default-Deny für unbekannten Typ).
  - **Identitäts-Spoof-Test:** authentifizierter Beobachter, der mit `playerId=<Leiter-id>`
    joint, wird trotzdem verweigert.
  - Phasen inkl. `lobby` (Per-Edge-Allowlist: `active→lobby` verboten; `lobby→active` ok;
    terminal-guard unverändert) + Idle-Exempt für `lobby`.
  - Message-**Exhaustiveness** (`routeServer`/`routeClient` + `HANDLED_SERVER_TYPES`, alle
    drei Stellen) für neue/entfernte Varianten.
  - Persistenz-Roundtrip `__roles__`/`__lobby_settings__` via reine
    `seedFigureMapFromState` (build → seed → build).
  - **Optik-Apply:** neuer `test/optik.test.ts` gegen die **echte** `applyMutation`
    (ersetzt die self-contained Reimplementierung in `tests/unit/brett-optik-server.js`).
  - Late-Join-Guard: `reconnect-guard.test.ts` invertiert (s. §5a).
  - `session-state.test.ts`: Create → `lobby` (s. §5a).
- **Client-Logik** (pure, ohne WebGL): View-Maschinen-Übergänge, Message-Router.
- **E2E** (Playwright): create → lobby → Rolle zuweisen → Runde starten → **Beobachter kann
  nicht bewegen**. Braucht **zwei** Browser-Kontexte (Leiter + Beobachter) und
  `/auth/e2e-login` (Secret-Header). Playwright-Projekt gemäß dev-flow-Gotchas zuweisen.
- **Gates grün**: `tsc --noEmit`, Brett-Typecheck-Gate, `build-brett.yml`-Build, bestehende
  Systembrett-Template-Validierung.

## 9. Phasen-Schnitt A–E (ein Plan, intern gestaffelt)

Jede Phase ist eigenständig merge-/grün-bar. Reihenfolge: **Fundament → Fluss → Rechte →
Substanz → Politur**.

| Phase | Liefert (mergebar) | Grün sein müssen |
|---|---|---|
| **A** | Design-Tokens + Primitive + **Hauptmenü** + View-Maschine-Gerüst (Szene lazy, getrieben von `sessionPhase`); Status/fig-panel angeglichen | View-Maschine, Typecheck, Build |
| **B** | `lobby`-Phase (+Per-Edge-Allowlist, +Idle-Exempt) + **Late-Join-Guard-Umbau** + Lobby-Screen + Live-Roster (+Presence-in-Lobby) + Rollen-**Vergabe** (Anzeige) + **Client-Router-Cases** + Drift-Fixes §4.2/§4.3/§4.6 + Leiter-Grace + Session-Sync-Härtung | Phasen, Exhaustiveness, Persistenz-Roundtrip, `session-state`/`reconnect-guard`-Tests aktualisiert |
| **C** | `ownerId` (server-authoritativ, gestript) + **`canMutate`-Chokepoint** (fail-closed, ganze RELAY_TYPES + figure_lock) + `jump`→RELAY_TYPES + Figuren-Zuweisung + **Identität aus Session** + Owner-Orphan-Handling | canMutate-Matrix, Spoof-Test, E2E-Beobachter-Gate |
| **D** | Die 4 Settings mit Substanz (Vorlage/Optik/Ablauf verdrahtet + bei Start angewandt); `__optik__`-Naht (§4.1) + Optik-Propagation; `optik.test.ts` | Template-Load, Optik-Apply, Persistenz |
| **E** | Rest-Facelift (appearance-Drawer, HUD-Badges, restliche Panels) | Typecheck, optional visuelle Regression |

**Abhängigkeiten:** A vor allen. B vor C (Vergabe vor Durchsetzung). D nach B/C. E zuletzt.
**Hinweis (Minor):** Die `admin_set_optik`-Union-Edit ist gleicher Art wie B's Drift-Fixes;
der **Protokoll-Teil** darf in B mitlaufen, **Apply + UI** bleiben in D.

## 10. Lifecycle-Details (vom Review ergänzt)

- **Owner-Orphan:** Verlässt ein Stellvertreter mit eigenen Figuren den Raum (oder wird
  herabgestuft), die `ownerId` der betroffenen Figuren via `applyMutation` nullen +
  `figure_owner_changed` broadcasten (Scan der figureMap nach `ownerId===userId`).
- **Session-Creator:** erhält Rolle `leiter` + Admin-Token (sessions.ts:116).
- **Reconnect-Rollen-Restore:** funktioniert nur mit stabiler Identität → hängt an der
  kanonischen `ws._session.userId` (§5c), nicht an client-`playerId`.
- **`admin_round_start` doppelt:** idempotent (no-op wenn bereits `active`).
- **isAdmin vs. Leiter:** nur OIDC-Admins erzeugen Sessions/vergeben Rollen; der Leiter ist
  der Admin-Token-Halter. (Der isAdmin-Gate bleibt der OIDC-Claim; „Leiter" ist die
  Session-Rolle obendrauf.)

## 11. Risiken & offene Punkte

- **mentolder-Token-Extraktion**: exakte Marken-Werte (Farben/Font) aus der Website ziehen —
  in Phase A als erste Aufgabe verifizieren.
- **Szene-Lazy-Mount-Refactor** (6a): invasivster Client-Eingriff; in Phase A per Smoke-Test
  absichern (Review bestätigt grundsätzlich machbar).
- **Persistenz-Migration** `brett_snapshots.is_template`: additiv + defaulted (kein Bruch
  bestehender Snapshots).
- **Late-Join-Guard**: berührt Auth-kritischen Handshake — Tests sind Pflicht, Policy
  explizit dokumentieren (Late-Joiner zulassen, true Reconnect-of-active ablehnen).
- **Deploy**: `task feature:brett` baut+importiert das `:latest`-Image neu (CI-`:latest`-
  Warnung erwartet, kein Fix).

## 12. Betroffene Dateien (Orientierung)

- `src/types/state.ts` — `Phase`(+lobby), `Participant`(+role/ready), `Figure`(+ownerId),
  `Role`/`OptikSettings`/`LobbySettings`.
- `src/types/messages.ts` — neue Union-Varianten, `optik`-Entfernung, Drift-Fix.
- `src/server/phases.ts` — `lobby`, Per-Edge-Allowlist, Sentinel-Serialisierung, `sessionPhase`-Fix.
- `src/server/figures.ts` — `applyMutation` (optik-Fix, `ownerId`-Strip), neue Sentinels, `seedFigureMapFromState`.
- `src/server/permissions.ts` — **neu**, `canMutate` (fail-closed).
- `src/server/ws-handler.ts` — canMutate-Gate (RELAY+lock), `ADMIN_TYPES`-Erweiterung + Cases, Late-Join-Verzweigung, Presence-in-Lobby, Grace-Wiring, Session-Sync-Flag, Identitäts-Härtung, `jump` in RELAY_TYPES, `sessionPhase`-Seed/Send-Fix.
- `src/server/sessions.ts` — Create→`lobby`, `shouldRejectReconnect`-Umbau, `checkSessionIdle`-Exempt, Grace.
- `src/server/index.ts` — `verifyClient` (playerId fädeln), Snapshot-Routes (`is_template`).
- `src/server/rooms.ts` — Paletten-Erweiterung, Rolle/Ready am Participant, kanonischer Key.
- `src/client/app-shell.ts` — **neu**, View-Maschine.
- `src/client/main.ts` — Lazy-Scene-Bootstrap.
- `src/client/ws-client.ts` — **neue** Presence/Session/Lobby-Router-Cases, `&playerId=`-URL.
- `src/client/ui/theme.ts` + Primitive — **neu**, Design-System.
- `src/client/ui/menu.ts`, `src/client/ui/lobby.ts` — **neu**, Screens.
- `test/messages.test.ts` — Exhaustiveness (3 Stellen).
- `test/session-state.test.ts` — Create→`lobby`.
- `test/reconnect-guard.test.ts` — Late-Join invertiert.
- `test/optik.test.ts` — **neu** (ersetzt `tests/unit/brett-optik-server.js`-Reimplementierung).
- DB: `brett_snapshots`-Migration (`is_template`, additiv).
