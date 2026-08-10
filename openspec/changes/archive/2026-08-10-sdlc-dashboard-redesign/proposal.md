# Proposal: sdlc-dashboard-redesign

## Why

Das SDLC Cockpit ist das Command Center für den Software-Development-Lifecycle — aber in seiner aktuellen Form ein Flickenteppich aus zwei UI-Systemen (Kit-Panels + Svelte-Inseln), sieben flachen Tabs ohne narrative Orientierung, und einer toten Rail-Spalte deren vier Gruppen ("Laufende Epics", "Was Aufmerksamkeit braucht", …) als statischer Text ohne Datenbindung existieren.

Fünf bestätigte Pain Points:
1. **Rail ist toter Raum** — die Spec-Gruppen sind `<div>`-Text ohne Inhalt
2. **Keine "Was als nächstes?"-Ansicht** — kein aggregierter Attention-Blick
3. **7 Tabs, zu viel Klickarbeit** — operativ, planerisch, analytisch und systemisch durcheinandergemischt
4. **Kein SDLC-Phasen-Gefühl** — keine Orientierung wo im Lifecycle man steht
5. **Zwei UI-Systeme kollidieren** — Kit-Panels vs. Svelte, PipelinePanel als Schutzschild

## What

Komplettes Redesign des SDLC Cockpits nach dem Prinzip "der Lifecycle ist die Navigation":

- **Command Bar** (oben): Persistentes Status-Band mit Cluster-Health, Watchdog, aktiven Agenten, Slots, Git-Ops-Status und Overview/Fokus-Toggle
- **Overview-Modus**: Lifecycle-Status auf einen Blick — alle Phasen mit Ticket-Count, Attention-Aggregation (blocked/stuck/cooldown), aktive PRs
- **Fokus-Modus**: Drilldown in eine SDLC-Phase (Triage → Planung → Bauen → Review → Deploy → Ship) mit dem jeweils relevanten Content
- **Lebendige, kontext-sensitive Rail**: Zeigt je nach aktiver Phase die passenden Live-Daten (Factory-Status im Bauen-Modus, DoR-Scores in der Planung, etc.)
- **Unified Panel System**: Alle Panels nutzen dasselbe System — das PipelinePanel-Schutzschild entfällt
- **Insights-Tab**: Reduzierte, echte Metriken (nicht die alten Bloat-KPIs) + Trace-Recording für Finetuning
- **Wählbare Default-Ansicht**: Nutzer-Präferenz, in localStorage persistiert
- **Mobile**: Bottom-Sheet + Swipe-Navigation

## Tab-Migration

| Alter Tab | Neuer Ort |
|-----------|----------|
| Floor | → Fokus-Modus: Phase "Bauen" |
| Planung | → Fokus-Modus: Phase "Planung" + PlanningOffice |
| Analytics | → Insights-Tab (reduziert + Traces) |
| Kosten | → Insights-Tab (als Metrik) |
| Steuerung | → Command Bar (Controls) + Rail (ModelSlots, KiRouting) |
| Abhängigkeiten | → Overlay in Planung |
| Parallel | → Command Bar (Slots, Tick-Countdown) |

_Ticket: T003417_ | _Brainstorm-Board: `.lavish/sdlc-dashboard-redesign-brainstorm.html`_
