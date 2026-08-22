---
title: "brain-ingest-stale-branch-T013041 — Implementation Plan"
ticket_id: T013041
domains: [scripts]
status: completed
file_locks: [scripts/brain-ingest.sh]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-ingest-stale-branch-T013041 — Implementation Plan

_Ticket: T013041_

## File Structure

```
scripts/brain-ingest.sh   # MODIFY — Branch-Preparation, Staleness-Gate, Push-Fehlerbehandlung
```

## Kontext (verifiziert 2026-08-22)

- Befallene Stelle: Zeile 202–207 (`Preparing brain repo branch`):
  `origin/$BRANCH` wird als Base bevorzugt, sobald vorhanden → stale Base (362 Commits hinter main).
- Folge: PR #11 in `Paddione/brain` ist dirty (1.252 Dateien Diff, 249 Löschungen);
  der generierte Commit wurde gepusht, aber bewusst NICHT gemergt.
- Sekundär: fehlgeschlagener Push → `WARN` + `exit 0` (Zeile 611–614) maskiert den Fehler.

## Tasks

### 1. Branch-Preparation: immer von origin/main

Ersetze den If/Else-Block (Zeile ~203–207) durch:

```sh
git fetch origin 2>/dev/null || true
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  git checkout -B "$BRANCH" origin/main
else
  git checkout -B "$BRANCH" main
fi
```

Begründung: Der Ingest ist ein Full-Regeneration-Modell (wiki/-Baum wird pro Lauf neu
geschrieben und als einzelner Commit geliefert) — die Historie des alten Delivery-Branches
trägt keinen Wert, nur den Stale-Base-Risiko. Ein frischer Branch von `origin/main` ergibt
einen sauberen PR-Diff.

### 2. Staleness-Gate vor Delivery

Direkt vor dem `git push` (Zeile ~611) einfügen:

```sh
# Staleness-Gate [T013041]: main darf waehrend der Generierung nicht gewandert sein.
git fetch origin 2>/dev/null || true
BASE_AT_START=$(git rev-parse "$BRANCH"~1 2>/dev/null || git rev-parse HEAD~1)
MAIN_NOW=$(git rev-parse origin/main 2>/dev/null || echo "")
if [ -n "$MAIN_NOW" ] && [ "$BASE_AT_START" != "$MAIN_NOW" ]; then
  echo "WARN: origin/main moved during generation — rebasing generated commit onto new main"
  if ! git rebase origin/main; then
    echo "ERROR: rebase onto new origin/main failed — manual resolution required"; exit 1
  fi
fi
```

Der generierte Commit berührt nur `wiki/` + `index.md`; ein Rebase schlägt nur fehl, wenn
main dieselben Pfade geändert hat — dann ist Abbruch (nicht Merge eines halben Baums) die
richtige Reaktion.

### 3. Push-Fehler laut machen

Ersetze die Push-Fehlerbehandlung:

```sh
# ALT:
git push origin "$BRANCH" 2>&1 || {
  echo "WARN: git push failed — manual push required"
  cd "$REPO_ROOT"
  exit 0
}

# NEU:
if ! git push origin "$BRANCH" 2>&1; then
  echo "ERROR: git push failed (non-fast-forward = stale/diverged remote branch) — delivery aborted"
  cd "$REPO_ROOT"
  exit 1
fi
```

Ein abgelehnter Push ist damit das natürliche zweite Gate gegen divergierte Branches.

### 4. Einmalige Remediation des bestehenden Zustands (mit Bestätigung)

⚠ Externe Mutation in `Paddione/brain` — Executor führt dies erst nach expliziter Freigabe aus:

1. Verifizieren, dass PR #11 nie gemergt wurde:
   `gh pr view 11 --repo Paddione/brain --json state,mergedAt` → erwartet `CLOSED|OPEN`, `mergedAt=null`.
2. PR #11 mit Begründung schließen (Verweis auf dieses Ticket).
3. Stale Remote-Branch löschen:
   `git push origin --delete feature/brain-initial-ingest` (im Brain-Repo).
   Der generierte Commit geht dabei verloren — er war dirty und nie gemergt; der nächste
   Ingest-Lauf regeneriert ihn sauber von main.
4. Probe: `bash scripts/brain-ingest.sh --pilot 3` (oder äquivalenter Trockenlauf) →
   Branch startet bei origin/main, Push erzeugt frischen sauberen PR-Diff.

### 5. Validierung & Merge

- `bash -n scripts/brain-ingest.sh` (Syntax).
- Shellcheck falls verfügbar: `shellcheck scripts/brain-ingest.sh` (bestehende Findings im
  Umfeld der Änderung dürfen nicht neu entstehen).
- PR-Titel: `fix(scripts): brain-ingest fresh branch base + staleness gate [T013041]`.
