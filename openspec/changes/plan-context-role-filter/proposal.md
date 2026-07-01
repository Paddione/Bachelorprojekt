# Proposal: plan-context-role-filter

## Why

`scripts/plan-context.sh <role> --with-openspec` ist der zentrale Hook, mit dem die
Orchestrator-Session Subagent-Dispatches vorbereitet — die `<role>`-Variable ist im
Usage-String Pflicht, wird aber an keiner Stelle ausgewertet. Die Hauptschleife
(`for proposal_file in "$CHANGES_DIR"/*/proposal.md`) iteriert ungefiltert über
jeden nicht-archivierten Change.

Konsequenz: jeder Subagent bekommt ~17.000 Zeilen Output in seinen Kontext
geschoben, davon >90 % für seine konkrete Rolle irrelevant. Das verschwendet das
Kontext-Budget, lenkt die Aufmerksamkeit des Modells auf nicht-zugehörige Pläne,
und produziert (in T001374 M3 dokumentiert) Halluzinationen die auf einen
"passend gemachten" aber falschen Plan verweisen.

## What

**Fix in `scripts/plan-context.sh`** — das Skript filtert Change-Proposals nach
Schnittmenge zwischen `proposal.md`-Frontmatter `domains: [...]` und einer
hartkodierten Role→Domains-Lookup-Tabelle. Die Lookup-Tabelle spiegelt die
Agent-Routing-Tabelle aus `AGENTS.md` (Zeilen 12-18) und ist im Skript als
Kommentar-Block dokumentiert. Sonderrolle `orchestrator` (oder leer) liefert
alle Proposals (Escape-Hatch für Cross-Cutting-Requests).

**Filterregel:**
- Include ⇔ `proposal.domains ∩ role_allowlist ≠ ∅`
- Proposal ohne `domains:`-Frontmatter → Include (Legacy-Fallback, mit
  `WARN:`-Marker in stderr).
- Proposal mit `domains: []` → Exclude (explizit = verbindlich).
- Unbekannte Rolle → Include all + `WARN: unknown role '<role>'` in stderr
  (Fail-Soft).
- Bestehende Semantik `--with-openspec` (SSOT-Specs anhängen) und `--semantic`
  (semantische Nachbarn) bleibt unverändert — der Filter wirkt nur auf die
  Change-Proposal-Liste.

**Failing Test in `tests/spec/plan-context.bats`** (RED → GREEN) — hermetische
Suite mit Mini-`openspec/changes/`-Fixture; sieben `@test`-Cases decken die
Filter-Matrix ab (Match, No-Match, Missing-Domains, Empty-Domains, Archive,
Orchestrator-Escape-Hatch, Unknown-Role).

**Delta in `openspec/specs/dev-flow-plan.md`** — Requirement
`plan-context.sh filters by role` mit fünf Scenarios kodifiziert das neue
Verhalten als SSOT.

_Ticket: T001387_
_Design: docs/superpowers/specs/2026-07-01-plan-context-role-filter-design.md_
