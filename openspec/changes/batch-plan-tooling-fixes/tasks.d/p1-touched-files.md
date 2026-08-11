# p1 — plan-touched-files: Branch-Diff nur als Ergänzung, nie als Quelle (T003619)

## Ziel

`scripts/plan-touched-files.sh` (T002765, Zeile ~63-75) mischt den `git diff` des
aktuellen Branches gegen den Merge-Base in die Kandidatenliste, BEVOR die
plan-abgeleitete Liste gefiltert und auf Leere geprüft wird. Auf `main` ist der Diff
leer → Test „T002446: leere File-Structure meldet auf stderr und blockiert nicht"
grün; auf einem Feature-Branch mit eigenen Commits liefert der Diff Dateien → stdout
gefüllt → stderr bleibt leer → Test rot. Der Diff-Beitrag ist als ERGÄNZUNG zu
plan-genannten Pfaden gedacht (Kollisionserkennung für unerwähnte, real geänderte
Dateien, T002765) — nicht als Quelle, wenn der Plan nichts nennt.

## Steps

1. **RED.** Neuen Test in `tests/spec/software-factory/stage-plan-touched-files.bats`:
   leere File-Structure (`Keine Dateien — reine Cluster-Operation.`) + Vorbedingung
   „Branch-Diff gegen Merge-Base ist nicht leer" (sonst `skip` — auf main vakuos).
   Erwartung: exit 0, stderr-Warnung, stdout LEER. Auf diesem Feature-Branch füllt der
   alte Code stdout → Test rot. `expected: FAIL`.

2. **GREEN.** In `scripts/plan-touched-files.sh` den [T002765]-Block (git merge-base /
   git diff --name-only) HINTER die Kandidaten-Filterung verschieben und an die
   Bedingung `out[]` nicht leer koppeln:
   - Existiert der Diff gegen `origin/main` und ist `out[]` nicht leer → Diff-Dateien
     ergänzen, über `seen` deduplizieren (getrackte Dateien übernehmen).
   - Ist `out[]` leer → bestehende WARN + exit 0, der Diff-Block läuft gar nicht erst.

3. **Verifikation.** Fall aus T003619: Fixture „leere File-Structure" liefert auf
   einem Branch MIT Diff leeres stdout + stderr-Warnung + exit 0. Fall aus T002765
   bleibt erhalten: Plan nennt Pfad A, Branch-Diff enthält B → touched_files enthält
   A und B.

## Acceptance

- „T002446: leere File-Structure" ist auf Feature-Branches grün (stdout leer,
  stderr-Warnung, exit 0).
- T002765-Ergänzung bleibt: bei Plänen MIT ableitbaren Pfaden fließen real geänderte
  Dateien des Branches weiterhin in touched_files ein (dedupliziert).
- Kein Verhalten auf `main` ändert sich (dort war der Diff bereits leer).
