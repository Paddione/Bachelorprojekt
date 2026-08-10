# p3 — worktree-write-guard: SID-Besitzmodell für nebenläufige Subagenten (T003131)

## Ziel

Das SID-basierte Besitzmodell des worktree-write-guards unterscheidet nebenläufige
Subagenten EINER Session nicht — die Meldung führt in die Irre (fälschlicher
Besitzkonflikt).

## Steps

1. **RED.** Test in `tests/spec/batch-git-worktree-integrity-fixes.bats`: zwei
   Subagenten derselben Session (verschiedene SIDs, gleiche Session-ID) arbeiten
   im selben Worktree → keine irreführende Besitzmeldung. `expected: FAIL`.

2. **GREEN.** In `scripts/hooks/worktree-write-guard.sh`: Besitzmodell um
   Session-Komponente erweitern — nebenläufige Subagenten derselben Session werden
   als koordiniert erkannt, nicht als Konflikt gemeldet.

3. **Verifikation.** Fall aus T003131: Meldung nennt korrekten Besitzer.

## Acceptance

- Nebenläufige Subagenten einer Session werden nicht als Konflikt gemeldet.
- Fremde Sessions (andere Session-ID) werden weiterhin als Konflikt erkannt.
