---
title: "OpenSpec-Proposals im Ticket-Detail-View"
ticket_id: T000962
plan_ref: null
status: draft
type: feature
domains: [website, admin]
created: 2026-06-20
---

# Spec: OpenSpec-Proposals im Ticket-Detail-View

## Kontext

Das Admin-Ticket-Detail (`/admin/tickets/[id]`) zeigt Infos zu einem Ticket: Status, Plan,
Grilling-Antworten, Anhänge, Aktivitätsverlauf. Wenn OpenSpec Change-Proposals für dieses
Ticket existieren, sind sie bislang unsichtbar — man muss manuell im `openspec/changes/`-Ordner
nachschauen. Die `openspec-status.json` enthält bereits alle Verknüpfungen (Ticket-ID → Proposals).

## Ziel

Ein neues Panel "OpenSpec Proposals" in der Ticket-Vollansicht, das alle verknüpften Change-Proposals
mit Slug, Status-Badge und GitHub-Link anzeigt. Zero Runtime-Overhead (statischer JSON-Import).

## Design

### Datenfluss

```
openspec-status.json  →  [id].astro (SSR)  →  OpenSpecProposalsPanel.svelte
  { "T000962": [         const proposals =      Props: proposals[]
    { slug, status }  ]    statusMap[ticket.externalId] ?? []
  }
```

### Komponente: OpenSpecProposalsPanel

- **Props:** `proposals: Array<{ slug: string; status: string }>`
- **Zeigt:** Panel nur wenn `proposals.length > 0`
- **Pro Proposal:**
  - Slug als formatierter Name (`slug.replace(/-/g, ' ')` → Titel-Case)
  - Status-Badge mit Farbe: `planning` = grau, `plan_staged` = gelb/gold, `archived` = grün
  - GitHub-Link zu `openspec/changes/<slug>/proposal.md` (GITHUB_REPO_URL aus env oder relative URL)
- **Stil:** konsistent mit bestehenden Panels (ContainerDorPanel.svelte als Vorlage)

### Integration in [id].astro

Neuer statischer Import:
```typescript
import openspecStatusMap from '../../../data/openspec-status.json';
const openspecProposals = (openspecStatusMap as Record<string, Array<{slug:string;status:string}>>)[ticket.externalId] ?? [];
```

Einbindung im Template (nach `TicketAttachmentsPanel`, vor der Aktivitäts-Timeline):
```astro
{openspecProposals.length > 0 && (
  <OpenSpecProposalsPanel proposals={openspecProposals} />
)}
```

## Non-Goals

- Kein Drawer (nur Vollansicht)
- Kein Lesen von `proposal.md` zur Beschreibung (zu komplex, JSON reicht)
- Keine CRUD-Aktionen (read-only Panel)
- Keine Änderung an `admin.ts` (baselined, Budget 0)

## S1-Budget

| Datei | Aktuell | Limit | Budget |
|-------|---------|-------|--------|
| `[id].astro` | 332 | 400 | 68 Zeilen (+5 netto = OK) |
| `OpenSpecProposalsPanel.svelte` | neu | 500 | 500 (Ziel: ~80-100) |

## Akzeptanzkriterien

1. Ticket mit `openspecProposals` zeigt Panel in `/admin/tickets/[id]`
2. Ticket ohne Proposals zeigt kein Panel (conditional render)
3. Status-Badges sind korrekt farbcodiert
4. `task test:all` + `task freshness:regenerate` + `task freshness:check` grün
