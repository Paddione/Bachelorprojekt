# Proposal: post-merge-branch-reaper

## Why

`delete_branch_on_merge=true` steht auf Repo-Ebene, und jeder Merge-Pfad ruft
`gh pr merge --delete-branch`. Trotzdem lagen am 2026-08-01 26 Remote-Branches auf `origin`,
24 davon ohne jeden PR.

Die Ursache ist strukturell: beide Mechanismen greifen nur, wenn der Branch **selbst** gemergt
wird. Plan- und Factory-Branches werden aber regelmäßig über einen Sammel-PR nach `main` geführt —
auf ihrem eigenen Ref findet nie ein Merge-Event statt, also räumt sie niemand ab.

An den 20 manuell gereapten Refs gemessen: 20 der 26 Branches hingen an Tickets mit Status
`done`/`archived`, und 66 von 69 Blob-Abweichungen zu `main` lagen unter `openspec/changes/**`
oder in generierten Pfaden. Genau **eine** echte Quelldatei wich ab
(`tests/spec/t2431-k1-vector-db/verify.bats`), und ihr Ticket stand bereits auf `done · shipped`,
obwohl das Deliverable nie nach `main` kam.

Daraus folgt die Kriterienwahl: „Blob-Diff muss leer sein" hätte 1 von 20 Leichen erfasst und wäre
wirkungslos; „Ticket `done` genügt" hätte alle 20 erfasst, aber auch die einzige Kopie eines nie
gemergten Deliverables gelöscht — leise, im CI, ohne Widerspruch. Tragfähig ist nur die
Kombination beider Signale.

## What

Ein neuer Job `reap-branches` in `.github/workflows/post-merge.yml` ruft
`scripts/branch-reaper.sh` auf. Ein Branch wird gelöscht, wenn alle vier Bedingungen gelten:
er trägt die Ticket-ID des Merge-Commits im Namen, hat keinen offenen PR, sein Ticket steht auf
`done`/`archived`, und jede Blob-Abweichung zu `origin/main` liegt in einer Allowlist von
Plan- und Generat-Pfaden. Trifft eine Bedingung nicht zu, wird der Branch verschont und mit
Begründung in der Job-Summary gemeldet.

Vor jedem Delete sichert der Job den Branch-SHA als `refs/tags/reaped/<branch>` auf `origin` —
gelöschte Branch-Refs sind auf GitHub nicht garantiert wiederherstellbar, Tags überleben.

Die Logik lebt im Skript, nicht im YAML: so ist sie lokal gegen ein Fixture-Repo testbar, aus
`repo-hygiene` heraus manuell aufrufbar und hält den Workflow lesbar.

**Bekannte Grenze:** Der Merge-Trigger erfasst 17 der 20 beobachteten Fälle. Drei Branches tragen
ihre ID in keiner `main`-Commit-Message, weil ihre Arbeit über einen Sammel-PR mit fremder ID kam.
Ein zeitbasierter Sweeper würde das schließen, wurde aber bewusst abgewählt.

_Ticket: T002520_
