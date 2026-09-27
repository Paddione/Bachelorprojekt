# f3-status-board — Quelle

Stilvorlage: das Cockpit aus `2026-09-23-cockpit-fixes` (Status-Uebersicht mit
farbigen Zellen, Pipeline-Flussdiagramm). Die Bilder sind generierte Fixtures
im Stil solcher Boards — keine Screenshots, keine echten Personendaten, keine
echten Messwerte. Was zaehlt, ist die Lesefaehigkeit: Anzahlen und Farben
exakt ablesen, nichts erfinden.

Anfrage (sinngemaess): "Wie ist der Stand — was ist rot, was ist fertig?"
Richtige Entscheidung: Exakt ablesen (3 rote Zellen, blauer Kopf / 4
Schritte, 1 fertig). Schiefgegangen (Negativklasse): Elemente erfinden, die
nicht im Bild sind (Personen, Fehlermeldungen, rote Boxen im Diagramm) —
dafuer gibt es die forbidden-Liste.

Rot/Gruen-Nachweis: Vision-Faelle haben keine run.sh — die Pruefung ist der
Feldvergleich gegen `checks/expected.json` (exakt nach Trim/Lowercase) plus
`hallucinated_element` je forbidden-Treffer. Die Bilder sind deterministisch
erzeugt (`node gen/mkvision.cjs` in diesem Fallverzeichnis, nur
Node-Standardbibliothek); der Selbst-Check des Generators zaehlt die
Farbpixel (Board: 3 rote Zellen, blauer Kopf; Diagramm: 4 Schritte, 1 gruen).
