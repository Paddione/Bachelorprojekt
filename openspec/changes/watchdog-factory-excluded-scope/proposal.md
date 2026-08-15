# Proposal: watchdog-factory-excluded-scope

## Why

Am 2026-08-14 (22:41–22:54 UTC, Timeline T005560) ping-pongte der Status eines manuell
übernommenen Factory-Tickets alle ~5 Minuten zwischen `in_progress` und `plan_staged`:

1. Eine manuelle Session übernahm das Factory-gestagte Ticket (dev-flow-execute,
   Fortsetzungs-Kontrakt T002327) und claimte den Branch-scoped Lock.
2. `scripts/factory/watchdog.sh` (FACTORY_STALE_MIN=0) sah das `in_progress`-Ticket als
   stale an — der Stale-Sweep filtert **nur** auf `type` + `status='in_progress'` +
   `updated_at < now() - STALE_MIN`, ohne jeden Blick auf Locks, Branches oder
   `factory_excluded` — und resettete auf `plan_staged` (plan_ref vorhanden).
3. `queue.sh` dispatcht das Ticket erneut; die Pipeline setzt `in_progress`, scheitert am
   branch-scoped Claim der manuellen Session (T003677: Defer statt Überschreiben) und
   lässt den Status unangetastet.
4. Nächster Tick: wieder stale → Reset → Livelock mit Kommentar-Noise.

Beendet wurde der Livelock erst durch das manuelle Setzen von
`readiness.factory_excluded=true` (`ticket.sh plan-meta set --readiness
factory_excluded=true`). Der Dispatch-Gate in `queue.sh` respektiert das Flag in **beiden**
Lanes ("durable half of `ticket.sh unfactory`") — der Watchdog-Sweep tut das **nicht**:
zwei Systeme, dieselbe Flag-Semantik, unterschiedliche Lesarten.

**Ursache (verifiziert, T002448-M5):** Der Reproducer `FACTORY_STALE_MIN=0 bash
scripts/factory/watchdog.sh --print-stale-query` rendert die Kandidaten-Query ohne
`readiness->>'factory_excluded'`-Filter. Der Stale-Sweep macht eine menschliche
Entscheidung ("Factory fernhalten") innerhalb von Minuten rückgängig.

**Kandidaten aus dem Ticket:** (1) Watchdog-Scope um `factory_excluded=true` verengen;
(2) branch-scoped Claims als Fortschritt werten. **Entscheidung: (1).** Kandidat (2)
hebelt den Kernzweck des Stale-Sweeps aus: Eine hängende Factory-Pipeline hinterlässt
selbst einen branch-scoped Claim (T003677, Label `factory-pipeline`, TTL-Heartbeat 1800s) —
wertete der Sweep Live-Locks als Fortschritt, sähe er genau die hängenden Pipelines nie
mehr, für die er gebaut ist. Zusätzlich hält die manuelle Session bewusst **keinen**
ticket-scoped Lock (T003102), ein Ticket-Lock-Check träfe sie also nicht; und der
Branchname ist nicht stabil aus der `external_id` ableitbar. `factory_excluded` dagegen
ist das bereits dokumentierte, bewährte Escape-Hatch — der Watchdog muss es nur
respektieren.

## What

- `scripts/factory/watchdog.sh`: Die Stale-Query (`_stale_query`) erhält den Filter
  `AND COALESCE((readiness->>'factory_excluded')::boolean, false) = false` — identisch zum
  Gate, das `queue.sh` in beiden Dispatch-Lanes anwendet. Damit deckt die eine
  WHERE-Klausel beide Sweep-Pfade ab (Reset **und** Eskalation/`unfactory`): Ein
  manuell übernommenes Ticket wird weder zurückgesetzt noch unfactored.
- Neuer BATS-Guard `tests/spec/factory-watchdog/factory-excluded-scope.bats`
  (Output-Verifikation über `--print-stale-query`, Positiv-Anker-Konvention T002356-M1):
  rot ohne Fix, grün mit Fix.
- SSOT-Delta `openspec/specs/software-factory.md` (MODIFIED): Requirement
  "Watchdog-Eskalation und Zombie-Cleanup" um die Scope-Regel + Scenario erweitert.
- Prozess-Teil (type=process): Der Fortsetzungs-Kontrakt
  (`.claude/skills/references/factory-resume-contract.md`) dokumentiert den Workaround
  als Vertrag: Manuelle Übernahme eines Factory-gestagten Tickets setzt
  `readiness.factory_excluded=true` — Watchdog und queue.sh respektieren es; ohne das
  Flag pongt der Watchdog gegen die Factory-Pipeline.

_Ticket: T006364_
