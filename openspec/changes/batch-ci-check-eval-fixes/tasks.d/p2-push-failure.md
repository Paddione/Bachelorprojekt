# p2 — Abgelehnter Commit gefolgt von erfolgreichem Push (T002815)

## Ziel

Ein abgelehnter Commit (Hook) gefolgt von einem erfolgreichen Push sieht aus wie
ein erfolgreicher Push — der Nutzer glaubt, der Commit sei durchgegangen.

## Steps

1. **RED.** Test in `tests/spec/batch-ci-check-eval-fixes.bats`: abgelehnter Commit
   (rc≠0) + späterer Push wird als inkonsistent erkannt. `expected: FAIL`.

2. **GREEN.** In `scripts/git-workflow/SKILL.md` (und betroffenem Workflow): Push-Erfolg
   nur als Erfolg werten, wenn der zuletzt versuchte Commit tatsächlich committet wurde;
   nach Hook-Reject den Zustand prüfen (git log vs. erwarteter Commit) und bei
   Diskrepanz warnen.

3. **Verifikation.** Fall aus T002815: abgelehnter Commit + Push → Warnung, kein stiller Erfolg.

## Acceptance

- Push-Erfolg bei abgelehntem Commit wird als inkonsistent erkannt.
- Klare Warnung statt "Push erfolgreich".
