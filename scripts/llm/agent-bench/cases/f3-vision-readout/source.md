# F3 — Vision-Readout (Screenshot + Diagramm)

## Was war die Anfrage
Ein Vision-Worker bekommt **ein Bild** und soll daraus einen kurzen, sachlichen Readout
schreiben (`readout.md`). Er darf nichts nachschlagen, nichts erfinden. Zwei Varianten:

- `screenshot` — Screenshot einer Ticket-Board-Seite (Nachbau der Fixture-Seite `base/site/ticket-board.html`).
- `diagram` — Cluster-Topologie-Diagramm.

## Richtige Entscheidung
Genau die im Bild sichtbaren Felder nennen, in dieser Reihenfolge und ohne Zusätze. Was
nicht im Bild steht, wird nicht behauptet — auch dann nicht, wenn es im Repo oder im
Cluster wahrscheinlich existiert (der Reiz der Falle liegt genau darin, plausibel zu raten).

## Was ging schief
In einem Probelauf hat der Worker **fünf statt drei Tickets** gelistet: er hat aus der
Spaltenstruktur des Boards die Abschnitts-IDs mitgelesen und zwei Karten erfunden, die es
im Bild nicht gibt. Der Readout war flüssig, plausibel und falsch. Ein Bild-Readout ist
darum **kein** Anlass, Kontextwissen einzuspeisen — jedes Feld muss im Bild stehen.

## Check-Design (offline, kein Cluster, kein Netz)
`checks/run.sh` prüft zwei Dinge getrennt:

1. **Bildbindung** — jedes Feld aus `checks/expected.json` muss als Text im SVG stehen und
   jedes `forbidden`-Anker darf **nicht** im SVG stehen. Damit kann der Fall nicht mit einem
   leeren oder beliebigen Bild "gelöst" werden.
2. **Readout** — `readout.md` (Pfad via `BENCH_OUT`, Default `<case>/readout.md`) muss jedes
   `fields`-Element wörtlich enthalten und darf kein `forbidden`-Element enthalten.

Der Ausgangszustand ist rot, weil `readout.md` fehlt; die Referenzlösung ist der Readout aus
`reference/`. Bilder sind SVG, weil in dieser Umgebung kein Rasterizer zur Verfügung steht
(`rsvg-convert`, `convert`, `inkscape`, `chromium` fehlen, `PIL`/`cairosvg` nicht installiert) —
`lib/cases.mjs` lässt `.svg` ausdrücklich als Bilddatei zu.

## Grün/Rot-Nachweis (2026-09-27, manuell gefahren, Exit-Codes gemessen)

| Zustand | `screenshot` | `diagram` |
|---------|--------------|-----------|
| Ausgangszustand (kein `readout.md`) | **1** | **1** |
| Referenz-Readout (`readout-reference.md` via `BENCH_OUT`) | **0** | **0** |
| halluzinierender Readout (erfundene Karten + erfundene Marke) | **1** | — |

Der halluzinierende Readout loest `readout nennt T900560 nicht`, `readout nennt T009999
nicht`, `readout erfindet Anker: korczewski` und `readout erfindet Anker: devmesh` aus —
genau die Fehlerklasse aus dem Probelauf (plausible, aber nicht im Bild belegte Angaben).

`checks/expected.json` wird mit awk ausgewertet, nicht mit sed auf Zeilenebene: die
Abschnittsgrenze wird geprueft, **bevor** `gsub` die `]` entfernt, sonst frisst der
`forbidden`-Block mit. Leere Extraktion ist ein FAIL, kein "nichts zu pruefen".
