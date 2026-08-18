# Proposal: finalizer-resolve-worktree-by-branch

## Why

`scripts/devflow-post-merge-finalize.sh` löst den aufzuräumenden Worktree über zwei
Kandidaten auf. Der Slug-Kandidat `.worktrees/<slug>` hat Vorrang und wird **nicht**
gegen den Ziel-Branch validiert; die branch-exakte Auflösung über
`git worktree list --porcelain` läuft nur im `else`-Zweig. Hält der Slug-Pfad einen
fremden Branch, wählt der Finalizer diesen fremden Worktree und Schritt 10 führt
`git worktree remove --force` darauf aus — uncommittete Arbeit einer anderen Session
geht verloren.

Der Skript-Kommentar begründet den Vorrang nicht, sondern widerspricht ihm: Er
beschreibt den Slug-Kandidaten als Rückfall für Worktrees ohne `-T<id>`-Suffix
(„z. B. nach `git worktree move`") und hält fest, dass der Branch den Worktree
eindeutig identifiziert. Die Reihenfolge steht also gegen die eigene Begründung.

Abgrenzung: Der vorangegangene Defekt — Pfad aus dem Slug geraten, sodass
`.worktrees/<slug>-reuse` nach dem Merge liegen blieb — ist mit T008014 (Commit
`cf8eaa6fb`) behoben und gegen diesen Stand verifiziert. Dieser Change adressiert
ausschließlich die verbleibende Vorrang-Reihenfolge.

## What

Die branch-exakte Auflösung wird zur ersten Wahl. Der Slug-Kandidat bleibt als
Rückfall erhalten, greift aber nur noch, wenn er den Ziel-Branch tatsächlich hält.
Ein Worktree, der einen fremden Branch hält, wird nie als Aufräumziel gewählt.

_Ticket: T012240_
