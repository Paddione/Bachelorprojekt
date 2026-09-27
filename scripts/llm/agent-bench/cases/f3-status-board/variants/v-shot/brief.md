# Auftrag: Status-Board lesen

Das Bild zeigt ein Status-Board: eine Kopfleiste und darunter 4 Spalten mal
3 Zeilen farbiger Zellen (gruen = ok, rot = Stoerung).

Antworte ausschliesslich als JSON `{"fields": {...}}` mit genau diesen
Feldern (Werte als Text, kleingeschrieben):

- `red_cells`: Anzahl der roten Zellen
- `header`: Farbe der Kopfleiste
