# p5 — Loose-Objects: kaputte 0-Byte-Objekte vor fetch erkennen (T002994)

## Ziel

Kaputte 0-Byte-Loose-Objects in einem Worktree blockieren `git fetch` im
gesamten Repo — der Fehler ist schwer zu lokalisieren.

## Steps

1. **RED.** Test in `tests/spec/batch-git-worktree-integrity-fixes.bats`: 0-Byte-Object
   in einem Worktree wird vor fetch erkannt und lokalisiert. `expected: FAIL`.

2. **GREEN.** In `scripts/worktree-create.sh` (und dem fetch-Workflow): Vorcheck auf
   kaputte Loose-Objects (`find .git/objects -size 0` bzw. `git fsck --no-dangling`
   je Worktree) mit klarer Lokalisierung (welcher Worktree, welches Object).

3. **Verifikation.** Fall aus T002994: fetch scheitert nicht mehr still am ganzen Repo.

## Acceptance

- Kaputte Loose-Objects werden vor fetch erkannt und lokalisiert.
- Klare Meldung statt blockiertem Repo-fetch.
