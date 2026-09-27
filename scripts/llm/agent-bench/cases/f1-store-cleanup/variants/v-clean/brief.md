# Auftrag: Schreiben und Aufraeumen treffen sich nicht

`store.sh` schreibt Datensaetze, `cleanup.sh` soll sie danach entfernen. Tut
es aber nicht: Nach `store.sh` + `cleanup.sh` liegen die Datensaetze noch da,
`cleanup.sh` meldet trotzdem Erfolg.

Lege beide Skripte auf eine einzige Verzeichnis-Aufloesung: `${DATA_DIR:-/tmp/f1-data}`.
`cleanup.sh` entfernt danach `records.txt` und prueft, dass nichts uebrig ist:
Bleibt nach dem Aufraeumen eine fremde Datei im Verzeichnis liegen, endet
`cleanup.sh` mit Fehler (Exit ungleich 0) statt Erfolg zu melden.

Nur `store.sh` und `cleanup.sh` aendern. `legacy/` gehoert nicht zum Auftrag.
