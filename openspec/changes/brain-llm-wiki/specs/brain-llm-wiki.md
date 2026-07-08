## Purpose

Der `brain-llm-wiki`-Spec definiert drei Changes des Epics **brain-llm-wiki**
(Ticket T001566): den Merge-Hook (Auto-Re-Ingest bei Main-Merge), den MCP-Server
(Query-Zugriff aufs Wiki) und die Gekko-Inbox (Content-Kanal). Alle Changes setzen
auf der `brain-foundation` (Change 1–3) auf.

## ADDED Requirements

### Requirement: REQ-BRAIN-WIKI-001 — Merge-Hook kopiert geänderte .md-Dateien

The merge-hook SHALL copy changed Markdown files from source directories into the
brain repo's `raw/` target, preserving the relative directory structure. It SHALL
generate a `.manifest.json` with a UTC timestamp on each run. Non-`.md` files SHALL
be silently skipped.

#### Scenario: Geänderte Markdown-Datei wird nach raw/ kopiert

- **GIVEN** a source directory containing `test-spec.md`
- **WHEN** the merge-hook runs with source and target arguments
- **THEN** `test-spec.md` appears in the target `raw/` directory
- **AND** the exit code is 0

#### Scenario: Verzeichnisstruktur bleibt erhalten

- **GIVEN** a source directory with a `sub/` subdirectory containing `nested.md`
- **WHEN** the merge-hook runs
- **THEN** `sub/nested.md` exists in the target

#### Scenario: Nicht-.md-Dateien werden ignoriert

- **GIVEN** a source directory containing `data.bin`
- **WHEN** the merge-hook runs
- **THEN** `data.bin` does NOT appear in the target

### Requirement: REQ-BRAIN-WIKI-002 — MCP-Server mit brain://-Ressource

The MCP server SHALL serve `brain://wiki/<slug>` resources (returning page content as
JSON with frontmatter + body) and SHALL support a `--search` flag that finds pages by
full-text match. Missing pages SHALL return a non-zero exit code.

#### Scenario: brain://-Ressource gibt Seiteninhalt zurück

- **GIVEN** a wiki directory containing `test-note.md` with content "test content"
- **WHEN** the MCP server is called with `--resource "brain://wiki/test-note"`
- **THEN** the output contains "test content" and exits 0

#### Scenario: Suche findet Seiten per Textmatch

- **GIVEN** a wiki directory containing `test-note.md`
- **WHEN** the MCP server is called with `--search "test"`
- **THEN** the output contains "test-note"

### Requirement: REQ-BRAIN-WIKI-003 — Gekko-Inbox legt Wiki-Seiten an

The inbox script SHALL create a new wiki page from a Markdown input file, generating
frontmatter with `type: note` and deriving the slug from the filename. It SHALL reject
missing source files with a non-zero exit.

#### Scenario: Neue Seite aus Datei anlegen

- **GIVEN** an input file `new-note.md` with content
- **WHEN** the inbox script runs with `--title "My New Note" --tags test,gekko`
- **THEN** a new file `new-note.md` is created in the wiki directory
- **AND** it contains a `type: note` frontmatter entry

#### Scenario: Fehlende Quelldatei wird abgelehnt

- **GIVEN** a non-existent source file path
- **WHEN** the inbox script runs
- **THEN** it exits non-zero with an error message
