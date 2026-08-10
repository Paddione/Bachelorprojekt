# sdlc-cockpit

<!-- baseline SSOT für das SDLC Cockpit Epic -->

## Purpose

Das SDLC Cockpit ist ein agentisches Engineering Command Center für den
Bachelorprojekt-Software-Development-Lifecycle. Es ersetzt das heutige
`opencode-cockpit.html` durch ein dreischichtiges Design-Kit (Lavish) und
eine Panel-basierte Cockpit-Fläche.

---

## Requirements

### Requirement: Lavish Design-Kit — Dreischichtiges CSS-Token-System

The SSOT SHALL define ein Lavish Design-Kit mit drei Schichten: Tokens (Farben, Typografie, Abstände, Radien), Dokument-Bausteine (Überschriften, Tabellen, Code-Blöcke), und Panel-Rahmen (Frame, Kopf, Body, Aktions-Slot). (K1, E11)

#### Scenario: Ein Board lädt das Kit per `<link>` und verwendet Tokons statt Hardcode-Werte

- GIVEN ein Board lädt `tokens.css`, `document.css`, `panel.css`
- WHEN das Board Tokens wie `--lv-clr-primary` referenziert
- THEN werden die Design-Tokens korrekt angewandt

### Requirement: Panel-Laufzeit — Panel.create() mit vier Typen

The system SHALL implement a Panel-Klasse mit den Typen Status/Strom/Canvas/Terminal,
Typ-gesteuertem Refresh/Fehler/Scroll-Verhalten, und Action-Zustandsmaschine. (K1, D2, D4, D5, D10–D13)

#### Scenario: Panel erzeugen und Typ setzen

- GIVEN ein Panel wird via `Panel.create({type: 'status'})` erzeugt
- WHEN das Panel initialisiert ist
- THEN zeigt es den Status-Typ mit korrektem Frame, Kopf und Body an

### Requirement: Daten-Adapter — Kein direkter fetch() aus Panels

The system SHALL provide einen Adapter-Vertrag mit Fixture-Daten für 6 Domänen (Tickets, Agents, CI, Cluster, Factory, Modelle). Kein Panel ruft `fetch()` direkt auf. (K1, E1, E16)

#### Scenario: Panel verwendet Adapter statt fetch

- GIVEN ein Panel benötigt Modelldaten
- WHEN es den Adapter aufruft
- THEN erhält es Fixture-Daten ohne Netzwerkzugriff

### Requirement: Belegartefakte — Standalone-Board und Cockpit-Hülle

The system SHALL provide `reference-board.html` (Schicht 1+2) und `cockpit-shell.html` (Schicht 3) als standalone, `file://`-öffnungsfähige Belege ohne Build. (K1)

#### Scenario: Belegartefakt wird im Browser geöffnet

- GIVEN `reference-board.html` wird mit `file://` geöffnet
- WHEN die Seite lädt
- THEN werden Tokens und Dokument-Bausteine korrekt dargestellt

---

### Requirement: Epic-Liste als Daemon-Route (E6)

The system SHALL expose die laufenden Epics über die Daemon-Route
`GET /api/cockpit/epics`. The response SHALL carry a `fetchedAt` field (D12) and
SHALL contain either an `epics` list OR an `error` field — an empty list MUST NOT
mask a failure (D13). Browser access SHALL go exclusively through the adapter
method `data.epics()`; no panel calls `fetch()` directly (E1).

#### Scenario: The route is registered and responds

- **GIVEN** the daemon is running
- **WHEN** `GET /api/cockpit/epics` is called
- **THEN** it responds with HTTP 200
- **AND** the response contains `fetchedAt`

#### Scenario: A failure is named, not disguised as an empty list

- **GIVEN** the ticket source is unreachable
- **WHEN** `GET /api/cockpit/epics` is called
- **THEN** the response contains an `error` field
- **AND** a genuinely empty result set remains distinguishable from it

#### Scenario: No panel bypasses the adapter

- **GIVEN** a panel needs the epic list
- **WHEN** its source is checked for direct `fetch()` calls
- **THEN** it contains none
- **AND** access goes through `data.epics()`

### Requirement: Detection of foreign changes before export (OF1)

The system SHALL determine, before each canvas export, whether
`openspec/changes/` has been modified by others since the last export, and SHALL
offer this check via `GET /api/cockpit/epics/:id/changes-since`. Where no
reliable statement is possible — missing or unusable reference timestamp,
unreadable source — the response SHALL be `hasChanges: true`. The conservative
answer is binding because a `false` would, in the least certain case, advise
overwriting someone else's progress.

#### Scenario: Without a reference point, "possibly changed" applies

- **GIVEN** no or an unusable `ts` parameter
- **WHEN** `changes-since` is called
- **THEN** the response is `hasChanges: true`

#### Scenario: A timestamp is validated before it is used

- **GIVEN** a `ts` parameter that is not an ISO timestamp
- **WHEN** `changes-since` is called
- **THEN** it is rejected instead of being passed to the underlying command

### Requirement: The canvas export does not write server-side

The system SHALL perform the canvas export as a client-side operation. The
canvas SHALL NOT write to `openspec/changes/` through a daemon route while the
authentication design from K4 is outstanding. Only those artifact parts the
canvas itself authored are exported — `proposal.md` and `tasks.md` remain
untouched. This preserves the ownership boundary from OF1: "the canvas is the
source" means "the source for the parts it writes".

#### Scenario: No server-side write path

- **GIVEN** a user triggers the export
- **WHEN** the operation runs
- **THEN** the output is produced in the browser
- **AND** no writing daemon route is called

### Requirement: The daemon identifies its checkout to tests

The system SHALL report, in the response to `GET /health`, the checkout the
daemon was started from. Tests SHALL use this to determine whether the
responding daemon carries the code under test; otherwise the run SHALL be
skipped (locally) or fail (under `COCKPIT_DAEMON_REQUIRED`). Without this field a
daemon from a foreign working directory is indistinguishable from the correct
one — the suite then measures the wrong state and still reports a result.

#### Scenario: /health names the checkout

- **GIVEN** a running daemon
- **WHEN** `GET /health` is called
- **THEN** the response contains the field `root`

#### Scenario: A daemon from a foreign checkout is detected

- **GIVEN** a daemon from another working directory answers on the port
- **WHEN** the test precondition is evaluated
- **THEN** the test is skipped or fails
- **AND** the message names both the found and the expected checkout

### Requirement: Stil-Datenbank — kuratierte Sammlung geernteter Komponenten (E14)

The system SHALL provide eine Stil-Datenbank unter `.lavish/styles/` als versionskontrollierte
Repo-Dateien: eine JSON-Datei pro Eintrag nach einem strukturierten Schema (`id`, `name`, `zweck`,
`herkunft`, `beleg_ausschnitt`, `token_bezuege`, `tags`) plus ein Index `styles/index.json`, der
alle Einträge listet. (K9, E14)

#### Scenario: Ein Eintrag wird als JSON abgelegt

- **GIVEN** eine geerntete Komponente aus einem abgeschlossenen Prototypen
- **WHEN** sie in die Stil-Datenbank aufgenommen wird
- **THEN** liegt sie als `.lavish/styles/<id>.json` vor
- **AND** alle Pflichtfelder (`id`, `name`, `zweck`, `herkunft`, `beleg_ausschnitt`, `token_bezuege`) sind gefüllt
- **AND** `styles/index.json` listet den neuen Eintrag

#### Scenario: Nur Token-Bezüge statt fester Werte (D14)

- **GIVEN** ein Eintrag mit `beleg_ausschnitt`
- **WHEN** der Beleg auf Farb-/Größenwerte geprüft wird
- **THEN** enthält er ausschließlich Token-Bezüge, keine festen Hex-/Pixel-Werte
- **AND** jedes genannte Token ist in `.lavish/kit/tokens.css` definiert

> Der Planentwurf nannte hier `--lv-*` / `--color-*`. Ein `--lv-`-Präfix
> existiert im Repo nicht; maßgeblich sind die in `tokens.css` tatsächlich
> definierten Namen (`--color-*`, `--space-*`, `--radius-*`, `--text-*`,
> `--duration-*`, `--font-*`, `--ease-*`, `--leading-*`, `--weight-*`). Eine
> feste Liste würde hier bei jeder Token-Ergänzung veralten — geprüft wird
> deshalb gegen die Datei, nicht gegen eine Aufzählung.

### Requirement: Modell-Zugriff über Adapter und Daemon-Route

The system SHALL expose die Stil-Datenbank über die bestehende Adapter-/Daemon-Architektur:
Adapter-Methode `data.styles()` und Daemon-Route `GET /api/cockpit/styles` mit `fetchedAt`-Feld.
Kein Panel ruft `fetch()` direkt auf (E1). (K9)

#### Scenario: Adapter liefert Stil-Einträge

- **GIVEN** ein Panel benötigt Stil-Einträge
- **WHEN** es `data.styles()` aufruft
- **THEN** erhält es die Einträge aus `styles/index.json` mit `fetchedAt`
- **AND** bei nicht erreichbarer Quelle ein `error`-Feld statt stiller Null (D13)

