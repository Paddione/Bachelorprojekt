---
ticket_id: T000726
plan_ref: docs/superpowers/plans/2026-06-14-factory-dashboard-lieferhistorie.md
status: active
date: 2026-06-14
---

# Spec: Factory-Dashboard Lieferhistorie in /dev-status (T000726)

## Kontext: Ist-Zustand

`/dev-status` zeigt über `DevStatusTabs.svelte` fünf Tabs: Factory Floor, Planungsbüro, Control Panel, Analytics, Abhängigkeiten. Der **Analytics-Tab** (`FactoryKpiGrid`, `FactoryThroughputChart`, `FactoryPhaseHeatmap`, `FactoryShippedBar`) zeigt tagesbasierte Durchsatz-KPIs, Slot-Auslastung und Eskalationen — aber **keine Lieferhistorie**: keine Zeitpunkte Ticket→PR→Merged→Live, keine Wochen-Throughput-Übersicht, keine Mishap-Rate, kein Modell-Mix.

Die Lieferkette (Ticket anlegen → PR öffnen → PR mergen → Build deployed) ist damit für Admins nicht messbar und Bottlenecks sind unsichtbar.

## Was dieses Feature ändert

Eine neue **Lieferhistorie-Sektion** wird in den bestehenden Analytics-Tab integriert (als neue Komponente `DeliveryHistory.svelte` ganz oben im Analytics-Tab). Sie zeigt alle 7 Pflicht-Metriken für wählbare Zeiträume (7d / 30d / Gesamt) über einen neuen API-Endpoint `/api/admin/delivery-metrics`.

**Keine neuen Tabs.** Keine Änderung an bestehenden Komponenten außer einem Import-Block im Analytics-Tab-Abschnitt von `DevStatusTabs.svelte`.

## Kern-Nutzerflow

1. Admin öffnet `/dev-status` → navigiert zum Tab „Analytics"
2. `DeliveryHistory` lädt beim Mount, default Zeitraum: `7d`
3. Admin klickt auf `30d` oder `Gesamt` → clientseitig neuer Fetch gegen `/api/admin/delivery-metrics?window=30d`
4. Tabelle zeigt pro Delivery-Zeile: Ticket-ID (klickbar → interne Ticket-URL), PR-Nummer (klickbar → GitHub-PR-URL), Zeitdauern in Stunden/Tagen, alle 7 Metriken als Summary-KPIs darüber
5. Kein Auto-Refresh — nur bei Reload oder Tab-Wechsel

## Die 7 Pflicht-Metriken

| # | Metrik | Datenquelle | Berechnung |
|---|--------|-------------|------------|
| 1 | Zeit: Ticket-Anlage → PR-Open | DB `tickets.created_at` + `pr_events.created_at` (via `ticket_links` kind=`pr`) | `pr_events.created_at - tickets.created_at` |
| 2 | Zeit: PR-Open → Merged | DB `pr_events.merged_at - pr_events.created_at` | direkt aus `pr_events` |
| 3 | Zeit: Merged → Live (Deploy) | GitHub Actions API: frühester `build-website*.yml`-Workflow-Run nach `merged_at` | `workflow_run.updated_at - merged_at` (nur Runs mit `conclusion=success`) |
| 4 | Gesamtdauer: Ticket-Anlage → Live | Summe der Metriken 1+2+3 | `deploy_at - tickets.created_at` |
| 5 | Tickets delivered per Woche | Deliveries im Zeitfenster / (Tage / 7) | Count `done`-Tickets mit PR-Link / Wochen |
| 6 | Mishap-Rate | Tickets mit `type='bug'` AND `resolution IN ('fixed','wontfix')` AND `created_at` im Fenster / Deliveries gesamt | Proxy: Bug-Tickets als Mishap-Indikator (kein separates mishap-table) |
| 7 | Modell-Mix (Claude vs. DeepSeek %) | `tickets.provider_config` via Phase-Events-`driver`-Feld + `factory_phase_events` aggregiert nach Provider-Prefix | `COUNT(*) FILTER (WHERE driver='factory' AND ...)` — da `detail` meist leer; Fallback: Provider-Config Anteil aktiver Anthropic/DeepSeek-Slots |

**Mishap-Proxy-Begründung:** Es gibt keine `mishap`-Tabelle. Als Mishap zählen Bug-Tickets (`type='bug'`), die im Messzeitraum erstellt wurden und auf `done` sind — sinnvoller Proxy für "Dinge, die schiefgingen". Wird in der UI als „Bugs im Zeitraum / Deliveries" labeled.

**Modell-Mix-Proxy-Begründung:** `factory_phase_events.detail` ist oft leer; eine direkte per-Run-Modell-Zuordnung fehlt in der DB. Stattdessen: Anteil aktiver `provider_config`-Einträge mit `provider LIKE 'anthropic%'` vs. `provider LIKE 'deepseek%'` — zeigt den aktuellen Mix der Konfiguration. Wird als „Aktive Provider-Konfiguration" gelabelt, nicht als "Runs".

## GitHub Actions API-Integration

