---
title: "spec-atlas P1 — Generator-Kern"
ticket_id: T015012
domains: [scripts, dev-tooling]
status: planned
---

# spec-atlas — Implementation Plan (P1 Generator)

_Ticket: T015012 · Partial P1 (implement), hängt von nichts ab. SSOT-Delta:
`specs/openspec-workflow.md` dieses Changes._

## File Structure

| Datei | Ist | Budget | Notiz |
|---|---|---|---|
| `scripts/openspec-atlas-lib.mjs` | neu (0) | 800 (.mjs-Limit, nicht gebaselined) | Zielgröße ~220 Zeilen — Wachstumsreserve bewusst groß gelassen, aber Funktionsumfang fix |
| `scripts/openspec-atlas.sh` | neu (0) | 800 (.sh-Limit, nicht gebaselined) | Dünner Wrapper ~50 Zeilen: REPO-Anker + exec node |
| `scripts/openspec-atlas-groups.yaml` | neu (0) | kein .yaml-Limit in gates.yaml | Kuratierte Top-10-Gruppierung |

Keine der drei Dateien existiert im Repo → keine B1a-Baseline-Kollision.
Taskfile.yml und Tests gehören zu P2/P3 und werden hier NICHT berührt (D1 disjunkt).

## Kontext-Fakten (verifiziert, nicht geraten)

- `scripts/openspec-merge.mjs:28` exportiert `parseDelta(text)`; die Regexes
  (`REQ = /^### Requirement: (.+?)\s*$/`, `SECTION = /^## (ADDED|MODIFIED|
  REMOVED|RENAMED) Requirements\s*$/`) sind dort implementiert. Der CLI-Einstieg
  (Zeile 229) ist via `import.meta.url === pathToFileURL(process.argv[1]).href`
  abgesichert — Import hat keinen Seiteneffekt. **D2: lib importiert parseDelta,
  statt Regexes zu kopieren.**
- Archiv-Verzeichnisnamen tragen ein Datumspräfix (`2026-08-23-<slug>`) — das
  ist die deterministische Touch-Quelle, KEIN Wall-Clock-Timestamp (D3).
- `.ticket` enthält exakt eine Ticket-ID (Muster: `scripts/openspec-status-map.sh`,
  `tr -d '[:space:]'`).
- `openspec/component-map.yaml`: Einträge `- prefix: <pfad>` / `spec: <slug>`;
  Reverse-Mapping = spec → alle prefixes.
- REPO-Anker-Pflicht nach T001997: `git rev-parse --show-toplevel` vom cwd,
  nicht vom Skriptpfad; `OPENSPEC_ROOT` überschreibt `openspec/` (Test-Muster
  `tests/spec/openspec-workflow/status-map-fail-closed-guard.bats`).

## Tasks

- [ ] **1. Parser-Basis in `scripts/openspec-atlas-lib.mjs`.** ESM-Modul mit:

      ```js
      import { parseDelta } from './openspec-merge.mjs';
      export function parseSpecFile(content) { /* slug, purpose-Zeilen,
        Requirements via /^### Requirement: /mg, Scenarios via /^#### Scenario:/mg */ }
      export function loadGroups(yamlPath) { /* flacher Subset:
        "groups:\n  <name>:" + darunter "- <spec-slug>" Einträge, zeilenweise geparst */ }
      export function buildAtlas({ specsDir, componentMapPath, archiveDir, changesDir, groups }) {}
      ```

      buildAtlas sammelt je Slug: reqCount, scenarioCount, lineCount, codePaths
      (Reverse component-map), lastTouches (Map req-name → {ticket, op, date}),
      inflight (Array {reqName, ticket, op}).

- [ ] **2. Provenance-Scan über Archive.** Für jedes Kind von
      `<archiveDir>/`: `.ticket` lesen (fail-open — ohne Datei oder leere Datei
      KEIN Provenance-Eintrag, Exit-Code unberührt); jede Delta-Spec unter
      `<archiv>/specs/*.md` durch `parseDelta()` jagen; je Requirement-Namen den
      Eintrag mit dem lexikografisch größten Verzeichnisnamen (Datumspräfix)
      gewinnen; op aus der Sektion (ADDED/MODIFIED). Touch-Datum = Datumspräfix
      des Verzeichnisses.

- [ ] **3. In-Flight-Scan über aktive Changes.** Gleiches Muster über
      `<changesDir>/*/specs/*.md` (Archive-Verzeichnis ausnehmen), Ticket aus
      `.ticket`, Datum durch `"active"` ersetzen.

- [ ] **4. Markdown-Emitter.** Reihenfolge deterministisch (LC_ALL=C sort):
      Kopfzeile mit Gesamtsummen (Specs/Reqs/Scenarios, aus den gescannten
      Daten berechnet), dann Gruppenabschnitte laut groups.yaml (Reihenfolge =
      YAML-Reihenfolge), innerhalb jeder Gruppe Slugs alphabetisch, Slugs ohne
      Gruppe unter `## Ungrouped`. Je Slug-Block:

      ```markdown
      ### software-factory
      Reqs: 201 · Scenarios: N · Lines: 5562
      Paths: scripts/factory/**, k3d/factory*
      Last touches:
        - Dispatcher-Tick-Execution | T014105 | 2026-08-21 | MODIFIED
      In-flight:
        - Watchdog-Eskalation | T01xxxx | active | MODIFIED
      ```

      Kein Timestamp, kein Zufall: zwei Läufe auf identischem Baum erzeugen
      byteidentische Ausgabe (Freshness-Determinismus-Anforderung, Taskfile.yml
      Kommentar zu Phase 0).

- [ ] **5. CLI + Wrapper.** `main(argv)` mit `--out <pfad>` (default
      `<REPO>/docs/spec-atlas.md`), nur schreiben bei Unterschied zum Bestand
      (verhindert frische mtimes auf unverändertem Inhalt); Guard wie
      `openspec-merge.mjs`: `main()` nur bei direktem Aufruf.
      `scripts/openspec-atlas.sh`: REPO via `git rev-parse --show-toplevel`
      anchorn, `OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"` an node
      durchreichen, `exec node "$REPO/scripts/openspec-atlas-lib.mjs" "$@"`.

- [ ] **6. Erstlauf gegen den echten Baum.**

      ```bash
      export AGENT_LOCK_SID=3487101
      bash scripts/openspec-atlas.sh --out /tmp/opencode/atlas-dryrun.md
      wc -l /tmp/opencode/atlas-dryrun.md && rg -c '^### ' /tmp/opencode/atlas-dryrun.md
      ```

      Positiv-Anker: Anzahl `### `-Abschnitte muss > 0 und ≈ 145 (Slug-Zahl)
      sein; Gesamtsummen müssen mit
      `rg -c '^### Requirement:' openspec/specs/*.md | awk -F: '{s+=$NF} END {print s}'`
      übereinstimmen (2242 zum Planungszeitpunkt).

## Verify

```bash
export AGENT_LOCK_SID=3487101
node scripts/openspec-atlas-lib.mjs --help >/dev/null && echo "lib ok"
task test:changed && task freshness:regenerate && task freshness:check
```

(Structural gates laufen vollständighalber auch hier; das verbindliche
Gesamt-Gate ist der Verify-Task von P3.)
