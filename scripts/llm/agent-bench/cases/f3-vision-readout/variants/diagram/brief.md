# Variante diagram — Readout aus dem Topologie-Diagramm

## Auftrag
Lies `checks/topology.svg` (Cluster-Topologie) und schreibe `readout.md`:
aktiver Kontext, Namespace, Brand, Liste der Control-Plane-Nodes und der Worker-Nodes.
Keine Werkzeuge, kein `kubectl`, kein Netz.

## Regeln
- Nur benennen, was im Diagramm beschriftet ist. Die Fussnoten zaehlen als Bildinhalt.
- `base/cluster/topology.md` ist die Fixture-Quelle des Diagramms, **kein** Freifahrtschein:
  dort steht eine eingefrorene Marke, die das Diagramm bewusst nicht als aktive Node zeigt.
  Sie zu nennen, ist derselbe Fehler wie das Erfinden einer Karte in `screenshot`.
- `checks/expected.json` ist Referenz des Checks, nicht Teil des Auftrags.
