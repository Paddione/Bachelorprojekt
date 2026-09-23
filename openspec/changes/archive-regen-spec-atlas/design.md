# Design: archive-regen-spec-atlas

_Ticket: T900341_

**D1 — Gleicher Block, gleiche Regeln wie die Status-Map.** Der Atlas wird direkt nach
`openspec-status-map.sh` erzeugt und gestagt. Bedingung (`OPENSPEC_ROOT` leer oder gleich
`$REPO/openspec`) und Fehlerverhalten (`set -euo pipefail`, kein `|| true`) uebernimmt er von dort
(T006371: ein still ausgefallenes Regenerieren ist schlimmer als ein Abbruch). Im Fixture-Zweig
(`OPENSPEC_ROOT` zeigt woanders hin) bleibt der Atlas best-effort wie die Status-Map.

**D2 — Kein allgemeines `task freshness:regenerate` im Archiv.** Das wuerde rund 20 Generatoren
laufen lassen, darunter Node-Builds, und das Archiv um Minuten verlangsamen. Nur die beiden
Artefakte, die aus `openspec/` abgeleitet sind, gehoeren zum Archiv-Vorgang.

**D3 — Test vergleicht gegen eine frische Generierung.** Der Atlas listet offene Deltas schon vor
dem Archiv als In-Flight; ein Substring-Test waere vakuos. Geprueft wird: Datei nach dem Archiv ==
`openspec-atlas.sh --out <tmp>` auf demselben Baum.
