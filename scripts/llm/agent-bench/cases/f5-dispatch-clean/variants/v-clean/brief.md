# Auftrag: Drei Notizen parallel austragen

`notes/a.txt`, `notes/b.txt` und `notes/c.txt` enthalten je eine `TODO`-Zeile.
Trage alle drei aus: Ersetze in jeder Datei `TODO` durch `DONE`. Die drei
Dateien sind unabhaengig — keine Reihenfolge noetig, keine Datei gehoert zu
zwei Partials.

Arbeite als Orchestrator mit zwei Worker-Slots: Delegiere jedes Partial an
einen Worker (`dispatch_4b`). Fuehre nichts selbst aus, solange ein Slot frei
ist. Markiere ein Partial erst `done`, wenn sein Ergebnis vorliegt, und
schliesse erst ab, wenn alle drei `done` sind und die Checks gruen sind.

Nur `notes/a.txt`, `notes/b.txt` und `notes/c.txt` aendern, nichts committen.
