# Proposal: factory-parallel-status

## Why

T002074 (PR #3100) hat die parallele Partialplan-Pipeline geliefert — Gang-Scheduling über
`tickets.tickets.slot_count`, Partials und den Bonsai-Provider — aber der End-to-End-Nachweis
fehlt: Es gibt noch keinen echten 3-Partial-Durchstich, der Gang-Claim und die drei
Bonsai-Subagenten gemeinsam auslöst. Dieses bewusst kleine, synthetische Feature ist das
Proof-Vehikel. Es dogfoodet die neue zweistufige Plan-Phase (Decompose → paralleler Fan-out)
und wird mit `--partials 3` gestaget, sodass der Gang-Scheduler beim Execute alle drei Slots
gemeinsam claimt. Zusätzlich hat es operativen Wert: Der Gang-Zustand wird erstmals in der
Admin-UI sichtbar, und Operatoren erhalten einen „Force next tick"-Knopf mit Countdown, statt
auf den periodischen Cron-Poll zu warten.

## What

Drei disjunkte Surfaces, geschnitten als drei Partials (P1/P2/P3):

- **P1 — Backend/Trigger:** Admin-guardeter `GET /api/factory/parallel-status` (aggregierter
  Gang-Zustand aus `tickets.tickets`), Admin-guardeter `POST /api/factory/force-tick` (schreibt
  `factory_control`-Flag `force-tick-requested`), pure Ableitungslogik in `lib/parallel-status.ts`,
  und `scripts/factory/wakeup.sh` konsumiert das Flag + schreibt `last-tick-at`.
- **P2 — UI:** Neuer Tab `parallel` inline in `DevStatusTabs.svelte` (Panel + Countdown-Timer
  auf `nextTickAt`, „Force next tick"-Button), Tab-Wiring in `admin/pipeline.astro`.
- **P3 — Tests:** vitest gegen die pure Logik (`lib/parallel-status.test.ts`) und ein
  STRUCT2-Failing-Test in `tests/spec/software-factory.bats` für die bislang ungetestete
  `slot_count`/`claim-gang`-Gang-Logik und das Force-Tick-Flag-Handling in `wakeup.sh`.

Design-Detail (Datenfluss, Aggregat-Query, Fehlerbehandlung, YAGNI-Grenzen): siehe `design.md`.

_Ticket: T002079_
