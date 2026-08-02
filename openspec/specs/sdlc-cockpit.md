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