#### Scenario: Daemon-Route antwortet

- **GIVEN** der Daemon läuft
- **WHEN** `GET /api/cockpit/styles` aufgerufen wird
- **THEN** antwortet er mit der Eintragsliste und `fetchedAt`

### Requirement: Brain references are derived deterministically from source paths

The system SHALL derive the Brain wiki page for a given repository source path
by the same rule the ingest pipeline uses to write that page, and by no other
means. The rule is textual and reproducible: strip the file extension, strip a
leading dot, replace `/`, `_` and space with `-`, lowercase the result — the
slug produced by `scripts/brain-ingest-worklist.sh`, under which
`scripts/brain-ingest.sh` stores the page.

The system SHALL NOT use full-text search or semantic retrieval for this
mapping. A derived reference SHALL be emitted only for source paths that the
ingest manifest (`scripts/brain/ingest-sources.yaml`) actually accepts as a
source; for every other path the system SHALL emit no reference rather than a
guessed one.

#### Scenario: A manifest-covered source path yields its wiki page

- **GIVEN** a source path that the ingest manifest assigns to a group
- **WHEN** the Brain reference for it is requested
- **THEN** the returned link points at the page slug the ingest pipeline writes
  for that same path

#### Scenario: A path outside the manifest yields no reference

- **GIVEN** a source path the ingest manifest does not cover, such as a file
  under `website/` or `k3d/`
- **WHEN** the Brain reference for it is requested
- **THEN** no link is returned for that path
- **AND** the response states that the path has no wiki page, so the gap is
  visible rather than silent

#### Scenario: A derived page that does not exist is not offered as a link

- **GIVEN** a derived slug for which the Brain site serves no page
- **WHEN** the references are assembled
- **THEN** the link is omitted from the result
- **AND** the omission is reported alongside the successful links

### Requirement: Panels present their Brain references in the context slot

The system SHALL fill the panel context slot with the derived Brain references,
using the existing `setContext` contract of `{href, label}` entries. Panels
SHALL NOT fetch Brain content themselves; the access SHALL go through the
adapter, so that no panel carries its own `fetch()` (E1).

The adapter SHALL retrieve Brain references as a one-shot request, not as a
poll: the references change only when an ingest run publishes new pages, never
between two seconds of panel life.

#### Scenario: A panel with a known source shows its references

- **GIVEN** a panel whose subject maps to at least one covered source path
- **WHEN** the panel renders
- **THEN** the context slot holds a link per existing wiki page

#### Scenario: An unreachable Brain service leaves the panel honest

- **GIVEN** the Brain service does not answer
- **WHEN** a panel requests its references
- **THEN** the context slot does not silently stay empty
- **AND** the error is carried through to the panel, keeping an empty result
  distinguishable from a failure (D13)

### Requirement: Layout Engine Surface Organization

Das Cockpit organisiert seine Fläche als Command Bar plus Hauptfläche mit zwei Modi (Overview/Fokus), nicht als zweispaltiges Rail+Workspace-Layout mit statischen Rail-Gruppen. Die Rail ist nicht mehr statisch, sondern kontext-sensitiv — sie ändert ihren Inhalt je nach aktivem Modus und Phase.

The system SHALL organize the cockpit surface as a Command Bar (top) plus a main area with exactly two modes — Overview and Fokus — and a context-sensitive rail. The rail contents SHALL adapt to the active mode and phase rather than being a fixed, immutable list of four groups.

#### Scenario: Surface layout is Command Bar + main area + rail

- **GIVEN** the cockpit is loaded
- **WHEN** the layout engine computes the placement
- **THEN** the Command Bar is at the top spanning full width
- **AND** the main area occupies the center
- **AND** the rail is on the side with context-sensitive content

#### Scenario: Rail groups are no longer a fixed immutable list

- **GIVEN** the layout engine is loaded
- **WHEN** the active phase changes from "Bauen" to "Planung"
- **THEN** the rail content changes to reflect the new phase context
- **AND** the old spec's four-group immutable list constraint no longer applies

### Requirement: Pointer-Based Rearrangement

Panels werden mit einer einzigen Eingabe-API bewegt: Pointer Events. Damit gilt derselbe
Codepfad für Maus, Touch und Stift.

The system SHALL move panels between catalog and workspace and reorder them within the
workspace using Pointer Events with pointer capture, SHALL NOT use the HTML5
drag-and-drop API, and SHALL restore the pre-drag arrangement when the pointer interaction
is cancelled.

#### Scenario: Cancelled drag restores the arrangement

- **GIVEN** a panel is being dragged from the catalog toward the workspace
- **WHEN** the pointer interaction is cancelled before release
- **THEN** the stored arrangement is identical to the arrangement before the drag started

### Requirement: Full-Surface Canvas Is One State In Two Layouts

Das Canvas-Panel lässt sich zur Vollfläche aufziehen und zurückholen. Es bleibt dabei ein
Zustand (E7) — der Inhalt wird nicht neu aufgebaut.

The system SHALL toggle a canvas panel between card and full-surface layout without
destroying and recreating its panel instance, so that unsaved canvas content and the
modified marker survive the toggle in both directions.

#### Scenario: Canvas content survives the full-surface toggle

- **GIVEN** a canvas panel with unsaved content in card layout
- **WHEN** it is expanded to full surface and collapsed back
- **THEN** the same panel instance is still registered for that element
- **AND** the unsaved content and the modified marker are unchanged

### Requirement: Layout Persistence Separate From Canvas Content

Die Anordnung ist Ansichtsvorliebe, kein Arbeitsergebnis. Sie wird getrennt vom
Canvas-Speicher abgelegt.

The system SHALL persist the arrangement under its own versioned `localStorage` key,
separate from the canvas content keys, SHALL restore the default arrangement when the
stored value is missing, unparseable or of an unknown version, and SHALL drop entries
referring to panels that no longer exist rather than failing to restore.

#### Scenario: Unknown stored version falls back to the default arrangement

- **GIVEN** a stored layout value whose version does not match the current one
- **WHEN** the engine restores the arrangement
- **THEN** the default arrangement is used and no canvas content key is read or written

### Requirement: Mobile Layout And Terminal Lock

Mobil gilt dieselbe Struktur untereinander statt nebeneinander (3.2). Das Terminal-Panel
ist mobil gesperrt (D8).

The system SHALL, for mobile viewports, render the rail as a top bar plus an expandable
bottom sheet containing the four rail groups, SHALL place workspace panels as a
single-panel stack in full-surface size only, and SHALL refuse to place a terminal panel
in the workspace, keeping it visibly locked rather than hidden.

#### Scenario: Terminal panel is locked, not silently dropped, on mobile

- **GIVEN** a mobile viewport and a terminal panel in the catalog
- **WHEN** the engine computes the placement
- **THEN** the terminal panel is reported as locked with a stated reason
- **AND** it is not placed in the workspace

#### Scenario: Mobile workspace shows one full-surface panel

- **GIVEN** a mobile viewport and three non-terminal panels assigned to the workspace
- **WHEN** the engine computes the placement
- **THEN** exactly one panel is visible and its size is the full-surface size

### Requirement: Layout Engine Stays Build-Free And Ships To Both Shells

Das Kit bleibt buildfrei (D1) und wird von beiden Hüllen über dieselben Dateien geladen.

The system SHALL ship the layout engine as a classic browser script without module syntax,
bundler step or npm dependency, and SHALL make it resolvable under `/cockpit/kit/` in the
repository checkout, in the dev server and inside the built website image.

#### Scenario: Layout asset resolves in the image layout

- **GIVEN** the website image build copies `website/` and the `.lavish` sources
- **WHEN** the resulting file layout is inspected
- **THEN** the layout engine files resolve under `public/cockpit/kit/` and are non-empty

### Requirement: Schreibaktionen laufen über die authentifizierte Admin-Fläche

The system SHALL execute the write actions from E5 that are runnable in the
cluster — setting ticket status and merging pull requests — through the
website's admin API, using the existing session authentication
(`getSession` + `isAdmin`, `403` otherwise). No separate authentication
mechanism SHALL be introduced for them.

The graded confirmation by reversibility (D5/D6), the audit log and the
four-state action slot (D4) SHALL remain in force regardless of which component
performs the action.

#### Scenario: An unauthenticated request is rejected

