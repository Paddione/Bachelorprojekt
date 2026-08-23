---
title: "spec-atlas P3 — Tests"
ticket_id: T015012
domains: [openspec, tooling]
status: planned
---

# spec-atlas — Implementation Plan (P3 Tests)

_Ticket: T015012 · Partial P3 (tests-Rolle, läuft LETZT), depends_on: P1, P2.
SSOT-Delta-Szenarien: „Archiv ohne .ticket liefert keine Provenance",
„Aktives Delta erzeugt eine In-Flight-Warnung", „Grammatik-Parität" in
`specs/openspec-workflow.md` dieses Changes._

## File Structure

| Datei | Ist | Budget | Notiz |
|---|---|---|---|
| `tests/spec/openspec-workflow/spec-atlas-generator.bats` | neu (0) | kein .bats-Limit in gates.yaml | ~8 Fälle, hermetische Git-Sandbox |
| `tests/spec/openspec-workflow/spec-atlas-grammar-parity.bats` | neu (0) | kein .bats-Limit | ~4 Fälle, Parität Atlas-Lib ↔ merge-Parser |

Neue Testdateien → `task test:inventory` im Verify-Pflicht (CI-Inventar-Check).

## Kontext-Fakten (verifiziert)

- Sandbox-Muster zwingend: beide Scripts ankern REPO an
  `git rev-parse --show-toplevel` vom cwd [T001997] — der Test baut sein eigenes
  git-Repo in `$BATS_TEST_TMPDIR`, kopiert die ECHTEN Skripte hinein (`cp`, kein
  Symlink — Muster: `status-map-fail-closed-guard.bats`, setup()).
- `parseDelta(text)` ist exportiert aus `scripts/openspec-merge.mjs`; Import ist
  seiteneffektfrei (main() via import.meta.url abgesichert, Zeile 229).
- BATS-Runner im Repo: `./tests/unit/lib/bats-core/bin/bats <datei>`.

## Tasks

- [ ] **1. RED — Failing-Test-Step.** Beide Suiten liegen als Skelette mit den
      unten spezifizierten Fällen im Branch; der Lauf geschieht VOR P1/P2:

      ```bash
      export AGENT_LOCK_SID=3487101
      ./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/spec-atlas-generator.bats \
        tests/spec/openspec-workflow/spec-atlas-grammar-parity.bats
      ```

      expected: FAIL — alle 12 Fälle rot (Dateien existieren noch bzw.
      Generator fehlt). Positiv-Anker im Setup: `bats --help` Exit 0, Sandbox-git
      initialisiert.

- [ ] **2. Suite A — Generator-Verhalten** (`spec-atlas-generator.bats`),
      Fixture-Baum je Test frisch in `$BATS_TEST_TMPDIR/sandbox/openspec/...`:
      Specs-Minimum (`# slug`, `## Purpose`, ein `### Requirement:` mit einem
      `#### Scenario:`), component-map-Minimum, groups-Config.

      - **Provenance:** zwei Archive fassen dasselbe Requirement
        (`2026-08-01-old-x` ADDED, `2026-08-20-new-x` MODIFIED, beide `.ticket`)
        → Output listet nur `new-x`-Ticket mit op MODIFIED und Datum 2026-08-20.
      - **Fail-open:** Archiveintrag OHNE `.ticket` → Exit 0, Requirement ohne
        Provenance-Zeile.
      - **In-flight:** aktiver Change `changes/live-one/specs/<slug>.md` mit
        `.ticket T0199999` → Zeile `T0199999 … active` unter `In-flight`.
      - **Determinismus:** zweimal hintereinander laufen lassen, `cmp` bytegleich,
        kein Timestamp-Muster (`20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9]:`) in der
        Ausgabe außer Verzeichnispräfix-Daten.
      - **Reverse-Pfade:** component-map-Eintrag erscheint im `Paths:` des Slugs.
      - **Ungrouped:** Spec ohne Gruppenzuordnung erscheint unter `Ungrouped`.

- [ ] **3. Suite B — Grammatik-Parität** (`spec-atlas-grammar-parity.bats`).
      Node-One-liner über identische Delta-Fixtures (ADDED/MODIFIED/REMOVED/
      RENAMED, je 1–2 Requirements):

      ```bash
      node -e 'const {parseDelta}=await import(process.argv[1]); const {extractDeltaEntries}=await import(process.argv[2]);
               /* JSON-Vergleich beider Extraktionen über dieselbe Fixturedatei */' \
        "$SANDBOX/scripts/openspec-merge.mjs" "$SANDBOX/scripts/openspec-atlas-lib.mjs"
      ```

      - Parität: gleiche {op, name}-Mengen für alle vier Ops.
      - Bindung: `grep -q "openspec-merge.mjs" scripts/openspec-atlas-lib.mjs`
        — die lib MUSS aus dem Merge-Modul importieren (D2), keine lokale Kopie
        der Regexes.

- [ ] **4. Inventar + Gesamt-Gate.**

      ```bash
      export AGENT_LOCK_SID=3487101
      task test:inventory   # components/website/src/data/test-inventory.json mitcommitten!
      ```

## Verify

```bash
export AGENT_LOCK_SID=3487101
task test:changed && task freshness:regenerate && task freshness:check
```
