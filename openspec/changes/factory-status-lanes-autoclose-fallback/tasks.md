---
title: "factory-status-lanes-autoclose-fallback — Implementation Plan"
ticket_id: T015960
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-status-lanes-autoclose-fallback — Implementation Plan

_Ticket: T015960_

## File Structure

```
scripts/factory/queue.sh                                  # Fix 1: status in SELECT
scripts/factory/mcp-go/main.go                            # Fix 1: countByStatus + Warnung bei fehlendem Feld
scripts/factory/mcp-go/main_test.go                       # Fix 1: Go-Unit-Tests (mit/ohne status)
scripts/factory/auto-close-merged.sh                      # Fix 2: extract_ticket_id_from_branch-Fallback
tests/spec/software-factory/autoclose-branch-fallback.bats  # Fix 2: BATS RED→GREEN
openspec/changes/factory-status-lanes-autoclose-fallback/   # dieser Change (proposal, delta, tasks)
components/website/src/data/test-inventory.json            # regen (freshness gate)
docs/code-quality/repo-index.json                          # regen (freshness gate)
```

## Verify (RED → GREEN)

### Fix 1 — Lane-Counts (queue.sh + countByStatus)

- [ ] **Failing-Test-Step (RED).** Go-Unit-Test schreiben, der `countByStatus`
      gegen eine Queue-JSON-Zeile MIT `status`-Feld läuft und die korrekte
      Lane-Zählung assertet; Gegenprobe: Zeile OHNE `status` → Warnung +
      Unknown-Bucket statt stummer 0. Vor dem queue.sh-Fix schlägt der
      End-to-End-Anteil fehl.

```bash
cd scripts/factory/mcp-go && go test ./... -run TestCountByStatus -v
# expected: FAIL (red — main.go zählt ohne status-Feld alles nach unknown/null)
```

- [ ] **Fix-Step (GREEN).** `status` in die SELECT-Liste von `queue.sh`
      aufnehmen; `countByStatus` so ergänzen, dass ein fehlendes Feld eine
      Warnung auf stderr schreibt und die Row in einen Unknown-Bucket zählt.
      Beide Tests müssen jetzt passieren.

```bash
bash scripts/factory/queue.sh | jq '[.[] | has("status")] | all'
cd scripts/factory/mcp-go && go test ./... -run TestCountByStatus -v
# expected: PASS (green) — has("status") = true für alle Rows
```

### Fix 2 — Auto-Close Branch-Suffix-Fallback

- [ ] **Failing-Test-Step (RED).** BATS-Test
      `tests/spec/software-factory/autoclose-branch-fallback.bats`:
      (a) PR-Titel ohne `[T……]` + Branch `-T015919` → Kandidat T015919 wird
      abgeleitet und durch den Identity-Guard-Pfad geführt;
      (b) weder Titel noch Branch liefern eine ID → lauter Skip mit beiden
      erschöpften Quellen. Der Test muss am aktuellen Stand fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/autoclose-branch-fallback.bats
# expected: FAIL (red — Fallback existiert noch nicht)
```

- [ ] **Fix-Step (GREEN).** `extract_ticket_id_from_branch` in
      `auto-close-merged.sh` implementieren (Regex `-T[0-9]{6}$` auf dem
      Head-Branch, nur wenn `extract_ticket_ids_from_title` leer bleibt);
      Skip-Diagnostik um beide Quellenangaben erweitern.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/autoclose-branch-fallback.bats
# expected: PASS (green)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Notes

- Soft-Konflikt areas=factory mit T015668/T015669/T015820 ist bewusst
  akzeptiert (User-Freigabe 2026-08-24): touched_files sind disjunkt
  (queue.sh/mcp-go/auto-close vs. ticket.sh vs. conflict-check.sh).
- Der Identity-Guard wird NICHT verändert — der Fallback speist nur den
  Kandidaten-Pfad, die Anker-Prüfung (T015005-Schutz) bleibt vor jedem Write.
