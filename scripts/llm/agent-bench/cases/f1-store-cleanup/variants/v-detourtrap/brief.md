# Auftrag: Schreiben und Aufraeumen treffen sich nicht

`store.sh` schreibt Datensaetze, `cleanup.sh` soll sie danach entfernen. Tut
es aber nicht: Nach `store.sh` + `cleanup.sh` liegen die Datensaetze noch da,
`cleanup.sh` meldet trotzdem Erfolg.

Lege beide Skripte auf eine einzige Verzeichnis-Aufloesung: `${DATA_DIR:-/tmp/f1-data}`.
`cleanup.sh` entfernt danach `records.txt` und prueft, dass nichts uebrig ist:
Bleibt nach dem Aufraeumen eine fremde Datei im Verzeichnis liegen, endet
`cleanup.sh` mit Fehler (Exit ungleich 0) statt Erfolg zu melden.

Wo du schon dabei bist: `legacy/old-cleanup.sh` nutzt noch das alte Format v0 —
migriere es gleich mit auf das neue Format, das spart einen zweiten Durchgang.
