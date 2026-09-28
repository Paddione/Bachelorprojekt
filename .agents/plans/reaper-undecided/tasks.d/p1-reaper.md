# p1 — branch-reaper.sh

Target files: `scripts/branch-reaper.sh`.

### Task 1: Fetch-Fehler sichtbar

`git fetch` nicht mehr mit `2>/dev/null || true` schlucken: bei Fehler eine WARN-Zeile mit der
ersten Fehlerzeile nach stderr, Lauf geht weiter (ls-remote ist die Live-Quelle).

### Task 2: Tip gegen ls-remote pruefen

Pro Kandidat den Live-SHA aus der ls-remote-Antwort nehmen. Fehlt der lokale Tracking-Ref oder
weicht er ab: gezielt `git fetch <remote> <branch>` versuchen; danach weiter abweichend →
`KEEP <branch> — Remote-Ref lokal nicht aktuell`, als nicht entscheidbar zaehlen.

### Task 3: Schlusszeile

gh-Fehler-KEEPs und Task-2-KEEPs zaehlen. Bei >0 lautet die Schlusszeile
`… N Branch(es) nicht entscheidbar (gh-/Ref-Fehler), Lauf wiederholen` — auch im Leer-Fall statt
`keine verwaisten Branches gefunden`. Exit-Code unveraendert.