- **GIVEN** a write request to a cockpit admin endpoint
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`
- **AND** no action is performed

#### Scenario: A non-reversible action names its target

- **GIVEN** an action classified as non-reversible (merging a pull request)
- **WHEN** the user triggers it
- **THEN** the confirmation names the concrete target that must be confirmed
- **AND** the action is only performed after that confirmation

#### Scenario: Every write action is recorded

- **GIVEN** a performed write action
- **WHEN** it completes, whether successfully or not
- **THEN** the audit log holds an entry with timestamp, action and target

### Requirement: Local-only actions stay out of the browser write path

The system SHALL NOT route the write actions that can only run on a developer
machine — killing an agent session, removing a worktree, breaking a lock,
attaching a terminal — through the browser-to-daemon path while that path lacks
a designed authentication.

The reason is not difficulty but impossibility: there is no network route from
the cluster to a developer machine. Agent locks live in the local checkout's
`git-common-dir`, worktrees in the local filesystem, agent processes in the
local process table. These actions remain available on the command line.

#### Scenario: The daemon exposes no unauthenticated write path

- **GIVEN** the cockpit daemon is running
- **WHEN** a write request arrives without the local token
- **THEN** it is rejected with `401`
- **AND** the token is not obtainable over HTTP

### Requirement: Brain is read through the cluster-internal service

The system SHALL read the Brain wiki from the website's admin API via the
cluster-internal service address, not through the `oauth2-proxy` edge and not
from the local daemon. The endpoint SHALL enforce `isAdmin` itself, so that the
protection removed at the edge is restored at the API.

#### Scenario: Brain content requires an admin session

- **GIVEN** a request for Brain content through the cockpit
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`

#### Scenario: An unreachable Brain service is named, not hidden

- **GIVEN** the Brain service does not answer
- **WHEN** Brain content is requested
- **THEN** the response carries an `error` field
- **AND** an empty result set remains distinguishable from a failure (D13)

### Requirement: The adapter resolves each endpoint's host separately

The system SHALL decide **per endpoint** which host serves it, not by a single
base address for all of them. Each endpoint SHALL declare whether its data is
available from the website, only from the local daemon, or from both.

A single base switch is not sufficient and would break the admin page: of the
eight endpoints the adapter requests today, the website serves only three
(`portfolio`, `pods-list`, `factory-control`). Switching the base wholesale
would leave five panels on `404`.

The split follows from where the data actually lives, not from preference:

| Endpoint | Source | Available from |
|---|---|---|
| `portfolio`, `pods-list`, `factory-control` | database, kubectl, factory | website (exists today) |
| `epics` | ticket database | website (buildable) |
| `styles` | repository files | website (buildable) |
| `ci` | GitHub API | website (buildable) |
| `agents` | local agent locks in the checkout's `git-common-dir` | **local daemon only** |
| `models` | local model health ports on `127.0.0.1` | **local daemon only** |

`agents` and `models` are not merely unbuilt on the website — they read state
that exists only on a developer machine. They SHALL remain daemon-only.

#### Scenario: A website-backed endpoint is served by the website

- **GIVEN** the cockpit is served from the admin area
- **WHEN** the adapter requests an endpoint the website serves
- **THEN** it addresses the website's own origin

#### Scenario: A daemon-only endpoint is not silently requested from the website

- **GIVEN** the cockpit is served from the admin area
- **WHEN** a panel needs a daemon-only endpoint
- **THEN** the adapter does not request it from the website
- **AND** the panel reports that the source is unavailable in this context,
  rather than showing an empty result (D13)

#### Scenario: Standalone serves everything from the daemon

- **GIVEN** the cockpit is served as a standalone page
- **WHEN** the adapter requests any endpoint
- **THEN** it addresses the local daemon

### Requirement: The website reaches Brain through an explicit ingress policy

The system SHALL carry a NetworkPolicy that allows ingress from the `website`
namespace to the `brain` pod on its container port. Without it the request is
dropped: the `workspace` namespace carries `allow-intra-namespace-ingress` with
an empty pod selector, which denies everything from outside by default. Every
other service the website reaches has such a policy
(`allow-website-to-{shared-db,pocket-id,nextcloud,vaultwarden,docuseal}-ingress`);
`brain` is the one that is missing.

#### Scenario: The website reaches the Brain service

- **GIVEN** the website pod and the brain pod are running
- **WHEN** the website requests the brain service on its container port
- **THEN** the connection succeeds
- **AND** it does not pass through the `oauth2-proxy` edge

### Requirement: Daemon Runtime Contract

The cockpit daemon SHALL be startable from a clean checkout without manual dependency
installation. Every package imported by `.lavish/kit/daemon/` SHALL be declared in a
`package.json` tracked in the repository, and the daemon SHALL be covered by the
TypeScript project references so that the repository typecheck includes it.

#### Scenario: Starting the daemon from a clean checkout

- **GIVEN** a checkout in which only the repository's declared dependencies are installed
- **WHEN** the operator starts the cockpit daemon
- **THEN** the daemon listens on its configured port
- **AND** `GET /health` answers with HTTP 200

#### Scenario: Dependency is declared, not merely installed

- **GIVEN** the repository's `package.json`
- **WHEN** the daemon's imports are resolved
- **THEN** `hono` and `@hono/node-server` are both declared as dependencies
- **AND** the module resolver finds them at runtime

#### Scenario: Typecheck covers the daemon sources

- **GIVEN** a type error introduced in `.lavish/kit/daemon/`
- **WHEN** the repository typecheck runs
- **THEN** the typecheck reports that error instead of passing

### Requirement: Documented Start Path

The repository SHALL provide a single documented command that starts the cockpit daemon,
waits until it is answering, and reports failure loudly. The command SHALL NOT exit
successfully while the daemon is unreachable.

#### Scenario: Start command waits for readiness

- **GIVEN** the daemon is not running
- **WHEN** the operator runs the documented start command
- **THEN** the command returns only after `GET /health` answers
- **AND** the command exits non-zero if the daemon never becomes reachable

### Requirement: Daemon Test Gate Is Fail-Closed In CI

The daemon-dependent tests of the sdlc-cockpit suite SHALL NOT be silently skipped in CI.
When the environment declares that a daemon is required, an unreachable daemon SHALL fail
the test run. Outside that environment, skipping remains the intended behaviour so the
static tests can be run without a daemon.

#### Scenario: Unreachable daemon fails the run when a daemon is required

- **GIVEN** the environment declares that the daemon is required
- **AND** no daemon is listening on the configured port
- **WHEN** the sdlc-cockpit suite runs
- **THEN** the run reports a failure
- **AND** the output contains no skipped tests

#### Scenario: Skipping stays available for local runs

- **GIVEN** the environment does not declare that the daemon is required
- **AND** no daemon is listening on the configured port
- **WHEN** the sdlc-cockpit suite runs
- **THEN** the daemon-dependent tests are skipped
- **AND** the run succeeds

#### Scenario: CI declares the requirement and starts the daemon

- **GIVEN** the CI workflow that executes the spec suite
- **WHEN** that workflow definition is inspected
- **THEN** it starts the cockpit daemon before the suite
- **AND** it declares the daemon as required

### Requirement: Health Endpoint Carries A Fetch Timestamp

Every daemon response that the cockpit renders SHALL carry the timestamp of the data it
reports, including the health endpoint. A consumer SHALL be able to tell how old the
information is without inferring it from the request time.

#### Scenario: Health response is timestamped

- **GIVEN** a running daemon
- **WHEN** `GET /health` is requested
- **THEN** the response carries an ISO 8601 fetch timestamp

### Requirement: Genau eine SDLC-Fläche im Admin-Menü (E1/E2)

Das Admin-Menü SHALL weiterhin genau einen Eintrag auf die SDLC-Fläche führen. Der Eintrag zeigt auf `/admin/cockpit` (statt `/sdlc/cockpit`), um die Spec-Konvention zu erfüllen.

#### Scenario: Cockpit URL is /admin/cockpit

- **GIVEN** the admin sidebar navigation is rendered
- **WHEN** the cockpit entry is inspected
- **THEN** it targets `/admin/cockpit`
- **AND** the old `/sdlc/cockpit` path redirects to `/admin/cockpit`

### Requirement: Pipeline-Inhalt lebt als Panel im Cockpit

Die Fläche `/admin/cockpit` SHALL den `DevStatusTabs`-Baum durch die Command-Bar + Overview/Fokus-Architektur ersetzen. Der `PipelinePanel`-Wrapper entfällt, da das Unified Panel System Svelte-Komponenten nativ unterstützt.

#### Scenario: PipelinePanel wrapper is removed

- **GIVEN** the repository after this change
- **WHEN** the component files are inspected
- **THEN** `PipelinePanel.svelte` no longer exists
- **AND** no component imports from `PipelinePanel.svelte`

#### Scenario: Tab pre-selection survives the architectural change

- **GIVEN** a request to `/admin/cockpit?mode=fokus&phase=planung`
- **WHEN** the page is rendered
- **THEN** the Fokus mode is active with the Planung phase selected

### Requirement: Alt-Pfade lösen auf das Cockpit auf

Die Redirect-Tabelle SHALL für `/admin/planungsbuero`, `/admin/dora`,
`/admin/factory-budget` und `/admin/factory-observability` direkt auf
`/admin/cockpit?tab=…` zeigen, ohne Zwischenschritt über `/admin/pipeline`. Der Pfad
`/admin/pipeline` SHALL als query-erhaltende 301-Weiterleitung auf `/admin/cockpit`
bestehen bleiben und SHALL nicht in die Redirect-Tabelle aufgenommen werden, da diese den
Query-String nicht durchreicht.

#### Scenario: Legacy path resolves in one hop

- **GIVEN** a request to `/admin/dora`
- **WHEN** the redirect map resolves the path
- **THEN** the target is `/admin/cockpit?tab=analytics`

