# p4 — Urteile im Kontaktbogen

Ziel: die Urteile werden sichtbar, ohne dass jemand eine JSON-Datei öffnen muss. Betroffen:
`tests/e2e/lib/build-gallery.mjs`.

## Aufgaben

- [x] **Urteilsdatei einlesen, wenn vorhanden.** `vision-<viewport>.json` neben der bestehenden
      Ergebnisdatei. Fehlt sie — der Regelfall, weil die Stufe standardmäßig aus ist —, bleibt
      die Galerie unverändert. Kein Fehler, keine leere Spalte.

- [x] **Befund am Bild markieren.** Kacheln mit `verdict: "suspect"` bekommen eine sichtbare
      Markierung und die Kennungen der Befunde als Text darunter. Kacheln mit `ok` bleiben
      unmarkiert, damit die Markierung etwas bedeutet.

- [x] **Übersprungene und unbrauchbare Zeilen getrennt ausweisen.** `skipped` (kein Endpunkt)
      und `unusable` (Antwort passte nicht zum Schema) sind verschiedene Zustände mit
      verschiedener Abhilfe und dürfen nicht zu „kein Befund" verschmelzen. Genau diese
      Verschmelzung ist der Grund, warum der bisherige Vision-Aufruf jahrelang unbemerkt
      wirkungslos war.

- [x] **Zusammenfassung oben.** Eine Zeile je Brand und Viewport: wie viele Routen beurteilt,
      wie viele auffällig, wie viele übersprungen. Die Zahl der übersprungenen ist die
      wichtigste — steht dort die Gesamtzahl, hat der Lauf nichts gemessen.

## Zeilenlage

`build-gallery.mjs` steht bei 253 von 800 zulässigen Zeilen. Reichlich Reserve.
