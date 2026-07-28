# Proposal: pr-refresh-T002413

## Why

Bei paralleler Agentenarbeit bleiben Pull Requests als `CONFLICTING` liegen, obwohl ihre
Konflikte lokal trivial auflösbar sind. Messung am 2026-07-28 über acht offene PRs: drei
davon `CONFLICTING`, und die am häufigsten überlappenden Dateien sind generierte Artefakte
(`docs/code-quality/repo-index.json` in vier PRs, `website/src/data/openspec-status.json`
in drei).

Für genau diese Dateien führt `.gitattributes` bereits `merge=ours`, und der lokale
Merge-Treiber ist konfiguriert (`merge.ours.driver=true`). Ein lokaler Rebase löst sie
konfliktfrei auf. **GitHub ignoriert `.gitattributes`-Merge-Treiber jedoch vollständig** —
weder die Mergeability-Berechnung noch Auto-Merge kennen sie. Der Konflikt ist also real
für GitHub und gleichzeitig eine Nicht-Frage lokal.

Das Freshness-Gate zu lockern wäre der naheliegende Gegenentwurf und ist messbar falsch:
Es entspricht dem Zustand vor T002252, als nahezu jeder PR stale Artefakte auf `main`
hinterließ und `freshness-regen.yml` sie per Bot-Commit heilte (21 an einem Tag), was die
Renovate-Abbrüche aus T002249 mitverursacht. Über sieben Tage gemessen: 432 Merges, 61
Bot-Regen-Commits (~14 %). Das Gate wirkt und bleibt unverändert.

## What

Ein neues Werkzeug `scripts/pr-refresh.sh` mit Taskfile-Einsprung `task pr:refresh`, das
einen konfliktbehafteten PR in einem temporären Worktree auf `origin/main` rebased, die
Freshness-Artefakte regeneriert und mit `--force-with-lease` pusht.

Die Guards sind der eigentliche Inhalt: Der Lauf bricht ab, wenn nach dem Rebase Konflikte
in **nicht**-generierten Dateien verbleiben (die gehören von Hand aufgelöst), wenn der
Branch von einer lebenden Session gehalten wird (`agent-lock.sh list`), oder wenn der PR
einem anderen Account gehört. Ein Dry-run-Modus zeigt die geplanten Schritte ohne Mutation.

Die Zugehörigkeit einer Datei zur Kategorie „generiert" wird aus `.gitattributes`
(`linguist-generated=true`) abgeleitet — dieselbe Quelle, die `scripts/filter-generated.sh`
bereits nutzt. Es entsteht keine zweite Pfadliste.

Teil 1 von 3. Teil 2 (Verzeichniskonvention für `tests/spec/`) und Teil 3
(Factory-Conflict-Gate) folgen als eigene Changes; die gemeinsame Design-Spec liegt unter
`docs/superpowers/specs/2026-07-28-pr-conflict-reduction-design.md`.

_Ticket: T002413_