- **Env-Var:** `GITHUB_PAT` (schon vorhanden in `factory-ci.ts` / `github-ci.ts`)
- **Repo:** Aus Env-Var `GITHUB_REPO` (default `Paddione/Bachelorprojekt`) — **kein Hardcode im Code**
- **Endpunkt:** `GET /repos/{owner}/{repo}/actions/runs?event=push&branch=main&per_page=30&created=>={merged_at_iso}`
- **Filter:** Workflow-Name enthält `build-website` oder `build-brett` oder ähnliches (Env-Var `GITHUB_DEPLOY_WORKFLOW_FILTER`, default `build-website`)
- **Fehlerfall:** Kein PAT gesetzt → Metrik 3 + 4 zeigen `–` (kein Crash), Rest bleibt vollständig
- **Rate-Limit:** Serverseitiger In-Memory-Cache mit TTL 5 Minuten pro Zeitfenster (wie in `github-ci.ts`)

## Akzeptanzkriterien

- [ ] `DeliveryHistory.svelte` rendert im Analytics-Tab ohne Fehler, wenn die DB erreichbar ist
- [ ] Zeitraum-Auswahl 7d / 30d / Gesamt schaltet clientseitig um (kein Page-Reload)
- [ ] Alle 7 Metriken werden angezeigt (fehlende Daten zeigen `–`, kein JS-Fehler)
- [ ] Ticket-ID in der Tabelle ist ein klickbarer Link zu `/admin/tickets/{external_id}`
- [ ] PR-Nummer ist ein klickbarer Link zu `https://github.com/{GITHUB_REPO}/pull/{pr_number}`
- [ ] Kein GH-Token → Metrik 3 (Merged → Live) zeigt `–`, Rest funktioniert
- [ ] Kein Delivery im Zeitraum → leere Tabelle mit Hinweistext, kein Fehler
- [ ] API-Fehler (500) → Fehlermeldung in der Komponente, keine weiße Seite
- [ ] `/api/admin/delivery-metrics` gibt 401 für Nicht-Admin zurück
- [ ] Vitest-Tests für die Berechnungsfunktionen in `delivery-metrics.ts` (pure module)

## Edge Cases

| Situation | Verhalten |
|-----------|-----------|
| `GITHUB_PAT` nicht gesetzt | Metric 3 & 4 = `–`; API-Call wird übersprungen (fail-open) |
| Ticket hat keinen PR-Link | Zeile erscheint nicht in der Tabelle (nur Deliveries mit PR-Nachweis) |
| PR hat keinen passenden Workflow-Run | Metric 3 = `–`, Metric 4 = `–` |
| GH Actions API gibt 403/429 zurück | Metric 3 = `–`, Error wird geloggt, kein Crash |
| Zeitfenster hat 0 Deliveries | Leere Tabelle + Hinweis „Keine Deliveries im Zeitraum" |
| `Gesamt`-Fenster mit >500 Deliveries | Paginierung nicht in Scope — max. 200 Rows (DB LIMIT) |
| `merged_at` in `pr_events` NULL | Diese PR-Zeile wird für Metric 2 übersprungen |

## Technische Constraints

- **S1-Budget:**
  - `dev-status.astro`: 30 Zeilen → Limit 400 → kein Import nötig (DevStatusTabs.svelte übernimmt)
  - `DevStatusTabs.svelte`: 195 Zeilen → Limit 500 → Budget ~305 (1 `import` + 1 `{#if}`-Zweig: ca. 10 Zeilen Zuwachs)
  - `DeliveryHistory.svelte` (NEU): Ziel < 350 Zeilen
  - `delivery-metrics.ts` (NEU): Ziel < 350 Zeilen (pure module: keine DB-Imports)
  - API-Endpoint `delivery-metrics.ts` unter `pages/api/admin/`: Ziel < 80 Zeilen
- **S2:** `delivery-metrics.ts` ist ein pure calculation module — keine DB-Imports, keine `pool`-Calls. DB-Zugriff erfolgt nur im API-Endpoint.
- **S3:** Repo-Name aus `process.env.GITHUB_REPO ?? 'Paddione/Bachelorprojekt'`, PAT aus `process.env.GITHUB_PAT` — kein Hardcode im Business-Code
- **Keine neuen Tabs in `DevStatusTabs.svelte`** — die Komponente wird nur im bestehenden `{:else if activeTab === 'analytics'}`-Block erweitert
- **Kein Live-Update** — statische Abfrage bei Komponentenmount und bei Zeitraum-Wechsel
- **Beide Brands zusammen** — kein Brand-Filter in den DB-Queries (Ticket-Schema ist brand-agnostisch in dieser Ansicht)

## Betroffene Dateien

| Datei | Änderungsart |
|-------|-------------|
| `website/src/lib/delivery-metrics.ts` | NEU — pure Berechnungsmodul (Typen + Aggregations-Funktionen) |
| `website/src/pages/api/admin/delivery-metrics.ts` | NEU — API-Endpoint (DB-Query + GH Actions Fetch) |
| `website/src/components/DeliveryHistory.svelte` | NEU — UI-Komponente mit Zeitraum-Tabs + Tabelle |
| `website/src/components/DevStatusTabs.svelte` | GEÄNDERT — `DeliveryHistory` im Analytics-Tab importieren und rendern |
| `website/src/lib/delivery-metrics.test.ts` | NEU — Vitest-Tests für pure Berechnungsfunktionen |
