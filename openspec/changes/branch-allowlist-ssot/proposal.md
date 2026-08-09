# Proposal: branch-allowlist-ssot

## Why

Die Regel, welche Branches von der Ticket-ID-Pflicht befreit sind, ist an drei Stellen unabhängig
kodiert: `scripts/worktree-create.sh` (Zeile 49) führt eine Allowlist, `.githooks/pre-commit`
(Zeile 130) und `.githooks/pre-push` (Zeile 144) führen je eigene `case`-Muster. Die Listen sind
auseinandergelaufen.

Konkrete Folge: `chore/mishap-incident-rollup` ist per Konstruktion ticketlos und persistent — so
in `.claude/skills/mishap-tracker/SKILL.md` festgeschrieben. `worktree-create.sh` lässt ihn durch,
`pre-commit` blockiert ihn. Damit kann `scripts/factory/mishap-rollup.sh` seinen Plan nie
committen: er erzeugt ihn, lintet ihn erfolgreich und verwirft ihn. Die gesamte Mishap-Auswertung
endet blind, und zwar nicht erst seit dem aktuellen Lauf — im Rollup-Worktree lagen bereits zwei
staged, nie committete Plan-Dateien aus einem früheren Versuch.

Abgrenzung: T002783 (PR #3911) hat den vorigen Blocker derselben Kette behoben, nicht diesen.

## What

- Neue Datei `scripts/lib/branch-allowlist.sh` als einzige Quelle: `TICKETLESS_BRANCHES` plus
  `branch_is_ticketless()` mit exaktem Namensvergleich (kein Glob — ein Tippfehler soll keine
  ganze Präfix-Klasse befreien).
- `.githooks/pre-commit`, `.githooks/pre-push` und `scripts/worktree-create.sh` lesen diese Quelle,
  statt eigene Listen zu führen. Fehlt die Datei, bleibt die Allowlist leer und die Guards
  verhalten sich wie bisher — degradiert restriktiv, nie permissiv.
- `scripts/factory/mishap-rollup.sh` bricht bei fehlgeschlagenem `git commit`/`git push` mit
  Exit ≠ 0 und sprechender Meldung ab, statt den Plan still liegenzulassen.
- Failing-Test zuerst in `tests/spec/ci-cd/branch-allowlist-ssot.bats`: Positiv-Anker (ein nicht
  gelisteter ticketloser Branch bleibt blockiert), dann die Aussage (der gelistete Branch darf
  committen). Output-Verifikation, kein Quelltext-Grep.

Design und Ursachennachweis: [`design.md`](design.md).

_Ticket: T002817_