#### Scenario: Pipeline path keeps its query string

- **GIVEN** a request to `/admin/pipeline?tab=kosten`
- **WHEN** the page responds
- **THEN** it is a 301 to `/admin/cockpit?tab=kosten`

### Requirement: Der verwaiste Admin-Cockpit-Baum ist entfernt

Der Komponentenbaum unterhalb von `Cockpit.svelte` SHALL nicht mehr im Repository
existieren, soweit die einzelnen Dateien nachweislich keinen weiteren Nutzer haben. Die
weiterhin genutzte Ticket-Fläche — der Sidekick, die `cockpit-*`-Bibliotheken und die
Endpunkte unter `/api/admin/cockpit/` — SHALL unverändert bestehen bleiben.

#### Scenario: Orphan tree is gone while the live surface remains

- **GIVEN** the repository after this change
- **WHEN** the component files of the orphan tree are looked up
- **THEN** none of them exists
- **AND** the cockpit sidekick view and the `/api/admin/cockpit/portfolio` endpoint still exist

### Requirement: OF4 — mobile-cockpit.css entfällt

`website/src/styles/mobile-cockpit.css` SHALL entfallen. Die Datei beschreibt die Struktur
des alten Admin-Cockpits und wird von keiner Seite, keinem Layout und keinem Stylesheet
geladen; ihr Wegfall ist damit keine Verhaltensänderung.

#### Scenario: No stylesheet references the removed file

- **GIVEN** the repository after this change
- **WHEN** `website/` is searched for references to `mobile-cockpit`
- **THEN** no reference remains
- **AND** `website/src/styles/admin-responsive.css` still exists and is still referenced

### Requirement: Setting a ticket status is the one implemented write action

The system SHALL implement exactly one cluster-side write action in this change:
setting a ticket's status through the website's admin API. Merging a pull
request SHALL NOT be implemented here.

The reason is a token boundary, not an omission: the website pod mounts only
`GITHUB_CONTENT_TOKEN`, whose scope is limited to `website/content/**`. The
broader `GITHUB_PAT` is not set in the deployment, so a merge endpoint would be
dead at runtime.

The confirmation grading, the audit log and the four-state action slot SHALL
nevertheless be built in full, so that a later write action attaches to them as
a second consumer rather than reintroducing them.

#### Scenario: The ticket status endpoint requires an admin session

- **GIVEN** a request to set a ticket status
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`
- **AND** no status is written

#### Scenario: A status change is written and reported

- **GIVEN** an authenticated admin request naming a ticket and a valid status
- **WHEN** the endpoint processes it
- **THEN** the ticket carries the new status
- **AND** the response names both the previous and the new status

#### Scenario: An unknown status is rejected

- **GIVEN** an authenticated admin request naming a status outside the
  ticket status vocabulary
- **WHEN** the endpoint processes it
- **THEN** it responds `400`
- **AND** no status is written

### Requirement: The audit log lives in the ticket database and is bound to the action

The system SHALL record every performed cockpit write action in the ticket
database, with timestamp, actor, action, target and outcome. The actor SHALL be
derived from the session, never from the request body.

The audit row and the business change SHALL be written in one transaction. A
lost audit row is not tolerable here: the promise is that every performed write
action appears in the log, so a failed audit write SHALL fail the action rather
than pass silently.

#### Scenario: A performed action leaves an audit row

- **GIVEN** an authenticated admin sets a ticket status
- **WHEN** the change succeeds
- **THEN** the audit log holds a row with timestamp, actor, action and target

#### Scenario: A failed audit write fails the action

- **GIVEN** an authenticated admin sets a ticket status
- **WHEN** the audit row cannot be written
- **THEN** the status change is not committed
- **AND** the response reports the failure

#### Scenario: Reading the audit log requires an admin session

- **GIVEN** a request for the audit log
- **WHEN** it carries no valid admin session
- **THEN** the endpoint responds `403`

### Requirement: The action slot carries four distinguishable states

The system SHALL express the action slot in the four states `available`,
`locked`, `confirming` and `running`. A locked action SHALL be shown as visibly
and recognisably locked, not hidden — otherwise a missing action cannot be told
apart from an action that is merely not unlocked.

The `running` state SHALL end on the actual outcome of the action, not after a
fixed delay. A slow action SHALL NOT be shown as available while it is still
running.

#### Scenario: A locked action stays visible

- **GIVEN** an action the current context does not permit
- **WHEN** the panel renders its action slot
- **THEN** the action remains visible and is marked as locked

#### Scenario: The running state ends with the result

- **GIVEN** an action that takes longer than a fixed timeout would allow
- **WHEN** it is still running
- **THEN** the slot still shows `running`
- **AND** it changes only once the action has resolved or failed

### Requirement: Confirmation is graded by reversibility

The system SHALL grade the confirmation by the reversibility of the action:
repeatable actions SHALL ask nothing, reversible actions SHALL ask a simple
confirmation, and non-reversible actions SHALL ask a confirmation that names the
concrete target. An action of unknown classification SHALL be treated as
non-reversible.

The classification SHALL live in a component that can be exercised without a
browser document, so that it is measurable rather than merely asserted.

#### Scenario: A repeatable action asks nothing

- **GIVEN** a repeatable action such as a refresh
- **WHEN** the user triggers it
- **THEN** it runs without a confirmation

#### Scenario: A non-reversible action names its target

- **GIVEN** a non-reversible action and a concrete target
- **WHEN** the user triggers it
- **THEN** the confirmation names that target

#### Scenario: A non-reversible action without a target is refused

- **GIVEN** a non-reversible action for which no target is supplied
- **WHEN** a confirmation is requested for it
- **THEN** the request fails rather than producing an unnamed confirmation

### Requirement: Non-reversible actions are unlocked per session on small screens

The system SHALL lock non-reversible actions by default in the mobile and
fullscreen presentation, and SHALL require a deliberate unlock that lasts for
the session. The lock SHALL apply when the page is already loaded at that size,
not only when the presentation is switched.

#### Scenario: A page loaded at mobile size is locked

- **GIVEN** the cockpit is loaded at mobile size
- **WHEN** a panel with a non-reversible action renders
- **THEN** that action is locked

#### Scenario: A deliberate unlock lasts for the session

- **GIVEN** the user has deliberately unlocked non-reversible actions
- **WHEN** the page is reloaded within the same session
- **THEN** the actions remain unlocked
- **AND** a new session starts locked again

### Requirement: The browser holds no daemon write token

The system SHALL NOT keep a browser-side path to the daemon's write endpoints
while no authentication is designed for it. The token retrieval and the agent
write call SHALL be removed rather than kept as unreachable code, because code
that fails by construction cannot be told apart from code that is broken.

The daemon's own write endpoints SHALL remain in place and SHALL remain
token-guarded; only the browser-side access is removed.

#### Scenario: The adapter exposes no token retrieval

- **GIVEN** the cockpit adapter is loaded
- **WHEN** its public interface is inspected at runtime
- **THEN** it offers the ticket write action
- **AND** it offers neither a token retrieval nor an agent write action

#### Scenario: The ticket write action uses the session

- **GIVEN** the cockpit is served from the admin area
- **WHEN** the adapter performs the ticket write action
- **THEN** it addresses the website's admin API with the session credentials
- **AND** it sends no bearer token

### Requirement: K1-01 — Design-Tokens

#### Scenario: K1-01 — Design-Tokens
`tokens.css` definiert alle Farben, Typografie, Abstände, Radien und Bewegungs-parameter
als CSS-Variablen. Keine hartkodierten Werte außerhalb der Token-Definition. (E11)

### Requirement: K1-02 — Dokument-Bausteine

#### Scenario: K1-02 — Dokument-Bausteine
`document.css` definiert Überschriften, Fließtext, Tabellen, Entscheidungsblöcke,
Frage-Marker, Code-Blöcke, Blockquotes, Listen. Per `<link>` von jedem Board nutzbar.

### Requirement: K1-03 — Panel-Rahmen

#### Scenario: K1-03 — Panel-Rahmen
`panel.css` definiert Panel-Frame, Kopf, Body, Aktions-Slot (4 Zustände: verfügbar/
gesperrt/bestätigung offen/läuft), Kontext-Slot. Drei Größen: Rail/Karte/Vollbild.
(D2–D6, D8, D12)

### Requirement: K1-04 — Panel-Laufzeit

#### Scenario: K1-04 — Panel-Laufzeit
`panel.js` implementiert Panel-Klasse mit vier Typen (Status/Strom/Canvas/Terminal),
Typ-gesteuertem Refresh/Fehler/Scroll-Verhalten, Action-Zustandsmaschine. (D2, D4, D5, D10–D13)

### Requirement: K1-05 — Daten-Adapter

#### Scenario: K1-05 — Daten-Adapter
`adapter.js` definiert den Adapter-Vertrag (E1, E16) und liefert Fixture-Daten für
6 Domänen (Tickets, Agents, CI, Cluster, Factory, Modelle). Kein `fetch()` in Panels.

### Requirement: K1-06 — Belegartefakte

#### Scenario: K1-06 — Belegartefakte
`reference-board.html` (Schicht 1+2) und `cockpit-shell.html` (Schicht 3) belegen
den Vertrag. Beide standalone, `file://`-öffnungsfähig, kein Build.

