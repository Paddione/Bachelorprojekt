---
ticket_id: T000726
spec_ref: docs/superpowers/specs/2026-06-14-factory-dashboard-lieferhistorie.md
status: active
date: 2026-06-14
domains: [website]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: Factory-Dashboard Lieferhistorie (T000726)

## S1-Budget-Übersicht

| Datei | Ist-Zeilen | Limit | Budget | Änderung |
|-------|-----------|-------|--------|----------|
| `website/src/pages/dev-status.astro` | 30 | 400 | 370 | keine Änderung nötig |
| `website/src/components/DevStatusTabs.svelte` | 195 | 500 | 305 | +10–15 Zeilen (1 Import + 1 Render-Block) |
| `website/src/lib/delivery-metrics.ts` | 0 (NEU) | 400 | 400 | Ziel ≤ 350 |
| `website/src/components/DeliveryHistory.svelte` | 0 (NEU) | 500 | 500 | Ziel ≤ 350 |
| `website/src/pages/api/admin/delivery-metrics.ts` | 0 (NEU) | 400 | 400 | Ziel ≤ 80 |
| `website/src/lib/delivery-metrics.test.ts` | 0 (NEU) | 400 | 400 | Ziel ≤ 120 |

Hinweis: `website/src/lib/factory-floor.ts` ist nicht baselined (baseline.json: `nicht-baselined`) und wird nicht verändert.

---

## Task 1 — DB-Query für Lieferhistorie entwerfen und validieren

**Dateien:** (kein Commit — nur Recherche + Entwurf)

Formuliere die SQL-Query, die alle Deliveries eines Zeitfensters liefert:

```sql
SELECT
  t.external_id,
  t.title,
  t.created_at                         AS ticket_created_at,
  t.done_at,
  l.pr_number,
  pe.created_at                        AS pr_opened_at,
  pe.merged_at
FROM tickets.tickets t
JOIN tickets.ticket_links l
  ON l.from_id = t.id AND l.kind = 'pr' AND l.pr_number IS NOT NULL
JOIN tickets.pr_events pe
  ON pe.pr_number = l.pr_number
WHERE t.type = 'feature'
  AND t.status = 'done'
  AND t.done_at >= now() - INTERVAL '<window>'
ORDER BY t.done_at DESC
LIMIT 200;
```

Für Mishap-Rate (Metrik 6):
```sql
SELECT COUNT(*)::int AS bug_count
FROM tickets.tickets
WHERE type = 'bug'
  AND status = 'done'
  AND done_at >= now() - INTERVAL '<window>';
```

Für Modell-Mix (Metrik 7):
```sql
SELECT provider,
       COUNT(*) AS cnt
FROM tickets.provider_config
WHERE enabled = true
  AND is_active IS NOT FALSE
GROUP BY provider;
```

**Verifizierung:** Query gegen fleet exec testen:
```bash
kubectl --context fleet exec -n workspace deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT t.external_id, pe.pr_number, pe.merged_at FROM tickets.tickets t JOIN tickets.ticket_links l ON l.from_id=t.id AND l.kind='pr' JOIN tickets.pr_events pe ON pe.pr_number=l.pr_number WHERE t.status='done' LIMIT 5;"
```

---

## Task 2 — `delivery-metrics.ts` erstellen (pure calculation module)

**Datei:** `website/src/lib/delivery-metrics.ts` (NEU)

Typen und pure Berechnungsfunktionen — keine DB-Imports, kein `pool`. Nur Typen + Transformation.

Inhalt:
- `DeliveryRow`: Typ für DB-Ergebnis (ticket_id, title, pr_number, timestamps)
- `GhWorkflowRun`: Typ für GH Actions API response
- `DeliveryMetric`: Typ für eine berechnete Zeile (alle 7 Felder als optional + Links)
- `DeliverySummary`: Aggregierte Zusammenfassung (Ø-Werte der 7 Metriken)
- `function calcDurationH(from: string | null, to: string | null): number | null` — gibt `null` wenn eines der beiden fehlt
- `function toDeliveryMetric(row: DeliveryRow, deployAt: string | null, ghRepo: string): DeliveryMetric` — berechnet alle Felder aus einer DB-Zeile + optionalem deploy-Zeitstempel
- `function summarize(metrics: DeliveryMetric[], bugCount: number, windowDays: number, providerCounts: Record<string, number>): DeliverySummary` — aggregiert alle 7 Metriken zu einem Summary-Objekt
- `function modelMixPercent(providerCounts: Record<string, number>): { claudePct: number; deepseekPct: number; other: number }` — berechnet den Provider-Mix in Prozent

**S2-Guard:** Keine `import` von `website-db` oder `pool` in dieser Datei.

---

## Task 3 — GitHub Actions API-Integration im Endpoint

**Datei:** `website/src/pages/api/admin/delivery-metrics.ts` (NEU)

Server-seitiger API-Endpoint. Führt DB-Queries aus und ruft bei Bedarf die GH Actions API auf.

Aufbau:
```typescript
// GET /api/admin/delivery-metrics?window=7d|30d|all
export const GET: APIRoute = async ({ request, url }) => {
  // 1. Auth-Check (isAdmin)
  // 2. window-Parameter parsen → INTERVAL
  // 3. DB-Queries (3 Queries aus Task 1) via pool
  // 4. GH Actions API (fetchDeployTimestamps) — fail-open wenn kein PAT
  // 5. Berechnung via delivery-metrics.ts Funktionen
  // 6. JSON-Antwort
}
```

