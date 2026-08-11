# T002827: Pre-push hook rejects valid push due to stale scope commits

## Ziel
Der Pre-Push-Hook lehnt gültige Pushs nicht mehr ab, weil stale Scope-Commits aus einem rebased Main-Branch fälschlich als aktuelle Änderungen gewertet werden.

## Tasks

### 1. Scope-Berechnung fixen
- [x] `git rev-list origin/main..HEAD` statt `git log` für Scope-Detection
- [x] Nicht-ancestor-Commits aus der Scope-Berechnung ausschließen

### Verify
- [x] Push nach Rebase auf main wird akzeptiert
- [x] Tatsächlich scope-fremde Commits werden weiterhin abgelehnt