### Requirement: K1-07 — Tests

#### Scenario: K1-07 — Tests
6 Spec-BATS (Typdeklaration, Rail-Darstellung, kein direktes fetch, Token-Only,
Artefakt-Existenz, Kit-Binding) + 1 Vitest (Panel-Vertrag). Negativtests mit Positiv-Anker.

### Requirement: Adapter-Vertragstreue (E1)

The K2 adapter SHALL expose the same 8 methods as the K1 fixture adapter (`tickets`, `agents`, `ci`,
`cluster`, `factory`, `models`, `ticketAction`, `agentAction`) with identical signatures, so that
no panel code changes when K1 fixtures are replaced with K2 live data.

#### Scenario: Methoden-Signaturen identisch

- **GIVEN** der K1-Fixture-Adapter mit 6 Read- und 2 Write-Methoden
- **WHEN** der K2-Adapter geladen wird
- **THEN** sind alle 8 Methoden mit denselben Namen und Rückgabetypen vorhanden
- **AND** `typeof data.tickets === 'function'` ist wahr
- **AND** `typeof data.agents === 'function'` ist wahr

#### Scenario: Kein direkter fetch-Aufruf in Panels

- **GIVEN** alle Panel-Dateien unter `.lavish/kit/` und `.lavish/`
- **WHEN** nach `fetch(` oder `XMLHttpRequest` gesucht wird
- **THEN** kommt kein Treffer außerhalb von `adapter.js` oder `daemon/`
- **AND** mindestens ein `fetch(`-Aufruf existiert in `adapter.js` **als Positiv-Anker** (T002356-M1)

---

### Requirement: Livedaten statt Fixtures

The daemon SHALL serve real data from `kubectl --context fleet`, `gh-axi`, `git`, `agent-lock.sh`,
`ticket-mcp`, `factory-mcp`, and opencode.db, replacing all K1 fixture arrays.

#### Scenario: Cluster-Daten sind live

- **GIVEN** der Daemon läuft auf Port 39152
- **WHEN** `GET /api/admin/cluster/pods-list?namespace=workspace` aufgerufen wird
- **THEN** enthält die Antwort `fetchedAt` (ISO 8601 Timestamp)
- **AND** die Antwort enthält echte Pod-Daten (nicht die K1-Fixtures mit `ollama-llama-cpp-7f9d6`)
- **AND** kein `error`-Feld, wenn `kubectl` erreichbar ist

#### Scenario: Agent-Daten aus agent-lock.sh

- **GIVEN** der Daemon läuft
- **WHEN** `GET /api/cockpit/agents` aufgerufen wird
- **THEN** enthält die Antwort mindestens die Felder `sid`, `label`, `ticket`, `worktree`, `status`

### Requirement: D12 — Aktualitäts-Timestamp

The system SHALL include a `fetchedAt` field (ISO 8601) in every response so that the panel can
display data freshness at all times, not only on error.

#### Scenario: Jede GET-Antwort hat fetchedAt

- **GIVEN** der Daemon antwortet auf einen beliebigen GET-Endpoint
- **WHEN** die Antwort geparst wird
- **THEN** ist `response.fetchedAt` ein gültiger ISO-8601-String
- **AND** `response.fetchedAt` liegt innerhalb der letzten 5 Sekunden

#### Scenario: Stale-Markierung nach Fehler

- **GIVEN** eine Datenquelle wird unerreichbar (z.B. `kubectl` timeout)
- **WHEN** der nächste Poll-Zyklus fehlschlägt
- **THEN** enthält die Antwort `error` und `staleSince`
- **AND** der letzte gültige Daten-Payload bleibt erhalten
- **AND** `fetchedAt` zeigt den Zeitpunkt des letzten erfolgreichen Fetches

---

### Requirement: D13 — Kein stiller Ersatzwert

The system SHALL never return null, a dash, or a sample value that looks like a measurement when a
data source is unreachable. Instead it SHALL return an explicit `error` field.

#### Scenario: Fehler statt Null

- **GIVEN** eine Datenquelle wirft einen Fehler
- **WHEN** der Daemon antwortet
- **THEN** enthält die Antwort ein `error`-Feld mit menschenlesbarer Beschreibung
- **AND** kein Datenfeld ist `null`, `"–"`, `-1` oder ein Beispielwert
- **AND** der Test enthält einen Positiv-Anker: zuerst wird geprüft, dass im Erfolgsfall KEIN `error`-Feld existiert (T002356-M1)

---

### Requirement: Port-Check via Health-Endpoint (E1-Ersatz)

The daemon SHALL replace the unreliable `fetch(…, {mode:'no-cors'})` port check with a proper
health endpoint probe (`GET /health`) for each model server.

#### Scenario: Port-Check erkennt 500er als Fehler

- **GIVEN** ein Dienst auf Port 8091 liefert HTTP 500 auf `/health`
- **WHEN** der Daemon den Health-Check ausführt
- **THEN** wird der Dienst als `degraded` oder `offline` markiert
- **AND** nicht als `running` (was der alte no-cors-Check tun würde)

---

### Requirement: Token für Schreibaktionen (E17)

The daemon SHALL require a Bearer token for all POST/PUT/DELETE requests and SHALL write the token
to a file with `0600` permissions at startup.

#### Scenario: POST ohne Token wird abgelehnt

- **GIVEN** der Daemon läuft
- **WHEN** `POST /api/cockpit/ticket-action` ohne `Authorization`-Header gesendet wird
- **THEN** ist der Statuscode `401`
- **AND** die Antwort enthält `error: "Token required for write actions"`

#### Scenario: Token-Datei hat enge Rechte

- **GIVEN** der Daemon wurde gestartet
- **WHEN** `stat /tmp/cockpit-daemon.token` aufgerufen wird
- **THEN** sind die Dateirechte `0600` (nur Owner les-/schreibbar)

---

### Requirement: SSE-Strom mit Lückenmarkierung

The SSE stream endpoint SHALL mark gaps when the client disconnects and reconnects, so that the
stream panel can show missing data ranges (Design Table 4.2, Typ "Strom").

#### Scenario: Lückenmarkierung nach Reconnect

- **GIVEN** ein Client ist mit `GET /api/cockpit/stream/agents` verbunden
- **WHEN** der Client die Verbindung trennt und nach 30 s wieder verbindet
- **THEN** sendet der Server ein `gap`-Event mit `from`- und `to`-Timestamp
- **AND** danach werden reguläre Events fortgesetzt

---

### Requirement: D10 — Panel-deklarierte Refresh-Rate

The adapter SHALL accept a `refreshMs` parameter per method call. For sources that
carry no push channel, the adapter SHALL poll at that interval. For sources served
by the notification stream, `refreshMs` SHALL be accepted and ignored, and the
adapter SHALL deliver updates when the stream emits them.

The set of poll-served sources SHALL be limited to those with no PostgreSQL
origin — pod state (kubectl), CI runs (GitHub) and model health (Ollama). Every
poll-served source SHALL be named in the action and source inventory together
with the reason it cannot be pushed.

#### Scenario: refreshMs is honoured for a poll-served source

- **GIVEN** the adapter is called as `data.cluster({ refreshMs: 5000 })`
- **WHEN** 10 seconds pass
- **THEN** at least 2 fetches were issued for that source

#### Scenario: A push-served source does not poll

- **GIVEN** the adapter is called as `data.tickets({ refreshMs: 5000 })` and the
  notification stream is connected
- **WHEN** 10 seconds pass without any notification
- **THEN** no fetch was issued for that source

### Requirement: D11 — Kein Polling unsichtbarer Panels

The adapter SHALL pause all polling when `document.hidden` is true and resume when the page becomes
visible again.

#### Scenario: Polling pausiert bei hidden

- **GIVEN** ein Poll-Intervall läuft mit 1 s
- **WHEN** `document.hidden` auf `true` gesetzt wird (via `visibilitychange`)
- **THEN** wird kein weiterer Fetch-Aufruf ausgelöst
- **AND** nach `document.hidden = false` wird das Polling fortgesetzt

### Requirement: Daemon-Port außerhalb reservierter Portbereiche

The cockpit daemon SHALL use a default port outside the port ranges reserved by Windows/Hyper-V on
WSL2 hosts, and outside the local ephemeral port range, so that it can bind on the development
platform it targets.

#### Scenario: Kein Cockpit-Port liegt im Hyper-V-Reservierungsbereich

- **GIVEN** die Port-Konfiguration in `.lavish/kit/daemon/server.ts`, `.lavish/kit/adapter.js`,
  `Taskfile.yml` und den Testdateien unter `tests/spec/sdlc-cockpit/`
- **WHEN** die dort verdrahteten Portwerte gesammelt werden
- **THEN** liegt keiner im Bereich 49152–49251
- **AND** der Default-Port in `server.ts` ist auffindbar und größer als 1024 **als Positiv-Anker**
  (T002356-M1)

#### Scenario: Daemon bindet auf dem Default-Port