GH Actions Fetch-Funktion (`fetchDeployTimestamps`):
- `GITHUB_PAT` aus env (schon in `github-ci.ts` als `GITHUB_PAT`)
- `GITHUB_REPO` aus env (default `Paddione/Bachelorprojekt`)
- `GITHUB_DEPLOY_WORKFLOW_FILTER` aus env (default `build-website`)
- Endpoint: `GET /repos/{repo}/actions/runs?event=push&branch=main&per_page=50`
- Serverseitiger Cache: `Map<string, { at: number; data: ... }>` mit TTL 5 Minuten pro Zeitfenster
- Fehler → returns `{}` (leere Map `pr_number → deploy_at`) — kein throw

Ziel: ≤ 80 Zeilen.

---

## Task 4 — `DeliveryHistory.svelte` erstellen

**Datei:** `website/src/components/DeliveryHistory.svelte` (NEU)

UI-Komponente ohne Props — fetched selbst via `/api/admin/delivery-metrics?window=`.

Aufbau:
- State: `window: '7d' | '30d' | 'all'` (default `'7d'`), `data`, `loading`, `error`
- `onMount` → initial fetch
- Zeitraum-Buttons oben (7d / 30d / Gesamt) → `window`-Wechsel triggert neuen Fetch
- Summary-KPI-Karten (7 Stück) in einem Grid
- Tabelle mit den letzten Deliveries (Ticket-Link, PR-Link, 4 Zeitdauern)
- Leere Tabelle → Hinweistext
- Fehlerfall → Fehlermeldung + Retry-Button
- Kein auto-refresh; nur bei Zeitraum-Wechsel oder Mount

GitHub-PR-URL: `https://github.com/${ghRepo}/pull/${prNumber}` (ghRepo aus API-Response)
Ticket-URL: `/admin/tickets/${extId}`

Ziel: ≤ 350 Zeilen.

---

## Task 5 — `DevStatusTabs.svelte` erweitern

**Datei:** `website/src/components/DevStatusTabs.svelte` (GEÄNDERT)

Änderungen:
1. Import am Anfang des `<script>`-Blocks hinzufügen:
   ```typescript
   import DeliveryHistory from './DeliveryHistory.svelte';
   ```
2. Im `{:else if activeTab === 'analytics'}` Block, ganz oben (vor `FactoryKpiGrid`):
   ```svelte
   <DeliveryHistory />
   ```

Keine anderen Änderungen. Budget: +2–3 Zeilen (197–198 → unter 200 → deutlich unter Limit 500).

---

## Task 6 — Vitest-Tests für `delivery-metrics.ts`

**Datei:** `website/src/lib/delivery-metrics.test.ts` (NEU)

Pure-module Tests (kein DB-Mock nötig):

- `calcDurationH(from, to)`: null wenn from null, null wenn to null, korrekte Stundendifferenz
- `toDeliveryMetric()`: Alle Felder korrekt berechnet bei vollständigen Daten; `null`-Felder wenn Timestamps fehlen; Links korrekt konstruiert
- `summarize()`: Mishap-Rate = bugCount / deliveries; Ø-Werte ignorieren null-Einträge; Weeks-Throughput korrekt bei 0 Deliveries
- `modelMixPercent()`: Korrekte Prozentberechnung; graceful bei leerem Input (0 Einträge)

Ziel: ≤ 120 Zeilen. Keine DB-Abhängigkeit — pure function tests.

---

## Task 7 — Integration verifizieren (lokale Smoke-Tests)

**Keine Dateiänderungen — nur Verifikation:**

1. Astro dev starten und `/dev-status?tab=analytics` aufrufen
2. `DeliveryHistory`-Komponente erscheint im Analytics-Tab
3. Zeitraum-Wechsel (7d/30d/Gesamt) funktioniert
4. Bei fehlendem PAT: Metriken 3+4 zeigen `–`
5. Bei fehlenden Daten: Leere Tabelle statt Fehler
6. Ticket-ID-Links öffnen `/admin/tickets/T...`
7. PR-Links öffnen `https://github.com/.../pull/...`
8. `/api/admin/delivery-metrics` gibt 401 ohne Session zurück

---

## Task 8 — Verifikation + Freshness

```bash
cd /tmp/wt-factory-dashboard
task test:all
task freshness:regenerate
task freshness:check
```

Alle Tests grün, keine freshness-Drift.

---

## Durchführungsreihenfolge

```
Task 1 (DB-Query entwurf) →
Task 2 (delivery-metrics.ts) →
Task 6 (Vitest-Tests) →   # TDD: Tests vor Endpoint
Task 3 (API-Endpoint) →
Task 4 (DeliveryHistory.svelte) →
Task 5 (DevStatusTabs.svelte) →
Task 7 (Smoke-Test) →
Task 8 (test:all + freshness)
```

## Erwarteter PR-Umfang

~5 neue/geänderte Dateien, ~700 Zeilen gesamt (netto). Kein neues DB-Schema, keine Migration, keine Env-Var-Änderungen (GITHUB_PAT und GITHUB_REPO bereits in-use oder dokumentiert).
