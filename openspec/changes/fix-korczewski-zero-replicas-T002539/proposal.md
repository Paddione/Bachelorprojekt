# Proposal: fix-korczewski-zero-replicas-T002539

## Why

korczewski.de liefert 503 "no available server". Die Root-Cause liegt in
`flux/clusters/fleet/ks-korczewski.yaml:10-12`: Die Kustomization ist seit
2026-07-23 bewusst suspendiert (`suspend: true`, T002479), alle Workloads auf
0/0 Replicas skaliert (Kosteneinsparung).

Das ist **intentional, korrekt und dokumentiert** — allerdings nur im Flux-Manifest,
nicht in den für Agents sichtbaren Referenzen. CLAUDE.md behauptet fälschlich
"Both brands at 26/26 pods". Ein Aufruf von korczewski.de landet im Nichts.

## What

1. **CLAUDE.md korrigieren:** Die falsche Angabe "Both brands at 26/26 pods" durch
   den dokumentierten Zustand ersetzen (korczewski suspendiert, 0 Pods).
2. **AGENTS.md ergänzen:** Einen sichtbaren Hinweis auf die Suspension in die
   Architecture-Sektion aufnehmen, damit kein Agent mehr fälschlich von einem
   laufenden korczewski ausgeht.
3. **Website-Fallback:** Wenn korczewski.de 503 liefert, soll stattdessen eine
   statische Wartungsseite oder ein Redirect auf mentolder.de ausgeliefert werden.
4. **Health-Check:** `task workspace:health` soll die Suspension als bewussten
   Zustand erkennen und nicht als Fehler melden.

_Ticket: T002539_
