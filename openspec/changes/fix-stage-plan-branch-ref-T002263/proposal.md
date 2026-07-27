# Proposal: fix-stage-plan-branch-ref-T002263

## Why

`mcp__ticket-mcp__stage_plan` schlägt aus einem Worktree heraus zuverlässig mit
„Plan file '…' does not exist in git" fehl. Zwei Umstände wirken zusammen:

1. **Der MCP-Server arbeitet immer im Haupt-Checkout.** `findRepoRoot()` in
   `scripts/ticket-mcp/go/internal/runner/run_ticket.go` leitet den Repo-Root aus
   dem Pfad der eigenen Binärdatei ab und landet damit stets bei
   `~/Bachelorprojekt`. `RunTicket` setzt kein `cmd.Dir`, der `bash`-Prozess erbt
   also das Arbeitsverzeichnis des Servers — nie das des aufrufenden Worktrees.
2. **Die Vorprüfung fragt den falschen Ref.** `scripts/vda/ticket/stage-plan.sh`
   prüft `git cat-file -e "HEAD:${plan}"`. Im Haupt-Checkout ist `HEAD` gleich
   `main`, wo ein frisch geplanter Change per Definition noch nicht liegt. Der
   Datei-Fallback `[[ -f "${plan}" ]]` greift ebenfalls nicht, weil er relativ zum
   Haupt-Checkout auflöst.

In der Praxis ist damit der MCP-Pfad für jeden per `dev-flow-plan` erzeugten Plan
unbrauchbar; jede Session weicht auf `bash scripts/ticket.sh stage-plan` aus dem
Worktree aus. Der Fehlertext führt zusätzlich in die Irre — er empfiehlt,
`dev-flow-plan` erneut laufen zu lassen, obwohl der Plan existiert und korrekt
committed ist.

## What

Die Vorprüfung fragt künftig den Branch ab, der ohnehin als Pflichtparameter
`--branch` übergeben wird: `git cat-file -e "${branch}:${plan}"`. Weil Worktrees
sich ein gemeinsames `.git`-Verzeichnis teilen, ist der Branch-Ref auch vom
Haupt-Checkout aus sichtbar — verifiziert am 2026-07-27 gegen einen realen
Worktree-Branch, während `HEAD:<plan>` erwartungsgemäß nicht auflöste.

Die Prüfkette wird damit dreistufig, von speziell nach allgemein:

1. `${branch}:${plan}` — der Worktree-Fall, der heute fehlschlägt.
2. `HEAD:${plan}` — der Aufruf direkt vom Branch aus, bisheriges Verhalten.
3. `[[ -f "${plan}" ]]` — noch nicht committet, lokaler Aufruf.

Ein Plan, den es weder auf dem Branch noch im HEAD noch auf der Platte gibt, wird
weiterhin abgelehnt; die Prüfung wird aufgeweitet, nicht abgeschaltet.

`archive_plan` ist über einen anderen Mechanismus betroffen: `cmd_archive_plan` in
`scripts/ticket.sh` prüft `[[ ! -s "$plan_file" ]]`, also rein im Dateisystem, und
scheitert aus demselben Grund (falsches Arbeitsverzeichnis). Da auch dort
`--branch` ein Pflichtparameter ist, bekommt es denselben Git-Fallback.

**Bewusst nicht Teil dieser Änderung** (Brainstorming 2026-07-27): der
worktree-blinde Go-Runner. Ein `worktree`-Parameter samt `cmd.Dir` wäre
strukturell sauberer und würde die Ursachen-Klasse für alle künftigen Kommandos
beseitigen, verlangt aber eine MCP-Schema-Änderung, einen Rebuild des
eingecheckten Binaries und eine Anpassung aller aufrufenden Skills. Der
Branch-Ref-Fix behebt beide heute betroffenen Kommandos ohne diesen Aufwand. Bleibt
der Runner eine Falle für ein künftiges Kommando, gehört das in ein Folgeticket.

_Ticket: T002263_
