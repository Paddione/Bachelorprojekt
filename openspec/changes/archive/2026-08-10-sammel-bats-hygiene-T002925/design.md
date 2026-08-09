---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-09
---

# Design: sammel-bats-hygiene-T002925

## Root-Cause-Analyse (Brainstorming-Ergebnis)

### Symptom vs. Hypothese (T002448-M5-Trennung)

| Ticket | Symptom (beobachtet) | Hypothese (Ursache) | Verifiziert? |
|---|---|---|---|
| T002834 | `spec-tracked-file-guard` meldet vier veränderte Dateien nach dem Spec-Lauf im CI-Shard 2 | `task agent-guide:maps` schreibt direkt in die getrackten Pfade unter `docs/agent-guide/maps/`, statt in ein Tempdir zu emittieren und zu vergleichen | Ja — mtime-Probe (siehe Reproduktion in `proposal.md`) bestätigt den Schreibzugriff unabhängig vom `git diff`-Ergebnis |
| T002850 | `not ok … T002579: die Endpunkt-Pruefung erkennt HTTP 500 als NICHT verfuegbar` im CI-Lauf 31299608462, Shard 4/4, isoliert reproduzierbar grün | Festes `sleep 1` zwischen Serverstart und Probe reicht unter CPU-Kontention (parallele `bats -j`-Shards) nicht bis zum `bind()` | Teilweise — Code-Inspektion bestätigt das fehlende aktive Warten; das tatsächliche Kippen unter Last wurde nicht künstlich erzwungen (siehe Randbedingung unten) |

### Gemeinsame Wurzel

Beide Tests verletzen dieselbe Erwartung an eine Assertion, die CLAUDE.md mit der
Positiv-Anker-Pflicht (T002356-M1) eigentlich absichert: **eine Assertion soll ausschließlich
über die geprüfte Sache entscheiden.** Bricht sie stattdessen aus einem Grund, der mit der
Sache nichts zu tun hat — hier: Testmechanik-Nebeneffekt statt inhaltlicher Defekt —, dann
verliert der Anker seinen Zweck. Ein Anker, der aus dem falschen Grund kippt (oder aus dem
falschen Grund grün bleibt), ist schlimmer als keiner, weil er Vertrauen in eine Prüfung
erzeugt, die faktisch nicht stattfindet.

Die Ausprägung unterscheidet sich:
- T002834: der Nebeneffekt ist **räumlich** — der Testlauf mutiert getrackte Dateien im
  Arbeitsbaum.
- T002850: der Nebeneffekt ist **zeitlich** — der Testlauf hängt an einer festen Wartezeit,
  die unter Last nicht reicht.

### Fix-Ansatz

- **T002834:** `scripts/agent-guide/emit-maps.mjs` (bzw. der `task agent-guide:maps`-Aufruf im
  Test) bekommt einen Tempdir-Ausgabepfad. Der Test vergleicht die frisch generierten Karten
  im Tempdir gegen die getrackten Dateien (`diff -u` oder äquivalent), statt die Emitter-CLI
  direkt gegen die Repo-Pfade laufen zu lassen. Die getrackten Dateien bleiben unangetastet.
- **T002850:** Der feste `sleep 1` wird durch eine aktive Warteschleife ersetzt, die auf
  beide Ports (`port_ok`, `port_500`) via `/dev/tcp/127.0.0.1/<port>` pollt, mit kurzer
  Schrittweite und einer Obergrenze (z. B. 50 × 0.1 s = 5 s), bevor die eigentliche Probe
  läuft. Reicht die Obergrenze nicht, schlägt der Test mit einer klaren Zeitüberschreitungs-
  Meldung fehl statt mit einem irreführenden „HTTP 200 wurde als nicht verfügbar gewertet".

### Betroffene Subsysteme

- `scripts/agent-guide/emit-maps.mjs` und/oder `Taskfile`-Ziel `agent-guide:maps`
  (Ausgabepfad-Parameter)
- `tests/spec/agent-roster.bats` (Test P4.5)
- `tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats` (dritter `@test`-Block)

### Edge Cases

- T002834-Fix darf die **Freshness-Aussage** selbst nicht verändern: der Test muss weiterhin
  rot werden, wenn die Karten tatsächlich veraltet sind (Inhalt weicht ab) — nur der
  Seiteneffekt auf den getrackten Pfad entfällt.
- T002850-Fix muss auch den Negativ-Fall (Port bindet nie, z. B. weil `python3` fehlschlägt)
  mit einer klaren Timeout-Meldung statt eines endlosen Wartens abfangen.
- Beide Fixes ändern nichts an der öffentlich sichtbaren Aussage der Tests (Freshness- bzw.
  Health-Erkennung) — nur an der Mechanik, mit der die Tests zu ihrer Aussage kommen.

### Randbedingung — T002850 künstlich reproduzieren

Der Flake selbst (nicht nur der Code-Defekt) ließe sich mit `stress-ng --cpu $(nproc)` parallel
zum Testlauf erzwingen. Das wurde in dieser Planungsrunde nicht durchgeführt (das Ticket nennt
es ausdrücklich als optionale Gegenprobe, nicht als Voraussetzung) — isoliert lief der Test
grün, was laut Ticket erwartungsgemäß ist und nichts widerlegt. Der Code-Befund (fester
`sleep` ohne Polling) ist der eigentliche Beleg und wurde direkt am Quelltext bestätigt.

## Out of Scope (siehe proposal.md)

T002878-Dokumentation, T002922, T002723 — siehe proposal.md.

_Ticket: T002925_
