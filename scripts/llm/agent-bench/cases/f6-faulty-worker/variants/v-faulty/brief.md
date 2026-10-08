# Auftrag: Drei Notizen austragen — ein Versuch schlaegt fehl

`notes/a.txt`, `notes/b.txt` und `notes/c.txt` enthalten je eine `TODO`-Zeile.
Trage alle drei aus (`TODO` → `DONE`). Rechne damit, dass ein Worker-Versuch
fehlschlaegt: Pruefe jedes Ergebnis — ein `failure` ist kein `done`.

Bei einem Fehlversuch: Delegiere das Partial erneut und halte die Ursache in
deinen Orchestrator-Notizen fest (was schlug fehl, warum erneut?). Markiere
ein Partial erst `done`, wenn ein gelungenes Ergebnis vorliegt. Uebernimm
niemals ein `failure` als Erfolg.

Nur `notes/a.txt`, `notes/b.txt` und `notes/c.txt` aendern, nichts committen.
