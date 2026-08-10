# Proposal: worktree-create-git-op-guard

## Why

`scripts/worktree-create.sh` entfernt einen bereits am Zielpfad liegenden Worktree per
`git worktree remove --force`, ohne vorher zu prüfen, ob dort eine git-Operation offen steht.
Ein Worktree mitten in einem abgebrochenen Rebase — Konflikte aufgelöst und gestaged, nur
`git rebase --continue` fehlt — wird damit stillschweigend vernichtet.

MESSUNG (2026-08-10, gegen Commit `8d77df268`, Wegwerf-Repo via `git init` in `mktemp -d`,
Fixture identisch zu `tests/spec/divergence-guard/worktree-create-git-op-guard.bats`):

```bash
# Worktree in einen aufgelösten, nicht fortgesetzten Rebase fahren, dann:
STATE="$(git -C "$WT" rev-parse --git-path rebase-merge)"   # existiert
( cd "$MAIN" && bash scripts/worktree-create.sh fix/anker-T003215 "$WT" HEAD ); echo "rc=$?"
[ -d "$STATE" ] && echo vorhanden || echo GONE
# beobachtet: rc=0 · GONE
```

Der allowlist-gefilterte Sauberkeits-Vorcheck aus `repo-hygiene-ops.md` §1 kann diesen Zustand
strukturell nicht sehen — Beleg und Reproduktion in T002766
(`tests/spec/agent-skills/worktree-mid-rebase-guard.bats`). T002766 hat `scripts/worktree-git-op-guard.sh`
eingeführt und in `repo-hygiene-ops.md` sowie `dev-flow-plan` eingebunden, den Anlegepfad aber
ausdrücklich außerhalb seines Scopes gelassen.

## What

`worktree-create.sh` prüft den **Zielpfad** vor dem `git worktree remove --force` auf eine
unterbrochene git-Operation und bricht fail-closed mit dem eigenen Exit-Code `5` ab.
`worktree-git-op-guard.sh` bekommt dafür `--worktree <path>` zur Einschränkung auf genau einen
Worktree; sein repo-weites Verhalten bleibt unverändert. Notfall-Umgehung:
`WT_ALLOW_INTERRUPTED_OP=1`.

### Entscheidung: fail-closed am Zielpfad, keine repo-weite Sperre

Das Ticket lässt fail-closed vs. advisory offen. Ausschlaggebend ist der Aufrufer
`scripts/vda/factory-prep.sh:198`:

```bash
if ! bash "${REPO}/scripts/worktree-create.sh" "${branch}" "${wt_path}" "origin/${branch}" >/dev/null 2>&1; then
```

Er verwirft stdout **und** stderr und sieht ausschließlich den Exit-Code. Eine advisory Warnung
wäre dort nachweislich unsichtbar — exakt die Fail-open-Falle, die bei gitleaks
(T002506/T002554) schon einmal jahrelang trug. Der Exit-Code dagegen wird ausgewertet:
factory-prep protokolliert `SKIP reason=worktree_failed`, gibt den Slot frei und stellt den
Ticket-Status auf `plan_staged` zurück. Die Pipeline hält also nicht an, sie überspringt das
Ticket und meldet es — der Preis eines fail-closed Guards ist hier eine Log-Zeile plus Retry,
der Preis eines advisory Guards wäre der unwiederbringliche Verlust einer Konfliktauflösung.

Die Gegenkraft — „ein fremder Worktree darf legitim mitten in einer Operation stehen", die
Begründung für T002766s „melden, nicht stoppen" — bleibt gültig und wird durch die **Skopierung
auf den Zielpfad** bedient, nicht durch Abschwächung des Abbruchs. Repo-weit angewandt legte ein
einzelner hängender Fremd-Worktree jede weitere Anlage still und damit die gesamte Factory; das
wäre die schlechtere Hälfte beider Optionen. Am Zielpfad dagegen will der Aufrufer gerade mit
Arbeit BEGINNEN — dort gibt es keinen legitimen Grund, über einen offenen Rebase hinwegzugehen.

_Ticket: T003215_
