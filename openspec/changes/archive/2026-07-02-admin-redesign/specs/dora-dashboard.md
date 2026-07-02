## REMOVED Requirements

### Requirement: Consolidated Admin-only DORA Dashboard

**Reason**: User-Entscheidung (Brainstorming 2026-07-02): Die DORA-UI-Fläche entfällt ersatzlos —
die Seite wird nicht genutzt und ist eine eigenständige Stil-Insel im Admin.
**Migration**: `/admin/dora` antwortet mit einem Redirect auf `/admin/pipeline?tab=analytics`.
`DoraDashboard.svelte`, `GET /api/admin/dora-metrics` und `computeDora` werden entfernt
(kein toter Code, G-CQ08). Die DORA-/CFR-Messung bleibt über `bash scripts/vda.sh cfr`
(CFR-Gate G-DORA03) verfügbar.

### Requirement: Deployment Frequency Metric

**Reason**: Die Metrik existierte ausschließlich für das entfernte Dashboard
(`computeDora` → `/api/admin/dora-metrics` → `DoraDashboard.svelte`).
**Migration**: Merge-Frequenz ist weiterhin über `bash scripts/vda.sh cfr` bzw. direkte
`tickets.pr_events`-Abfragen auswertbar.

### Requirement: Lead Time for Changes Metric

**Reason**: Ausschließlich vom entfernten Dashboard konsumiert.
**Migration**: Bei künftigem Bedarf aus `tickets.pr_events` (merged_at − created_at) neu ableitbar;
kein UI-Konsument mehr.

### Requirement: Change Failure Rate Proxy Metric

**Reason**: Ausschließlich vom entfernten Dashboard konsumiert; der CFR-Proxy lebt unabhängig
davon im CLI-Gate weiter.
**Migration**: `bash scripts/vda.sh cfr` bleibt die maßgebliche CFR-Auswertung (G-DORA03).

### Requirement: MTTR Metric from Bug Tickets

**Reason**: Ausschließlich vom entfernten Dashboard konsumiert.
**Migration**: Bei Bedarf aus `tickets.tickets (type='bug')` + `tickets.pr_events` neu ableitbar;
kein UI-Konsument mehr.