- **GIVEN** ein WSL2-Host, auf dem `netsh interface ipv4 show excludedportrange protocol=tcp` den
  Bereich 49152–49251 als ausgeschlossen ausweist
- **WHEN** der Daemon ohne `COCKPIT_DAEMON_PORT` gestartet wird
- **THEN** antwortet `GET /health` auf dem Default-Port
- **AND** es tritt kein `EADDRINUSE` auf

---

### Requirement: Ehrliche Startmeldung des Daemons

The cockpit daemon SHALL report a successful start only after the socket is actually bound, and
SHALL report a failed bind with port, cause and remedy in plain language instead of an unhandled
error stack trace.

#### Scenario: Kein Erfolgs-Log ohne Erfolg

- **GIVEN** ein Port, den ein anderer Prozess bereits hält
- **AND** dieser Prozess antwortet auf dem Port **als Positiv-Anker** (T002356-M1)
- **WHEN** der Daemon mit `COCKPIT_DAEMON_PORT` auf genau diesen Port gestartet wird
- **THEN** enthält seine Ausgabe kein `listening on`
- **AND** die Ausgabe nennt den betroffenen Port und die Ursache (`EADDRINUSE`, belegt oder
  reserviert)
- **AND** der Prozess endet mit einem Exit-Code ungleich 0

### Requirement: Laufzeitdateien spiegeln nur einen laufenden Daemon

The cockpit daemon SHALL write its PID and token files only after the socket is bound, and SHALL
remove them on shutdown, so that the files never describe a process that is not serving.

#### Scenario: Ein gescheiterter Start lässt den laufenden Daemon unangetastet

- **GIVEN** ein Daemon läuft und hat PID- und Token-Datei geschrieben
- **AND** er antwortet auf `/health` **als Positiv-Anker** (T002356-M1)
- **WHEN** ein zweiter Daemon auf demselben Port gestartet wird und mit `EADDRINUSE` scheitert
- **THEN** enthält die PID-Datei unverändert die PID des laufenden Daemons
- **AND** die Token-Datei enthält unverändert dessen Token
- **AND** ein `POST /api/cockpit/ticket-action` mit dem Token aus der Datei liefert HTTP 200

#### Scenario: Beim Beenden bleiben keine verwaisten Dateien zurück

- **GIVEN** ein laufender Daemon, dessen PID- und Token-Datei existieren **als Positiv-Anker**
  (T002356-M1)
- **WHEN** der Prozess per `SIGTERM` beendet wird
- **THEN** sind beide Dateien entfernt
- **AND** der Prozess läuft nicht mehr

#### Scenario: Das Verzeichnis der Laufzeitdateien ist umstellbar

- **GIVEN** die Umgebungsvariable `COCKPIT_DAEMON_STATE_DIR` zeigt auf ein Verzeichnis
- **WHEN** der Daemon startet
- **THEN** liegen PID- und Token-Datei in diesem Verzeichnis
- **AND** ohne die Variable liegen sie unverändert unter `/tmp`

### Requirement: Tests lassen keinen Daemon-Prozess zurück

Tests that start the cockpit daemon SHALL terminate it completely, so that no process keeps
listening on a test port after the run.

#### Scenario: Der Runtime-Contract-Test hinterlässt keinen Lauscher

- **GIVEN** auf dem Testport lauscht niemand **als Positiv-Anker** (T002356-M1)
- **WHEN** `tests/spec/sdlc-cockpit/daemon-runtime-contract.bats` Test 3 ausgeführt wird
- **AND** dieser Lauf mit Exit-Code 0 endet **als Positiv-Anker** (T002356-M1)
- **THEN** antwortet auf dem Testport danach niemand mehr

#### Scenario: Der Test schreibt nicht in den Zustand eines echten Daemons

- **GIVEN** ein Test startet den Daemon
- **WHEN** er `COCKPIT_DAEMON_STATE_DIR` auf ein eigenes Verzeichnis setzt
- **THEN** liegen PID- und Token-Datei dort
- **AND** `/tmp/cockpit-daemon.pid` bleibt unberührt

### Requirement: Cockpit sources resolve against the SDLC build target

Every website-served endpoint in the adapter's endpoint map SHALL resolve to a
route that exists in `website/src/pages/sdlc/`. An endpoint entry whose path has
no corresponding route file SHALL NOT be shipped.

This requirement exists because the build target split (T002624) moved the SDLC
routes and the adapter kept pointing at the retired `/api/admin/cockpit/*` paths,
which turned every panel fetch into a 404 that the adapter reported as an
unreachable source.

#### Scenario: Every mapped website endpoint has a route

- **GIVEN** the adapter's endpoint map
- **WHEN** each entry marked `website: true` is resolved against the repository
- **THEN** a route file exists for its path under `website/src/pages/sdlc/`

#### Scenario: A retired path is not reachable

- **GIVEN** the retired prefix `/api/admin/cockpit/`
- **WHEN** the adapter's endpoint map is inspected
- **THEN** no entry uses that prefix

### Requirement: Database changes reach the cockpit as notifications

The system SHALL emit a PostgreSQL notification when the tables backing the
cockpit change — factory phase events, cockpit audit entries and ticket status
transitions. The notification payload SHALL name the affected domain and SHALL
stay small enough to survive the payload limit; consumers SHALL re-read the
authoritative row rather than trust the payload as a full record.

#### Scenario: A phase event produces a notification

- **GIVEN** a listener holds `LISTEN` on the cockpit channel
- **WHEN** a row is inserted into `tickets.factory_phase_events`
- **THEN** the listener receives a notification naming the factory domain

#### Scenario: The payload stays within the limit

- **GIVEN** a row whose textual content exceeds the notification payload limit
- **WHEN** the trigger fires
- **THEN** the notification is delivered and carries identifying fields, not the
  full row

### Requirement: The notification stream is served by the website under admin session

The system SHALL expose the cockpit event stream as a server-sent-event route in
the SDLC build target. The route SHALL reject a request without a valid admin
session. The route SHALL send a heartbeat so an idle connection is
distinguishable from a broken one, and SHALL release its resources when the
client disconnects.

A single listening connection SHALL serve all connected cockpit clients; the
route SHALL NOT open one database connection per browser.

#### Scenario: An unauthenticated request is rejected

- **GIVEN** a request to the stream route without an admin session
- **WHEN** the route handles it
- **THEN** it responds 401 and opens no stream

#### Scenario: Two clients share one listening connection

- **GIVEN** the stream route is serving one connected client
- **WHEN** a second client connects
- **THEN** the number of listening database connections stays at one

#### Scenario: A disconnect releases the subscription

- **GIVEN** a connected client
- **WHEN** the client disconnects
- **THEN** its subscription is removed and its timers are cleared

### Requirement: The adapter contract is unchanged by the switch to push

The adapter SHALL keep the method signatures and the returned handle shape
(`subscribe`, `data`) that the panel runtime consumes. A panel SHALL NOT need to
know whether its source is served by poll or by notification.

Where a source is push-served, the panel runtime SHALL NOT additionally run its
own refresh timer for that source.

#### Scenario: The handle shape is stable

- **GIVEN** a push-served adapter method
- **WHEN** it is called
- **THEN** it returns a handle exposing `subscribe` and `data`, as the poll
  implementation did

#### Scenario: No double delivery

- **GIVEN** a panel bound to a push-served source
- **WHEN** the panel is mounted
- **THEN** no refresh timer is running for that panel

### Requirement: Frequently used SDLC actions are reachable from the cockpit

The system SHALL make the following actions executable from the cockpit:
the six existing ticket and feature endpoints (`feature-action`,
`feature-actions`, `batch`, `reorder`, `reparent`, `suggest`); factory control
(tick, enqueue, slot release); deploy and CI (Flux reconcile, CI rerun); and the
ticket lifecycle (stage plan, release hold, close).

Every action SHALL be classified by reversibility in the action policy. An action
that is not classified SHALL be treated as irreversible. Every execution SHALL be
recorded in `tickets.cockpit_audit` with actor, action, target and outcome —
including failed attempts.

#### Scenario: An unclassified action is treated as irreversible

- **GIVEN** an action name absent from the policy's classification
- **WHEN** the policy is asked to classify it
- **THEN** it returns the irreversible class and requires a confirmation naming
  the target

#### Scenario: A failed action is still recorded

- **GIVEN** an action whose execution fails
- **WHEN** the request completes
- **THEN** an audit row exists with outcome `failure`

#### Scenario: An action requires an admin session

- **GIVEN** a request to an action endpoint without an admin session
- **WHEN** the endpoint handles it
- **THEN** it responds 401 and performs no write

### Requirement: Reachability of exposed actions is demonstrated, not asserted

The system SHALL carry an inventory naming every action exposed to the cockpit
with its endpoint, its reversibility class and its audit behaviour. The inventory
SHALL be covered by a test that invokes each listed action and checks the
observed result — the presence of an entry in the document SHALL NOT by itself
count as evidence of reachability.

#### Scenario: Every inventory entry resolves to a route

