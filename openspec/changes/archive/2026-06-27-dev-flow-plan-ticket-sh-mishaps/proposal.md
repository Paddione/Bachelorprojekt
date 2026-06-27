# Proposal: dev-flow-plan-ticket-sh-mishaps

## Why

Drei zusammengehörige Mishaps aus dem letzten dev-flow-execute-Block
(T001229, T001233, T001211-Slice-1 — alle gebündelt in T001242), die alle
auf dieselbe Vertragslücke zeigen: **`bash scripts/plan-lint.sh` ist ein
hartes Gate, aber seine Anforderungen sind an keiner Stelle eingebettet, die
ein Subagent oder ein Seeder lesen kann, bevor er rät.**

- **M1 (drift, dev-flow-plan):** Der Step-3.7-Subagent-Prompt in
  `.agents/skills/dev-flow-plan/SKILL.md` nennt die plan-lint Hard Rules
  (F1 Frontmatter, STRUCT1/2/3, P1) nicht explizit. Ergebnis: jeder
  frische Plan-Entwurf fällt mit 8 harten Fails durch und braucht eine
  manuelle Korrekturrunde.
- **M2 (drift, dev-flow):** `scripts/openspec.sh` seedet `tasks.md` im
  schlanken OpenSpec-Format (`# Tasks: <slug>` + ein Bullet), während
  `plan-lint.sh` das kombinierte writing-plans-Format erzwingt. Ein
  frisch erzeugter Change braucht 11 harte Fails Reparatur, bevor er
  `apply`-fähig ist.
- **M3 (degraded, scripts/ticket.sh):** `scripts/ticket.sh` schreibt direkt
  via `kubectl exec ... psql` in den Cluster. Wenn der Runner (CI/Agent/
  orte) keinen `kubectl` oder kein Kubeconfig hat, scheitern die
  Schreibpfade mit `FATAL: role '<user>' does not exist` oder
  `_pgpod`-Fehlern. `tickets.ticket_plans` und `factory_phase_events`
  werden stillschweigend nicht geschrieben. `scripts/openspec.sh` hat
  bereits einen `TICKET_OFFLINE=1`-Knopf, `scripts/ticket.sh` nicht.

## What

Drei kleine, lokal wirkende Fixes, die den Vertrag zwischen plan-lint und
seinen Konsumenten (Subagent-Prompt, Seeder, Cluster-Schreiber) explizit
machen:

1. **M1 — Plan-Subagent-Prompt** bekommt einen neuen `plan-lint Hard Rules
   (PFLICHT)`-Bullet, der die F1/F2/STRUCT1/2/3/P1-Regeln wortwörtlich
   auflistet, damit der Subagent sie nicht erraten muss.
2. **M2 — `openspec.sh propose`** seedet eine `tasks.md`, die bereits
   `plan-lint.sh` PASS liefert (YAML-Frontmatter, `# … Implementation Plan`
   H1, `## File Structure`, ein `Verify (RED → GREEN)`-Step mit der
   wortwörtlichen Phrase `expected: FAIL` und den drei mandatory
   `task …`-Commands). Der Plan-Autor füllt nur noch den Body.
3. **M3 — `scripts/ticket.sh`** bekommt einen `_ticket_offline_skip`-
   Helper, der in `TICKET_OFFLINE=1` die 9 Cluster-Write-Subcommands mit
   `OFFLINE: skipped <op> …` + exit 0 überspringt. Reads bleiben weiter
   Cluster-pflichtig.

**Out of scope:**

- Der `DATABASE_URL/Port-forward-Pfad` als Alternative zu OFFLINE ist
  nicht Teil dieses Plans — er gehört in einen separaten Follow-up.
- Der `process`-Enum in `report_mishap` ist bereits in T001211-Slice-1
  abgedeckt (PR #2144).
- Der separate Schema-Bug in `cmd_set_scout_drift` (`column "scout_drift"
  does not exist`) ist NICHT Teil dieses Plans — er wird in einem
  separaten Follow-up adressiert.

**Regression-Schutz:**

- 28 neue BATS-Cases in `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats`
  (3 Gruppen, eine pro Mishap)
- Bestehende `tests/spec/openspec-workflow.bats` und
  `tests/spec/openspec-embedding.bats` müssen grün bleiben
- `bash scripts/openspec.sh validate` muss grün bleiben (kein Regress
  auf existierenden Changes)

_Ticket: T001242_
