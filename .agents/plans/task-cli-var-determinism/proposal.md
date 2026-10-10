# T901788 — Proposal (WARUM + WAS)

## WARUM

`website:migrate` rendert fail-open: Wird `ENV` ignoriert, läuft die Migration
gegen das falsche Ziel (T901750 hat genau das geschlossen; dieser Bug öffnet es
nicht-deterministisch wieder). Zusätzlich blockiert der Flake CI-Runs zufällig.

## WAS

1. Globale `ENV:`-Definitionen in den 4 includierten Taskfiles entfernen.
2. Task-Level-Defaults (`{{.ENV | default "mentolder"}}`) an allen
   `{{.ENV}}`-Konsumenten dieser Files nachtragen.
3. Gleiche Klasse mitnehmen: `CTX_DEV`-, `NS_DEV`-Doppel,
   `CLUSTER_NAME`-Kollision Root-vs-Include.
4. Failing Tests zuerst (RED): Determinismus-Loop + Duplikat-Guard.
5. `dev-korczewski`-Include-Vars-Verhalten vorher/nachher belegen.
6. Upstream-Issue anlegen (go-task/task) mit Minimal-Repro aus Phase A.

## WAS NICHT

- Kein go-task-Downgrade/Pinning als Fix (ändert die Semantik nicht).
- Kein Refactor unbeteiligter Taskfiles.
- T901789 (port-forward) bleibt separat (Welle 2).
