# p1 — Plattform-Deck live + DORA-KPI-Raster (Rolle: website)

_Voraussetzung: E3 (T007957) ist gemerged — DeckPlattform/Kontextzone/purpose-Registry existieren._

## Tasks

- [ ] **`lib/sdlc/leitstand-kpi.ts` anlegen (pure Aggregation).** Funktionen
      `aggregateDora(rows: DeliveryMetric[]): DoraKpis` (Deployment-Frequenz, Lead Time,
      Change Failure Rate) und `formatKpiTile(...)` — reine Funktionen ohne I/O, Typen aus
      `components/website/src/lib/delivery-metrics.ts` importieren (dort existieren
      `toDeliveryMetric`, `summarize`, `calcDurationH` als Grundlage — wiederverwenden statt
      duplizieren).
- [ ] **`KpiGrid.svelte` anlegen.** Leerlauf-Modul der Z4: fetcht `/sdlc/api/delivery-metrics`
      (bestehende Route) und rendert DORA-Kacheln + Factory-KPIs im Leitstand-DS
      (`--ls-*`-Tokens aus `sdlc-leitstand.css`, Mono-Ziffern, Signal-Ampel). Antwort-Handling
      mit `fetchedAt` + explizitem `error`-Feld (D12/D13); Fehlerzustand pro Kachel, keine
      Platzhalterzahlen.
- [ ] **`Kontextzone.svelte` umbauen.** Leerlauf-Zweig (keine Selektion) rendert `KpiGrid`
      statt des bisherigen Platzhalter-/Minimal-Zustands; Stations- und Ticket-Zweige bleiben
      unverändert.
- [ ] **`DeckPlattform.svelte` auf echte Quellen umstellen.** Vorhandene
      `FactoryObservability.svelte` (fetcht `/sdlc/api/factory-observability`) als
      Observability-Sektion mounten; K8s-/Deployment-Karten über die bestehenden
      `/sdlc/api/`-Routen (`lib/sdlc/k8s.ts`-gestützt) anbinden. Fail-soft pro Sektion.
- [ ] **Verwaiste Dateien löschen.** `components/sdlc/factory/KostenTab.svelte` (einziger
      Importeur von FactoryObservability, selbst nirgends eingebunden) und
      `components/DeliveryHistory.svelte` (Importeur DevStatusTabs wurde in E3 gelöscht)
      entfernen; danach `grep -rn 'KostenTab\|DeliveryHistory' components/website/src tests/`
      auf Restreferenzen prüfen und diese bereinigen.
- [ ] **`observability.astro` löschen + Redirect.** Seite entfernen; in
      `middleware/redirect-map.ts` den Eintrag `'/sdlc/observability': '/sdlc/cockpit?deck=plattform'`
      ergänzen (301 via `resolveRedirect()`, Muster der bestehenden `/admin/*`-Absorptionen).
- [ ] **purpose-Registry pflegen.** In `lib/sdlc/leitstand-purpose-registry.ts` Einträge für
      `KpiGrid` und `ApiKatalog` (p2-Komponente, Eintrag gehört p1 wegen Datei-Ownership)
      ergänzen: `{ zweck, datenquelle, aktionen }`, `zweck`-Texte eindeutig — der
      E3-Guard `leitstand-purpose-registry.bats` muss grün bleiben.

## Verifikation (Partial-lokal)

```bash
cd components/website && node --experimental-strip-types --no-warnings \
  --eval "import('./src/lib/sdlc/leitstand-kpi.ts').then(m => console.log(Object.keys(m)))"
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats
```