- **GIVEN** the action inventory
- **WHEN** each entry's endpoint is resolved against the repository
- **THEN** a route file exists for it and the route accepts the documented method

#### Scenario: An inventory entry without a classification fails the check

- **GIVEN** an inventory entry carrying no reversibility class
- **WHEN** the inventory check runs
- **THEN** it fails and names the entry

### Requirement: The cockpit header reports its actual data source

The cockpit SHALL indicate whether it is serving live data or fixtures based on
the adapter's actual state. A fixed label SHALL NOT be used.

#### Scenario: Live data is labelled as live

- **GIVEN** the adapter is serving live endpoints
- **WHEN** the cockpit header renders
- **THEN** it does not claim fixture mode

### Requirement: Dev-Deployment — SDLC-Console auf mentolder-dev-Cluster

Das Repository SHALL einen ausführbaren Deployment-Pfad bereitstellen, der das
SDLC-Cockpit auf einem dedizierten k3d-Cluster `mentolder-dev` erreichbar macht
(`Taskfile.sdlc.yml` `sdlc:cluster:create` + `sdlc:deploy`). Das Ergebnis SHALL
per BATS-Test nachgewiesen sein, nicht per Behauptung.

#### Scenario: SDLC-Stack ist deployed und erreichbar

- **GIVEN** der `mentolder-dev`-Cluster läuft und der SDLC-Stack wurde per `sdlc:deploy` ausgerollt
- **WHEN** `GET http://sdlc.localhost/sdlc/cockpit` aufgerufen wird
- **THEN** antwortet die SDLC-Console mit HTTP 200 oder einem gültigen Auth-Redirect
- **AND** der BATS-Test `tests/spec/cockpit-availability/*.bats` läuft grün

#### Scenario: Cluster-Ziel ist dokumentiert

- **GIVEN** die Deployment-Doku des SDLC-Stacks
- **WHEN** der Zielcluster nachgeschlagen wird
- **THEN** heißt er `mentolder-dev` und der Ausführungspfad ist `task sdlc:cluster:create` gefolgt von `task sdlc:deploy`

### Requirement: Dev-Login — OAuth-Client für die lokale Website

Der lokale Login-Pfad SHALL funktionieren: Der Pocket-ID-Client `website` SHALL den
Callback `http://web.localhost/api/auth/callback` akzeptieren, und die Dev-`SITE_URL`
SHALL konsistent mit diesem Callback sein, sodass `GET /sdlc/cockpit` ohne
*"OAuth 2.0 Client does not exist"* bis zum authentifizierten Cockpit führt.

#### Scenario: Admin meldet sich lokal an und erreicht das Cockpit

- **GIVEN** ein Admin-Benutzer existiert im lokalen Pocket ID
- **WHEN** der Benutzer `http://localhost:4321/sdlc/cockpit` öffnet und sich über den OAuth-Flow anmeldet
- **THEN** endet der Flow im Cockpit (kein OAuth-Client-Fehler)
- **AND** die Session gilt als gültige Admin-Session

### Requirement: Header-Status spiegelt Livedaten statt Fixtures

Das Cockpit-Header-Badge SHALL den realen Datenmodus (Livedaten) anzeigen und nicht mehr
"Fixtures (K1)", sobald `adapter.js` Livedaten liefert.

#### Scenario: Badge zeigt Livedaten

- **GIVEN** das Cockpit lädt mit einem konfigurierten Adapter, der Livedaten liefert
- **WHEN** der Header gerendert wird
- **THEN** zeigt das Status-Element den Livedaten-Status an
- **AND** es zeigt nicht "Fixtures (K1)"

### Requirement: Realtime-Push — LISTEN/NOTIFY-SSE statt Polling

DB-gestützte Cockpit-Domänen (Tickets, Audit, Factory-Phasen) SHALL über
PostgreSQL `LISTEN/NOTIFY` als Event-Quelle in Echtzeit aktualisiert werden. Die
Website-API SHALL einen SSE-Endpunkt `/api/admin/cockpit/stream` mit Admin-Session-Auth
bereitstellen, der DB-Events an verbundene Cockpit-Clients fan-out. Polling SHALL nur noch
für Quellen ohne Postgres-Quelle (Pods, CI/GitHub, Modell-Health) als Fallback dienen.

#### Scenario: DB-Event wird an verbundene Clients gepusht

- **GIVEN** ein Admin-Client ist mit `/api/admin/cockpit/stream` verbunden
- **WHEN** ein Trigger ein `NOTIFY` auf dem Ticket-Kanal auslöst
- **THEN** erhält der Client ein SSE-Event mit den geänderten Daten
- **AND** das Poll-Intervall der betroffenen Panel wird nicht abgewartet

#### Scenario: Nicht-push-fähige Quelle bleibt gepollt

- **GIVEN** eine Pod-/CI-Quelle besitzt keine Postgres-Quelle
- **WHEN** das zugehörige Panel aktualisiert wird
- **THEN** erfolgt die Aktualisierung über das bestehende Polling

### Requirement: SDLC-Aktionsknöpfe und Aktions-Inventur

Die vorhandenen, aber nicht exponierten POST-Endpunkte (feature-action, feature-actions,
batch, reorder, reparent, suggest) SHALL im Cockpit erreichbar sein. Jede freigeschaltete
Aktion SHALL in einer Inventur (`docs/sdlc/cockpit-action-inventory.md`) mit
`action-policy.js`-Klassifikation dokumentiert und per BATS-Test auf Erreichbarkeit
belegt werden. Schreibaktionen SHALL in `tickets.cockpit_audit` protokolliert werden.

#### Scenario: Aktion ist freigeschaltet und auditiert

- **GIVEN** eine Admin-Session ist aktiv und die Aktion "feature-action" ist freigeschaltet
- **WHEN** die Aktion über das Cockpit ausgelöst wird
- **THEN** wird der POST-Endpunkt erfolgreich aufgerufen
- **AND** der Vorgang erscheint im Audit-Log `tickets.cockpit_audit`
- **AND** der BATS-Test `tests/spec/sdlc-cockpit/action-inventory.bats` läuft grün

### Requirement: SDLC pages preserve the requested target across login

SDLC pages that redirect unauthenticated visitors to the login flow SHALL pass the originally
requested path — including its query string — as a `returnTo` parameter, so the visitor returns
to that exact location after authenticating.

#### Scenario: Unauthenticated cockpit request returns to the cockpit

- **GIVEN** a visitor without an admin session
- **WHEN** they request `/sdlc/cockpit?tab=kosten` and complete the OIDC login
- **THEN** they are redirected back to `/sdlc/cockpit?tab=kosten`, not to `/`

#### Scenario: Login page forwards the returnTo parameter

- **GIVEN** a request to `/login?returnTo=/sdlc/app-catalog`
- **WHEN** the login page redirects to the auth endpoint
- **THEN** the `returnTo` value reaches `/api/auth/login` and is stored for the OIDC state

#### Scenario: A hostile returnTo still falls back safely

- **GIVEN** a `returnTo` value pointing at a foreign origin
- **WHEN** the OIDC callback resolves the redirect target
- **THEN** the existing fail-closed guard discards it and falls back to the safe default

### Requirement: The SDLC build serves a usable root path

In the SDLC build target the site root SHALL redirect to the cockpit instead of returning a
not-found response, so that any fallback redirect ends on a working page.

#### Scenario: Root redirects to the cockpit in the SDLC build

- **GIVEN** an application built with `BUILD_TARGET=sdlc`
- **WHEN** `/` is requested
- **THEN** the response is a redirect to `/sdlc/cockpit`

#### Scenario: Root is unaffected in the production build

- **GIVEN** an application built with `BUILD_TARGET=prod`
- **WHEN** `/` is requested
- **THEN** the request is handled by the regular start page, with no added redirect

### Requirement: The build target is observable at runtime

The website container image SHALL expose its build target as a runtime environment variable, so
that request-time logic can distinguish the SDLC build from the production build.

#### Scenario: The running container reports its build target

- **GIVEN** an image built with the `BUILD_TARGET=sdlc` build argument
- **WHEN** the environment of the running container is inspected
- **THEN** `BUILD_TARGET` is present and set to `sdlc`

### Requirement: Command Bar — Persistentes Status-Band

The system SHALL render a persistent Command Bar at the top of the SDLC Cockpit that remains visible regardless of the active view mode. The Command Bar SHALL display cluster health status, watchdog state, active agent count, slot usage, pending PR count, and the next factory tick countdown. It SHALL also host the Overview/Fokus mode toggle.

#### Scenario: Command Bar is always visible

- **GIVEN** the SDLC Cockpit page is loaded
- **WHEN** any view mode (Overview or Fokus) is active
- **THEN** the Command Bar is rendered and visible at the top of the page
- **AND** it displays at minimum: cluster health indicator, active agent count, and slot usage

#### Scenario: Cluster health is derived from k3d status

- **GIVEN** the local k3d cluster `mentolder-dev` is running
- **WHEN** the Command Bar fetches cluster status
- **THEN** it shows a green indicator with the cluster name
- **AND** when the cluster is unreachable, it shows a red indicator with an error message

