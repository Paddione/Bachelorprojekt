---
ticket_id: T006303
plan_ref: null
status: active
domains: [factory, scripts, tests]
date: 2026-08-15
---

# Proposal: factory-docker-info-timeout

## Why

Am 2026-08-15 hing der Factory-Tick (00:11) ~1h am Kindprozess `docker info` fest
(ELAPSED 58:20 gemessen): der Docker-Daemon antwortete nicht, während
`/var/run/docker.sock` existierte (Docker-Desktop-in-WSL-Problem). Der Nachfolge-Tick
(01:13) wäre an derselben Stelle hängen geblieben und hätte die Queue (3 wartende
Tickets) blockiert. Der Vorfall ist beendet (Daemon läuft wieder), ABER die
Timeout-Lücke bleibt: `docker info` wird ohne Timeout in
`scripts/factory/sandbox-run.sh` (`resolve_mode`, Z.45) und
`scripts/factory/wakeup.sh` (Sandbox-Preflight, Z.209) aufgerufen — ein erneuter
Daemon-Hänger blockiert den Factory-Tick wieder für unbestimmte Zeit.

**Symptom (beobachtet, Fakt):** Tick hängt am Kindprozess `docker info` (ELAPSED
58:20); Daemon antwortet nicht, Socket existiert.

**Hypothese (Ursache):** `docker info` wird in beiden Backend-Selektionspfaden ohne
Timeout aufgerufen; die Fallback-Kette docker → k8s → off kann bei einem hängenden
Daemon nie erreicht werden. Verifiziert per Quelltext an beiden Aufrufstellen
(T002448-M5: Symptom vs. Hypothese getrennt, Ursache vor Lösungsdesign belegt).

## What

Operator-Entscheidung (ticket-ops 2026-08-15): **dauerhaften Fix umsetzen** —
`timeout 10 docker info` an beiden Stellen, damit ein Daemon-Hänger den Factory-Tick
nie wieder ~1h blockiert. Plus BATS-Guard (semantisch: Exit-Code, kein Format).

1. `scripts/factory/sandbox-run.sh` `resolve_mode`: `if timeout 10 docker info >/dev/null 2>&1`
   — Exit 124 (Timeout) zählt als „Docker nicht verfügbar", Fallback läuft weiter.
2. `scripts/factory/wakeup.sh` Sandbox-Preflight (Z.209): dito.
3. BATS-Guard `tests/spec/software-factory/docker-info-timeout.bats` — behavioral:
   hängender `docker`-Stub + fehlschlagender `kubectl`-Stub, Laufzeit-Semantik
   (Zeitgrenze <20s, Exit-Code, Positiv-Anker) statt Format- oder Quelltext-Anker
   (T002448-M4).
4. SSOT-Delta auf `openspec/specs/software-factory.md`: Docker-Probe der
   Backend-Selektion zeitbegrenzt (10s) — beide Aufrufstellen.

_Ticket: T006303_
