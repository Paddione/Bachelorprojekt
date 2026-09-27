# Auftrag: Pipeline-Diagramm lesen

Das Bild zeigt ein Pipeline-Flussdiagramm: Schritte als Kae sten von links
nach rechts, Pfeile dazwischen (grau = ausstehend, gruen = fertig).

Antworte ausschliesslich als JSON `{"fields": {...}}` mit genau diesen
Feldern (Werte als Text, kleingeschrieben):

- `steps`: Anzahl der Schritte (Kae sten) insgesamt
- `done`: Anzahl der fertigen (gruenen) Schritte