#### Scenario: Overview/Fokus toggle switches the main area

- **GIVEN** the Command Bar is rendered with the Overview mode active
- **WHEN** the user clicks the Fokus toggle
- **THEN** the main area switches to Fokus mode
- **AND** the toggle state is reflected in the URL as a query parameter

### Requirement: Overview-Modus — Lifecycle-Status auf einen Blick

The system SHALL provide an Overview mode that aggregates the status of all SDLC lifecycle phases into a single dashboard view. Each phase SHALL display its ticket count by status. The view SHALL also show an Attention section aggregating blocked tickets, stuck tickets (idle > 30 minutes), and active cooldowns. A PR section SHALL list open pull requests with their CI status.

#### Scenario: All phases are displayed with counts

- **GIVEN** tickets exist in various lifecycle phases
- **WHEN** the Overview mode is active
- **THEN** each phase (Triage, Planung, Bauen, Review, Deploy, Ship) is shown
- **AND** each phase displays the count of tickets in that phase
- **AND** phases with zero tickets are still visible

#### Scenario: Attention section highlights blockers

- **GIVEN** tickets T003120 is blocked and T003119 is stuck (idle > 45min)
- **WHEN** the Overview mode is active
- **THEN** the Attention section shows both tickets
- **AND** blocked tickets are visually distinct from stuck tickets
- **AND** a cooldown on any provider is shown if active

#### Scenario: PR section lists open pull requests

- **GIVEN** open pull requests exist on GitHub for the repository
- **WHEN** the Overview mode is active
- **THEN** the PR section lists them with title, branch, and CI status

### Requirement: Fokus-Modus — Drilldown in eine SDLC-Phase

The system SHALL provide a Fokus mode that drills into a single SDLC lifecycle phase, rendering the content relevant to that phase. The phase selection SHALL be reflected in the URL. The Fokus mode SHALL reuse existing Svelte components where applicable (FactoryFloor for Bauen, PlanningOffice for Planung).

#### Scenario: Fokus mode renders the selected phase content

- **GIVEN** the Fokus mode is active and the "Bauen" phase is selected
- **WHEN** the view is rendered
- **THEN** the FactoryFloor component is displayed as the main content
- **AND** the URL carries `?mode=fokus&phase=bauen`

#### Scenario: Switching phases in Fokus mode updates content and URL

- **GIVEN** Fokus mode is active showing the "Planung" phase
- **WHEN** the user selects the "Bauen" phase
- **THEN** the main content switches to FactoryFloor
- **AND** the URL updates to reflect the new phase

### Requirement: Kontext-sensitive lebendige Rail

The system SHALL render a rail (sidebar) whose content adapts to the active mode and phase. In Overview mode, the rail SHALL show aggregated Attention data, running Epics, active Agents, and Model health. In Fokus mode, the rail SHALL show context-relevant data for the active phase (e.g., Factory status in Bauen, DoR scores in Planung, trace data in Insights). All rail content SHALL be populated from live data sources via the adapter, not from static HTML.

#### Scenario: Rail content changes with mode

- **GIVEN** the Overview mode is active
- **WHEN** the rail is rendered
- **THEN** it shows sections for Attention, Epics, Agents, and Models
- **AND** all sections contain live data (not static text)

#### Scenario: Rail content adapts to Fokus phase

- **GIVEN** Fokus mode is active and "Bauen" phase is selected
- **WHEN** the rail is rendered
- **THEN** it shows Factory-relevant data: slot usage, active workpieces, agent logs
- **AND** when switching to "Planung" phase, it shows DoR scores and queue depth

### Requirement: Unified Panel System

The system SHALL render all panels (rail panels and workspace panels) through a single panel system that supports both the legacy Kit panel runtime and Svelte components as first-class panel types. The PipelinePanel wrapper component SHALL be removed. A Svelte component SHALL be registrable as a panel without needing a protective wrapper.

#### Scenario: Svelte components are registered as native panels

- **GIVEN** a Svelte component (e.g., FactoryFloor) is registered as a panel
- **WHEN** the panel system initializes
- **THEN** the component is mounted into the panel frame without a PipelinePanel wrapper
- **AND** the panel's lifecycle (refresh, resize, destroy) works correctly

#### Scenario: The Panel.run() method no longer adopts the Svelte area

- **GIVEN** the panel system is initialized
- **WHEN** `Panel.run()` scans the DOM for `[data-panel-type]` elements
- **THEN** it does not clear the content of Svelte-registered panels
- **AND** Svelte panels are registered before the auto-initialization scan

### Requirement: Insights-Tab mit Trace-Recording

The system SHALL provide an Insights area accessible from both Overview and Fokus modes. The Insights area SHALL display meaningful metrics (not the previous bloated analytics KPIs) and SHALL record agent decision traces, factory run results, and partial plan outcomes for downstream finetuning use.

#### Scenario: Insights area is accessible from the Command Bar

- **GIVEN** the Command Bar is rendered
- **WHEN** the user clicks the Insights button
- **THEN** the Insights area is displayed
- **AND** it shows metrics that are computed from actual data (not the old Throughput/Heatmap/ShippedBar components)

#### Scenario: Trace recording captures agent actions

- **GIVEN** the factory executes a partial plan
- **WHEN** the execution completes
- **THEN** the outcome is recorded as a trace entry
- **AND** the trace entry includes: agent model, ticket ID, phase, duration, and result

### Requirement: Wählbare Default-Ansicht

The system SHALL allow the user to set their preferred default view (Overview or a specific Fokus phase) and SHALL persist this preference in localStorage. The preference SHALL be applied on page load.

#### Scenario: Default view preference is persisted

- **GIVEN** the user sets their default view to "Planung" phase in Fokus mode
- **WHEN** the page is reloaded
- **THEN** the Cockpit opens with the "Planung" phase active
- **AND** the preference is stored in localStorage under a versioned key

#### Scenario: Unknown or missing preference falls back to Overview

- **GIVEN** no default view preference is stored, or the stored value is corrupt
- **WHEN** the page is loaded
- **THEN** the Overview mode is displayed

### Requirement: Mobile Bottom-Sheet + Swipe-Navigation

The system SHALL render the phase navigation as a bottom sheet on mobile viewports. Users SHALL be able to swipe between Overview and Fokus phase views. Non-reversible actions SHALL be locked by default on mobile as per the existing session-lock requirement.

#### Scenario: Mobile renders bottom sheet for phase navigation

- **GIVEN** the viewport width is below 768px
- **WHEN** the Cockpit is loaded
- **THEN** the phase navigation is rendered as a bottom sheet
- **AND** the Command Bar remains visible as a top bar

#### Scenario: Swipe navigation between views

- **GIVEN** the mobile view is showing the Overview
- **WHEN** the user swipes left
- **THEN** the next Fokus phase is displayed
- **AND** the URL updates to reflect the transition

## Kind-Verteilung

| Kind | Ticket | Status |
|------|--------|--------|
| K1 — Lavish Design-Kit & Panel-Kontrakt | T002460 | in_progress |
| K2 — Daten-Adapter & lokaler Daemon | T002461 | triage |
| K3 — Layout-Engine | T002462 | triage |
| K4 — Steuerung & Audit | T002463 | triage |
| K5 — Epic-Canvas & Planungs-Workflow | T002464 | triage |
| K6 — Brain-Anbindung | T002465 | triage |
| K7 — Admin-Migration | T002466 | triage |
| K8 — Agentische Headed-Tests | T002467 | triage |
| K9 — Kunst-/Stil-Datenbank | T002468 | triage |

## Architektur-Entscheidungen

Siehe `openspec/changes/sdlc-cockpit-design/design.md`, Abschnitt „Getroffene Entscheidungen" (E1–E22).

<!-- merged from change delta sdlc-cockpit.md (1254cd25f840) -->

<!-- merged from change delta sdlc-cockpit.md (b6e25230b17f) -->

<!-- merged from change delta sdlc-cockpit.md (e5ed300c324d) -->

<!-- merged from change delta sdlc-cockpit.md (f4d7a9a21214) -->

<!-- merged from change delta sdlc-cockpit.md (b9d982706e30) -->

<!-- merged from change delta sdlc-cockpit.md (41f2ef3a944b) -->

<!-- merged from change delta sdlc-cockpit.md (ecfc078568b6) -->

<!-- merged from change delta sdlc-cockpit.md (82b4e0107bd4) -->

<!-- merged from change delta sdlc-cockpit.md (700f2c93e213) -->

<!-- merged from change delta sdlc-cockpit.md (9bc4ca2a2822) -->

<!-- merged from change delta sdlc-cockpit.md (369b02c00994) -->

<!-- merged from change delta sdlc-cockpit.md (3366ddaa30a0) -->

<!-- merged from change delta sdlc-cockpit.md (85c295f2204e) -->

<!-- merged from change delta sdlc-cockpit.md (eb6290a87806) -->

<!-- merged from change delta sdlc-cockpit.md (f8f2f1855906) -->

<!-- merged from change delta sdlc-cockpit.md (b6143e719691) -->

<!-- merged from change delta sdlc-cockpit.md (e03d378ccb4b) -->