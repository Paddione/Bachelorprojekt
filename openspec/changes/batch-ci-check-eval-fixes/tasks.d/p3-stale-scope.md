# p3 — Pre-push: stale scope commits von rebased main (T002827)

## Ziel

Der Pre-push-Hook lehnt einen validen Push ab, weil stale Scope-Commits von einem
rebased main im Branch liegen (fremde Ticket-Referenzen im Scope-Check).

## Steps

1. **RED.** Test in `tests/spec/batch-ci-check-eval-fixes.bats`: Push nach Rebase mit
   fremden, inzwischen gemergten Scope-Commits wird akzeptiert. `expected: FAIL`.

2. **GREEN.** In `scripts/pre-push-hook.sh`: Scope-Prüfung gegen den Branch-Diff zur
   merge-base (nicht gegen den gesamten Branch-Verlauf) — stale Scope-Commits aus
   rebased main zählen nicht mehr. Gemergte/verwaiste Referenzen ignorieren.

3. **Verifikation.** Fall aus T002827: valid Push nach Rebase wird akzeptiert.

## Acceptance

- Push nach Rebase mit stale Scope-Commits wird akzeptiert.
- Scope-Prüfung nutzt merge-base statt Gesamtverlauf.
