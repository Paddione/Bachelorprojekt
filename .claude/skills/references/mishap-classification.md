# Mishap Classification

_Referenziert von: `mishap-tracker` SKILL.md Step 1 · Stand 2026-07-28 (T002407)_

## Incident-Typen (sofort Ticket, needs_human)

| Type | Severity | Priority | Attention mode | Route |
|---|---|---|---|---|
| `incident` | `major` | `hoch` | `needs_human` | Sofort-Ticket (kein Buffer) |
| `broken` (deprecated) | → `incident` | → `incident` | → `incident` | Alias für `incident` |
| `security` (deprecated) | → `incident` | → `incident` | → `incident` | Alias für `incident` |

## Nicht-kritische Typen (Buffer → Rollup-Container)

| Type | Severity | Priority | Attention mode | Route |
|---|---|---|---|---|
| `degraded` | — | — | — | Buffer → Rollup-Container |
| `suspicious` | — | — | — | Buffer → Rollup-Container |
| `drift` | — | — | — | Buffer → Rollup-Container |
| `process` | — | — | — | Buffer → Rollup-Container |

## Routing-Entscheidung

```
report_mishap(type)
  ├── type ∈ {incident, broken, security}
  │   └── createIncidentTicket() → sofort, needs_human, kein Buffer
  └── type ∈ {degraded, suspicious, drift, process}
      └── buffer.append()
          ├── len(buffer) < MISHAP_TRIGGER → warten
          └── len(buffer) ≥ MISHAP_TRIGGER → appendToRollupContainer()
```

## Persistent Rollup Container

- **Ticket:** `Mishap Rollup — fortlaufende Sammlung` (type=task, status=triage, persistent)
- **Branch:** `chore/mishap-rollup` (persistiert über Zyklen)
- **Plan:** `openspec/changes/mishap-rollup/tasks.md`
- **Trigger:** `ticket-mcp-go --rollup-mishaps` (Factory-Tick, wakeup.sh)
