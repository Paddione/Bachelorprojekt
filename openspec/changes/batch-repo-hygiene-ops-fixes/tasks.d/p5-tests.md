# p5 — BATS-Tests für die Batch-Fixes (Tests-Rolle)

<!-- S1-Budget: tests/spec/batch-repo-hygiene-ops-fixes.bats — neue Datei (Ist 284, kein S1-Gate) -->

## Ziel

Ein gemeinsamer BATS-Test-Suite-Datei deckt die Fixes p1-p4 ab. Diese Partial
ist die Tests-Rolle — IMMER zuletzt, nach allen Implementierungs-Partials.

## Ist-Stand (nach Teil-Implementierung c8e68ba97)

`tests/spec/batch-repo-hygiene-ops-fixes.bats` (284 Zeilen, 10 Testblöcke) existiert.
Messung am 2026-08-11: **9/10 grün, Test 10 ROT** — Test 10 deckt den in p4
dokumentierten pipefail-Abbruch auf (Cron stirbt bei leerem non-main-Bestand).

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes.bats
# expected: FAIL — Test 10 (cron tick_vorcheck) ist ROT, bis p4 Step 2 (pipefail-Fix)
# implementiert ist. Die übrigen 9 Tests sind durch die Teil-Implementierung grün
# (Ist-Messung 2026-08-11: 9 ok / 1 not ok).
```

## Steps

1. **Sammel-Testdatei (vorhanden, bei Bedarf nachziehen).**
   `tests/spec/batch-repo-hygiene-ops-fixes.bats` mit je einem Testblock pro Defekt:
   - `reaper sweep`: --sweep ohne --ticket listet ALLE Remote-Heads (REAP/KEEP)
   - `reaper empty`: leeres Ergebnis unterscheidbar von Fehlschlag
   - `gone prune order`: [gone]-Ref aus Reaper-Delete wird aufgeräumt (Runbook-Textvertrag)
   - `merge tree probe`: Konfliktprobe ohne Working-Tree-Mutation, Phantomkonflikt = ok
   - `cancelled not fail`: cancelled-Jobs ≠ failure
   - `headsha filter`: fremde head-SHAs + conclusion="" nicht als Fehler
   - `tick vorcheck`: tick_running=true überspringt Worktree-Sektion (Test 10 —
     derzeit ROT wegen pipefail-Abbruch in `scripts/repo-hygiene-cron.sh`)

2. **Delta-Spec-Finalisierung.** `openspec/changes/batch-repo-hygiene-ops-fixes/specs/*.md`
   gegen die implementierten Anforderungen abgleichen (ADDED/MODIFIED korrekt).

3. **Verifikation (Pflicht-Gates, in dieser Partial verankert).**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle 10 Testblöcke grün (inkl. Test 10 nach dem p4-pipefail-Fix).
- Kein vakues Bestehen (jeder Defekt hat echten Negativ- und Positiv-Pfad).
