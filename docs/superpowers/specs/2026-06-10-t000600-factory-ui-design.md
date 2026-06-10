# Spec: Factory UI — Analytics Dashboard (Charts + Heatmap)

**Ticket:** T000600  
**Datum:** 2026-06-10  
**Status:** draft  
**Branch:** feature/t000600  
**Dependency:** T000597 (Design System) muss zuerst mergen

---

## Ziel

Den Analytics-Tab in `/dev-status` zu einem vollwertigen Echtzeit-Dashboard ausbauen: fünf KPI-Kacheln mit Schlüsselmetriken, ein 7-Tage-Throughput-Chart als filled Area-Chart in Terminal-Green, eine Phase-Heatmap als 7×6-Grid (Wochentage × Phasen) zur Identifikation von Engpässen sowie ein horizontales Shipped-Bar-Chart mit phasenfarbiger Kodierung — alles in Industrial/Loft-Ästhetik, mit Monospace-Typografie, mobiloptimiert und in voller Funktionsparität auf allen Viewports.

---

## Scope

### Enthalten

- **KPI-Kacheln (5 Stück):** DURCHSATZ, ZYKLUSZEIT, AUSLASTUNG, ESKALATIONEN, DARK-FLAGS — je mit Icon, großer weißer Zahl und #6b7280-Label
- **7-Tage-Throughput-Chart:** filled Area-Chart, Terminal-Green (#22c55e), subtiles Grid, Monospace-Achsenbeschriftung; Datenquelle `/api/factory-metrics`
- **Phase-Heatmap:** 7×6-Grid (7 Wochentage × 6 Phasen), Farbdichte #1a2634 → #f59e0b (durchschnittliche Stunden pro Zelle)
- **Shipped-Bar-Chart:** horizontales Balkendiagramm, Phasen farbkodiert
- **Mobile-Layout:** Portrait-optimierte Charts, scroll-gestacktes Layout, volle Funktionsparität
- **Chart-Bibliothek:** Chart.js (Canvas-basiert) oder SVG direkt — kein D3
- **Anbindung an bestehende APIs:** `/api/factory-metrics` (MetricRow[]) und `/api/factory-floor`

### Explizit NICHT enthalten

- Neue Backend-Endpunkte oder Datenbankschema-Änderungen
- Echtzeit-WebSocket-Streaming (polling oder static render reicht für v1)
- Filterung nach Zeitraum (nur 7-Tage-Fenster fest)
- Export-Funktion (CSV/PDF)
- Interaktive Drill-downs (Klick auf Kachel → Detail-View)
- Neue Domains oder Schema-Vars (`shared_changes: false`)

---

## Design-Entscheidungen

### Farben

| Token | Wert | Verwendung |
|-------|------|------------|
| Background | `#0d1117` | Seiten-Hintergrund |
| Surface | `#1e2736` | KPI-Kacheln, Chart-Container |
| Border | `#2d3748` | 1px-Border auf allen Cards |
| Amber | `#f59e0b` | Heatmap-Maximum, Akzente |
| Terminal-Green | `#22c55e` | Throughput-Chart Fill + Stroke |
| Heatmap-Min | `#1a2634` | Heatmap leere Zellen |
| Text-Primary | `#ffffff` | Kennzahlen, große Zahlen |
| Text-Muted | `#6b7280` | Labels, Achsenticks |

### Typografie

- Alle Labels, Achsenbeschriftungen, KPI-Titel: Monospace (`font-family: 'JetBrains Mono', 'Fira Code', monospace`)
- KPI-Titel: `uppercase`, `letter-spacing: 0.1em`, 11–12px, `#6b7280`
- KPI-Wert: 28–36px bold, `#ffffff`

### Icons (KPI-Kacheln)

| KPI | Icon (Heroicons/SVG inline) |
|-----|-----------------------------|
| DURCHSATZ | `cog` (gear) |
| ZYKLUSZEIT | `clock` (stopwatch) |
| AUSLASTUNG | `squares-2x2` (grid) |
| ESKALATIONEN | `exclamation-triangle` |
| DARK-FLAGS | `fire` (flame) |

### Komponenten-Ansatz

- KPI-Kacheln: Svelte-Komponente `FactoryKpiCard.svelte` — icon slot, value, label, optional trend-arrow
- Throughput-Chart: Chart.js `LineChart` mit `fill: true`, `tension: 0.4`, Grid-Color `rgba(255,255,255,0.05)`
- Phase-Heatmap: SVG-basiert (kein zusätzliches Chart.js-Plugin nötig), `rect`-Elemente mit linearer Farbinterpolation
- Shipped-Bar: Chart.js `HorizontalBar` (Chart.js v3: `type: 'bar', indexAxis: 'y'`)

### Mobile-Ansatz

- Breakpoint: `< 640px` → single-column, Charts skalieren auf `width: 100%`
- Heatmap: scrollbar-x auf kleinen Viewports (min-width: 420px für das Grid), kein Datenverlust
- KPI-Kacheln: 2-Spalten-Grid auf Mobile, 5-Spalten auf Desktop
- Charts stacken vertikal (Throughput → Heatmap → Shipped)

---

## Akzeptanzkriterien

1. **KPI-Kacheln sichtbar:** Alle 5 Kacheln (DURCHSATZ, ZYKLUSZEIT, AUSLASTUNG, ESKALATIONEN, DARK-FLAGS) rendern mit korrektem Icon, weißem Zahlenwert und grauem Monospace-Label auf `#1e2736`-Hintergrund mit `#2d3748`-Border.

2. **Throughput-Chart lädt Daten:** Das 7-Tage-Chart zeigt reale Werte aus `/api/factory-metrics`, die Area ist mit `#22c55e` (Terminal-Green) gefüllt, die Achsenbeschriftungen sind in Monospace und die Grid-Linien subtil (`rgba(255,255,255,0.05)`).

3. **Phase-Heatmap rendert korrekt:** Ein 7×6-Grid mit Wochentagen als Spalten und Phasennamen als Zeilen (oder umgekehrt) zeigt Farbdichte von `#1a2634` (0h) bis `#f59e0b` (Maximum), ohne leere oder überlappende Zellen.

4. **Shipped-Bar-Chart phasenfarbig:** Das horizontale Balkendiagramm zeigt jede Phase in ihrer Kodierfarbe; Balken, Achsen und Beschriftungen sind korrekt ausgerichtet.

5. **Mobile Funktionsparität (Portrait, 390px):** Alle 4 Visualisierungen (KPI × 5, Throughput, Heatmap, Shipped) sind auf einem 390px-Viewport ohne Überlauf zugänglich, scrollen vertikal und verlieren keine Daten; die Charts sind lesbar (Achsenbeschriftungen nicht abgeschnitten).

6. **Keine JS-Fehler in der Konsole:** Der Analytics-Tab öffnet ohne `console.error`-Ausgaben in Chrome DevTools; Chart.js-Instanzen werden bei Komponenten-Unmount korrekt destroyed.

7. **API-Anbindung funktioniert:** Bei einem `404`- oder Netzwerkfehler auf `/api/factory-metrics` zeigen die betroffenen Charts einen lesbaren Fehlerzustand (Skeleton oder Meldung) statt einem leeren Canvas.

---

## Nicht-Scope

- D3.js oder andere schwere Visualisierungs-Libraries
- Echtzeit-Push via WebSocket oder SSE
- Datenbankschema-Änderungen, neue Secrets, neue Domains
- Animierte Transitionen zwischen Datenpunkten (v1: statisch)
- Dark/Light-Mode-Toggle (Anwendung ist dauerhaft Dark)
- A/B-Tests oder Feature-Flags
