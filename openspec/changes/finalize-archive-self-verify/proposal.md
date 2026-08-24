# Proposal: finalize-archive-self-verify

## Why

Der Post-Merge-Archivpfad kann seine Arbeit halb erledigt liegen lassen, und der nächste Lauf
liest diesen Zustand als Erfolg.

**Symptom (beobachtet, nicht angenommen).** Am 2026-08-24 stand Ticket T015168 auf
`status=done, resolution=shipped` (PR #5190 gemergt 2026-08-23T23:33:26Z), während der Change
`db-identity-guard` auf `origin/main` **unarchiviert** war. Die fertige Archivierung lag
ausschließlich als nicht committete Arbeit im Worktree:

```bash
git -C .worktrees/db-identity-guard-T015168 status --porcelain
#  D openspec/changes/db-identity-guard/{.ticket,design.md,proposal.md,specs/…,tasks.md}
#  ?? openspec/changes/archive/2026-08-24-db-identity-guard/
#  ?? openspec/specs/db-identity-guard.md
git ls-tree --name-only origin/main openspec/changes/db-identity-guard/   # alle fünf Dateien noch da
```

**Ursache (belegt, nicht vermutet).** `scripts/devflow-post-merge-finalize.sh` Schritt 8 führt in
einer Subshell nacheinander `openspec.sh archive` (verschiebt `changes/<slug>` nach
`changes/archive/<datum>-<slug>` und mergt das Delta in die SSOT) und erst danach `git commit`
aus. Dazwischen existiert die Verschiebung nur im Arbeitsbaum. Die EXIT-Trap
`_restore_prev_branch` stellt den Branch wieder her, macht die Verschiebung aber **nicht**
rückgängig — und bei hartem Abbruch (Timeout/SIGKILL, real beobachtet im T015293-Lauf:
„Finalize-Script Timeout ohne Output") läuft sie gar nicht erst. Beleg im Fundzustand: der
Worktree stand auf `chore/plan-archive-db-identity-guard-T015168`, also auf `$ARCHIVE_BRANCH` —
der Restore war nicht gelaufen, die Verschiebung schon.

**Warum kein Folgelauf es reparierte.** Die Zuordnung von `ARCHIVE_DIR` prüft ausschließlich, ob
`openspec/changes/$SLUG` noch existiert (`scripts/devflow-post-merge-finalize.sh:373-381`). Nach
dem halben Lauf ist der Ordner verschoben, also greift der `else`-Zweig:

```bash
mark_skip "Schritt 8: Change-Ordner openspec/changes/$SLUG existiert nicht mehr (bereits archiviert?)"
```

Das Fragezeichen ist die ungeprüfte Vermutung. Die **Abwesenheit** des Ordners wird als
Erledigung gelesen, obwohl sie auch der halbe Zustand sein kann. `_archive_already_done` würde
den Irrtum aufdecken, wird in diesem Zweig aber nie aufgerufen, weil `ARCHIVE_DIR` leer bleibt
und der ganze `if [[ -n "${ARCHIVE_DIR:-}" ]]`-Block übersprungen wird. Es ist dieselbe
Signalklasse, die `repo-hygiene-ops.md` §3 als Grundregel führt: eine leere Antwort muss von
einer negativen unterscheidbar sein.

**Warum kein Guard es sah.** `openspec-half-archive-check.sh` bewertet `origin/main`. Dort war
der Change vollständig unarchiviert, also konsistent — der Startup-Hook meldete an genau diesem
Tag grün („kein halb archivierter Change"). Der halbe Zustand lag im Worktree, wohin kein Guard
schaut. Ohne den Hygiene-Lauf wäre die Archivierung mit dem nächsten Worktree-Cleanup verloren
gegangen und der Change hätte dauerhaft als offen gezählt.

Das ist die Deliverable-Drift-Klasse M10/T002506 in ihrer stillen Form: das Ticket behauptet
einen Zustand, den `main` nicht trägt.

## What

Schritt 8 unterscheidet künftig **archiviert** von **halb archiviert** und belegt seinen
Abschluss, statt ihn zu behaupten.

1. **Der `else`-Zweig rät nicht mehr.** Fehlt `changes/<slug>`, wird der Zielzustand geprüft
   (`_archive_already_done`) statt vermutet. Ist er erreicht → `[skip]` wie bisher, nur belegt.
   Ist er es nicht, liegt der halbe Zustand vor.

2. **Resume statt Neustart.** Liegt die Verschiebung uncommittet im Arbeitsbaum vor
   (`changes/<slug>` fehlt UND `changes/archive/<datum>-<slug>` existiert untracked), wird nicht
   erneut archiviert — `openspec.sh archive` verweigert dort ohnehin fail-closed
   („Archivziel existiert bereits" bzw. „no such change") — sondern der vorhandene Zustand
   committet, gepusht und als PR geöffnet.

3. **Abschluss am Positiv-Signal.** Nach der Archiv-Sektion wird belegt, dass der Archiv-Branch
   remote steht **und** ein PR auf ihn existiert. Geprüft wird das positive Signal, nicht die
   Abwesenheit eines Fehlers. Fehlt der Beleg, endet Schritt 8 als Fehler, nicht als `mark_skip`.

4. **Testbarkeit ohne DB.** Die Zustandsbestimmung wird als eigenständiges Subkommando
   `--archive-state <slug>` aufrufbar, das `archived` / `half` / `pending` auf stdout schreibt.
   Damit prüfen die Tests **Kommando-Output** gegen ein Fixture-Repo statt den Quelltext zu
   greppen (`tests/CLAUDE.md`) — die bestehende Source-Grep-Ausnahme in
   `post-merge-finalize-guards.bats` muss für diesen Fix nicht in Anspruch genommen werden.

**Nicht in Scope.** Die Reihenfolge innerhalb der Subshell (erst verschieben, dann committen)
bleibt unverändert; sie atomar zu machen hieße, `openspec.sh archive` umzubauen. Der Fix macht
den entstehenden Zwischenzustand erkennbar und abschließbar, statt ihn zu verhindern.

_Ticket: T015783_
