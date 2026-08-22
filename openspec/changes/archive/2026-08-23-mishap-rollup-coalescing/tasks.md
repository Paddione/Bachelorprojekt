---
title: "mishap-rollup-coalescing — Implementation Plan"
ticket_id: T013915
domains: [factory]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-coalescing — Implementation Plan

_Ticket: T013915 · Proposal: `openspec/changes/mishap-rollup-coalescing/proposal.md` · Design: `openspec/changes/mishap-rollup-coalescing/design.md`_

Der Rollup-Generator stagte Container ab dem ersten Eintrag — am 2026-08-22 entstanden so
18 Container in 40 Minuten und die Factory lief auf Slot-Kollision fest. Das Coalescing-Gate
hält Container unter der Schwelle (3 Einträge / 24 h, per Env übersteuerbar) im Collect Mode:
der Generator beendet den Lauf vor der Worktree-Anlage mit Exit 0, Flusher und Carry-over
verwenden denselben Container weiter.

## File Structure

```
scripts/factory/mishap-rollup.sh                          (mod — Coalescing-Gate nach BATCH_COUNT, vor Worktree-Anlage)
tests/spec/mishap-rollup/rollup-coalescing.bats           (neu — Statement-Verifikation des Gates, liegt bereits rot vor)
openspec/changes/mishap-rollup-coalescing/specs/mishap-rollup.md (mod — ADDED Requirement mit vier Scenarios)
```

S1-Budget: `scripts/factory/mishap-rollup.sh` Ist 464 · Limit 800 (.sh) · nicht baselined →
Budget 336 Zeilen. Die Gate-Ergänzung (~25 Zeilen) bleibt weit darunter; ein Split ist nicht
nötig.

## Tasks

### 1. Coalescing-Gate in scripts/factory/mishap-rollup.sh implementieren

**Voraussetzung — Failing Test liegt rot vor (expected: FAIL):**

```bash
cd .worktrees/mishap-rollup-coalescing
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/rollup-coalescing.bats
# expected: FAIL — 4/4 Tests schlagen fehl, die Gate-Marker existieren noch nicht
```

Umsetzung:

1. Direkt vor der `BATCH_COUNT`-Ermittlung die Env-Defaults definieren:

   ```bash
   ROLLUP_MIN_ENTRIES="${ROLLUP_MIN_ENTRIES:-3}"
   ROLLUP_MAX_AGE_H="${ROLLUP_MAX_AGE_H:-24}"
   ```

2. Nach der `BATCH_COUNT`-Ermittlung und vor dem `# ── Worktree-Management`-Block das Gate
   einfügen:

   - Altersmessung: `min(c.created_at)` der Batch-Kommentare des Containers, eigene kleine
     SQL-Abfrage über `factory_psql` (analog zum bestehenden `COMMENTS_FILE`-Read, Filter
     `body NOT LIKE 'FACTORY-PLAN-REF%'`). Leere Antwort (Abfragefehler) zählt als
     „Alter nicht ermittelbar" und behandelt den Alters-Zweig konservativ — das Gate blockt
     nur, wenn **beide** Bedingungen (unter Eintrags-Schwelle UND jünger als Max-Alter)
     nachweislich zutreffen. Ist die Altersmessung fehlgeschlagen, läuft der bestehende
     Staging-Pfad unverändert (Fail-open, keine Container-Leiche).
   - Bedingung: `BATCH_COUNT -lt ROLLUP_MIN_ENTRIES` UND ältester Eintrag jünger als
     `ROLLUP_MAX_AGE_H` Stunden → Meldung mit den Messwerten (Einträge, Alter) und dem
     Wortlaut „sammelt weiter" nach stderr, dann `exit 0` — vor der Worktree-Anlage, ohne
     `stage-plan`.

3. Gate so platzieren, dass Eskalation (T013305), Carry-over und Watchlist-Injection
   unverändert davor laufen; der bestehende `BATCH_COUNT = 0`-No-op bleibt dahinter
   unangetastet.

Kontrolle: `git -C .worktrees/mishap-rollup-coalescing diff --stat` zeigt genau die eine
Produktionsdatei; `bash -n scripts/factory/mishap-rollup.sh` ist sauber.

### 2. Failing Test grün machen

```bash
cd .worktrees/mishap-rollup-coalescing
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/rollup-coalescing.bats
# expected: PASS — 4/4 (Env-Defaults, Gate vor Worktree-Anlage, No-op-Pfad, min(created_at))
```

Wenn ein Test rot bleibt: Marker im Skript gegen die Testfälle abgleichen — die Tests pinnen
die wörtlichen Marker (`:-3}`, `:-24}`, „sammelt weiter", `min(c.created_at)`). Nach Grün den
bestehenden Mishap-Rollup-Spez-Testsatz mitlaufen lassen, damit das Gate keine bestehende
Erwartung bricht:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/
# expected: PASS — bestehende Rollup-Tests unverändert grün
```

## Verify

```bash
cd .worktrees/mishap-rollup-coalescing
task test:changed          # BATS-Suite des geänderten Spektrums grün
task freshness:regenerate  # openspec-status + test-inventory regenerieren (Inventory enthält die neue .bats)
task freshness:check       # Ratchet: kein Baseline-/Inventar-Drift
bash scripts/plan-lint.sh openspec/changes/mishap-rollup-coalescing/tasks.md   # plan-lint PASS
bash scripts/openspec.sh validate mishap-rollup-coalescing                     # OpenSpec-Delta valide
```
