---
title: "worktree-real-path-check — Implementation Plan"
ticket_id: T004604
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-real-path-check — Implementation Plan

_Ticket: T004604_

## Why

worktree-create.sh meldete am 2026-08-14 den übergebenen Pfad, während der reale
Worktree unter einem Pfad mit Ticket-ID-Suffix registriert war — die Pfad-Drift-Quelle
aus T003991. Der Batch T004295 (p2) entschärfte die Folge im Lock-Treiber; die stille
Abweichung im create-Pfad bleibt. Fix: realer Pfad wird nach dem Anlegen verifiziert
und bei Abweichung laut gemeldet.

## File Structure

```
scripts/lib/worktree-real-path.sh            — NEU: worktree_real_path() (source-bar, offline-testbar)
scripts/worktree-create.sh                   — Pfad-Verifikation nach dem Anlegen + Warnung
tests/spec/worktree-create-real-path-T004604.bats — BATS (RED, liegt bereits vor)
openspec/changes/worktree-real-path-check/   — proposal + delta (dieses Ticket)
```

## Tasks

### Task 1: Rot-Phase verifizieren (failing Test)

`tests/spec/worktree-create-real-path-T004604.bats` liegt vor (4 Tests, M1/M2 skippen
bis zur lib-Existenz). Rot bestätigen:

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/worktree-create-real-path-T004604.bats`
2. Verify test fails — M3 ("create-Skript warnt bei Abweichung") matcht nicht: das
   Skript kennt weder `worktree_real_path` noch die Abweichungs-Warnung.
3. Verify test fails — M4 ("Abschlussmeldung nennt den realen Pfad") matcht nicht.
4. M1/M2 zeigen `skip` (lib existiert noch nicht) — der Skip verschwindet in der
   Grün-Phase, wenn die lib da ist.

### Task 2: scripts/lib/worktree-real-path.sh anlegen

Neue source-bare lib (Muster `openspec-embed-lib.sh` — sourced only, nie direkt
ausgeführt):

1. Funktion `worktree_real_path <repo-root> <wt-path>`:
   - `git -C "<repo-root>" worktree list --porcelain` parsen.
   - Den `worktree`-Block finden, dessen Pfad exakt `<wt-path>` entspricht;
     `branch refs/heads/<name>` im Block → realen Pfad ausgeben.
   - Wenn der Pfad nicht registriert ist → leere Ausgabe, Exit 0.
   - Kein Repo/Fehler → leere Ausgabe, Exit 0 (fail-open, wie agent-collision).
2. Kein `set -e`-Abbruch bei fehlendem git — Funktion bleibt testbar offline.

### Task 3: worktree-create.sh integrieren

`scripts/worktree-create.sh`, nach dem Checkout (nach Zeile ~420, vor der
Abschlussmeldung):

1. Lib sourcen: `source "$(dirname "$0")/lib/worktree-real-path.sh"`.
2. `REAL_WT="$(worktree_real_path "$(pwd)" "$WT_PATH")"` ermitteln.
3. `[[ -n "$REAL_WT" && "$REAL_WT" != "$WT_PATH" ]]` → stderr-Warnung:
   `worktree-create: realer Worktree-Pfad weicht ab — übergeben: $WT_PATH, registriert: $REAL_WT`
   und Abschlussmeldung (`ready …`) mit `$REAL_WT` statt `$WT_PATH`.
4. Übereinstimmung → bestehende Meldung unverändert (kein Verhaltensbruch).

### Task 4: Grün-Phase — eigenen Testlauf bestehen

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/worktree-create-real-path-T004604.bats`
2. Erwartung: M1/M2 grün (lib existiert), M3/M4 grün (Guard + Meldung vorhanden).
3. Regression:
   - `bash tests/unit/lib/bats-core/bin/bats tests/spec/worktree-divergence-guard-T002387.bats`
   - `task test:changed` — kein neuer Rot-Zustand.

### Task 5: Lint + Freshness + Finale

1. `bash scripts/plan-lint.sh openspec/changes/worktree-real-path-check/tasks.md`
2. `bash scripts/openspec.sh validate`
3. `task freshness:check`
4. Stage-Commit mit `chore(plans):`-Präfix (T001434).
5. Push `fix/worktree-create-suffix-T004604`.

## Verify

1. `task test:changed` — Smart-Selektion grün.
2. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
3. `task freshness:check` — keine uncommitteten generierten Artefakte.
4. `bash scripts/plan-lint.sh openspec/changes/worktree-real-path-check/tasks.md` — FAIL = 0.
5. `bash tests/unit/lib/bats-core/bin/bats tests/spec/worktree-create-real-path-T004604.bats` — 4/4 grün.
6. `stage-plan --hold` erfolgreich (Fix-Pfad).
7. Kein PR aus dem Plan-Stand (T002816).
