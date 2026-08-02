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

Das Cockpit organisiert seine Fläche als Fokus-Spalte plus Arbeitsbereich, nicht als
Kachelwand (E3). Der Inhalt der Fokus-Spalte ist festgelegt und nicht konfigurierbar (D7).

The system SHALL organize the cockpit surface as a fixed focus column (rail) plus a free
workspace, and SHALL expose the rail contents as an immutable list of exactly four groups —
running epics, what needs attention, active agents, model servers — with no API, attribute
or stored setting that adds, removes or reorders them.

#### Scenario: Rail groups are fixed and immutable

- **GIVEN** the layout engine is loaded
- **WHEN** a caller reads the rail group list and attempts to mutate it
- **THEN** the list contains exactly the four groups in the order defined by D7
- **AND** the mutation attempt leaves the list unchanged

#### Scenario: Workspace holds cards or one full-surface panel

- **GIVEN** a desktop viewport and four panels assigned to the workspace
- **WHEN** the engine computes the placement
- **THEN** at most three panels are placed as cards and the remainder stays in the catalog
- **AND** when one panel is expanded to full surface, it is the only panel placed

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

Das Admin-Menü SHALL genau einen Eintrag auf die SDLC-Fläche führen, und dieser Eintrag
SHALL auf `/admin/cockpit` zeigen. Ein separater *Pipeline*-Eintrag SHALL nicht mehr
existieren; die Aktiv-Erkennung des Cockpit-Eintrags SHALL die Alt-Pfade `/admin/pipeline`
und `/admin/tickets` mit abdecken.

#### Scenario: Sidebar carries no Pipeline entry

- **GIVEN** the admin sidebar navigation is rendered
- **WHEN** its navigation entries are enumerated
- **THEN** exactly one entry targets `/admin/cockpit`
- **AND** no entry targets `/admin/pipeline`

#### Scenario: Dashboard widget links to the cockpit

- **GIVEN** the admin dashboard at `/admin`
- **WHEN** the pipeline summary widget header link is read
- **THEN** it points at `/admin/cockpit`

### Requirement: Pipeline-Inhalt lebt als Panel im Cockpit

Die Fläche `/admin/cockpit` SHALL den bestehenden `DevStatusTabs`-Baum in einem
Panel-Rahmen rendern, der ausschließlich die geteilte Kit-CSS-Schicht verwendet (E22). Der
Rahmen SHALL kein `data-panel-type` tragen, damit die Panel-Laufzeit ihn nicht adoptiert
und seinen Inhalt überschreibt. Server-seitige Vorbefüllung über `getFloor()` und die
Tab-Vorwahl über den Query-Parameter `tab` SHALL erhalten bleiben.

#### Scenario: Kit runtime does not adopt the Svelte panel

- **GIVEN** the pipeline panel markup is present in the document
- **WHEN** the kit panel runtime performs its auto-initialisation over `[data-panel-type]`
- **THEN** the panel element is not registered in the panel registry
- **AND** the panel body content is left untouched

#### Scenario: Tab pre-selection survives the move

- **GIVEN** a request to `/admin/cockpit?tab=planung`
- **WHEN** the page is rendered
- **THEN** the planning tab is the initially active tab of the pipeline panel

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