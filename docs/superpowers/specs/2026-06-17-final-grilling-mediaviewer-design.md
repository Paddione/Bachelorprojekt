---
ticket_id: T000942
plan_ref: null
status: active
date: 2026-06-17
---

# Final-Grilling-Session im Mediaviewer Sidekick Widget

## Summary

Der Mediaviewer-Widget erhält einen zweiten Modus (`grilling`), in dem kein Video
abgespielt wird, sondern eine interaktiv beantwortbare **Final-Grilling-Session**
für Softwareentwicklungs-Tickets angezeigt wird. Die Session-Fragen werden
**implizit aus Ticket-Informationen** (bestehende Grilling-Antworten, Ticket-Body,
Anhänge, Spec-Referenzen) abgeleitet und mit KI-generierten Vorschlägen
(Visual Companion) angereichert. Der Entwickler/Reviewer sieht im Sidekick eine
strukturierte finale Klärungsrunde vor der Implementierung und kann Antworten
direkt im Widget persistieren.

## Motivation

- **Problem**: Vor der Implementierung eines Softwareentwicklungs-Tickets gibt es
  oft ungeklärte Fragen zu Architektur, Edge Cases, Testing-Strategie und
  Deployment. Diese Klärung passiert heute ad-hoc im Chat oder gar nicht.
- **Ziel**: Eine Final-Grilling-Session im Sidekick-Widget, die:
  - aus Ticket-Daten **implizit generierte** Klärungsfragen anzeigt,
  - KI-Vorschläge und visuelle Begleiter einblendet,
  - Antworten direkt via Ticket-API persistiert,
  - für **beide Brands** (mentolder + korczewski) funktioniert,
  - den dev-flow Deep-Grilling-Prozess (Schritt -3) widget-basiert abbildet.

## User Story

> Als Entwickler öffne ich vor der Implementierung eines Features den Sidekick,
> wähle "Final Grilling" und erhalte eine interaktive Klärungs-Ansicht mit Fragen,
> die sich aus dem Ticket-Kontext (Body, Anhänge, Spec, bestehende Grilling-Antworten)
> ableiten. Ich kann Fragen beantworten, Vorschläge annehmen/verwerfen, und die
> Antworten werden automatisch am Ticket als `grilling_answers` gespeichert.

## Architecture

```
PortalSidekick.svelte
  ├── SidekickHome (neuer Tile: "Final Grilling")
  └── view='mediaviewer'
      └── MediaviewerPanel.svelte
          └── <iframe src="mediaviewer.X/embed.html">
              └── postMessage({ type:'setMode', mode:'grilling', ... })
              └── React: MediaviewerWidget (mode='grilling')
                  └── GrillingSessionView (neue Komponente)
                      ├── GrillingStepper (adaptiert aus admin/)
                      ├── KI-Vorschläge / Visual Companion
                      └── Asset-Referenzen (Spec, Plan, Anhänge)
```

### Zwei Modi des Mediaviewer-Widgets

| Modus | Typ | Inhalt |
|-------|-----|--------|
| `video` (default) | Video-Playlist | Help-Videos aus Videovault |
| `grilling` | Interaktives Q/A | Final-Grilling-Fragebogen (Softwareentwicklung) |

### Neue postMessage-Bridge-Typen

**Host → Widget (Inbound):**
```typescript
{ type: 'setMode'; mode: 'video' | 'grilling'; ticketId?: string }
{ type: 'setGrillingData'; data: GrillingSessionData }
```

**Widget → Host (Outbound):**
```typescript
{ type: 'grillingAnswer'; questionId: string; answer: string }
{ type: 'grillingDismiss'; questionId: string }
{ type: 'grillingComplete'; answers: Record<string, string> }
```

### Datenfluss

1. PortalSidekick erkennt Ticket-Kontext (via `sidekick:navigate`-Event mit
   `ticketId`) und lädt Grilling-Daten via API (`/api/admin/tickets/:id`).
2. `MediaviewerPanel` sendet `setMode:'grilling'` + `setGrillingData` an den Widget.
3. Widget rendert `GrillingSessionView` mit Fragen + KI-Vorschlägen.
4. Nutzer-Antworten werden via `grillingAnswer` zurück an den Host gepostet.
5. Host persistiert via `PATCH /api/admin/tickets/:id` in `grilling_answers`.

## Neue Komponenten & Dateien

### Host-seitig (website/)

| Datei | Zweck |
|-------|-------|
| `website/src/components/mediaviewer/GrillingSessionHost.svelte` | NEU: Host-seitiger Wrapper (lädt Daten, managed Persistenz, baut GrillingSessionData) |
| `website/src/lib/tickets/final-grilling.ts` | NEU: Implizite Fragen-Generierung aus Ticket-Kontext, KI-Vorschlags-Builder |
| `website/src/lib/mediaviewer-bridge.ts` | ÄNDERN: Neue Message-Typen `setMode`, `setGrillingData`, `grillingAnswer`, `grillingDismiss`, `grillingComplete` |
| `website/src/components/MediaviewerPanel.svelte` | ÄNDERN: Neuer `mode`-Prop, Routing zu Grilling vs. Video |
| `website/src/components/PortalSidekick.svelte` | ÄNDERN: `mediaviewerMode`-State, Ticket-Kontext-Erkennung, Mode-Weitergabe |
| `website/src/components/assistant/SidekickHome.svelte` | ÄNDERN: Neuer Tile "Final Grilling" (admin-seitig, bei Ticket-Kontext) |
| `website/src/lib/tickets/grilling.ts` | ÄNDERN: `final-grilling-v1`-Questionnaire in `QUESTIONNAIRES` registrieren |

### Widget-seitig (mediaviewer-widget/)

| Datei | Zweck |
|-------|-------|
| `mediaviewer-widget/src/components/GrillingSessionView.tsx` | NEU: Grilling-UI (Fragenstepper, Antwortfelder, Vorschlagskarten) |
| `mediaviewer-widget/src/components/GrillingSessionView.test.tsx` | NEU: Tests für Grilling-Rendering und Interaktionen |
| `mediaviewer-widget/src/embed/bridge.ts` | ÄNDERN: `setMode`, `setGrillingData` Inbound; `grillingAnswer`, `grillingDismiss`, `grillingComplete` Outbound |
| `mediaviewer-widget/src/embed/EmbedApp.tsx` | ÄNDERN: Mode-State, Conditional Rendering (`video` vs `grilling`) |
| `mediaviewer-widget/src/MediaviewerWidget.tsx` | ÄNDERN: Neuer `mode`-Prop, Conditional Rendering |
| `mediaviewer-widget/src/styles/grilling.css` | NEU: Grilling-spezifisches Styling (angepasst an mv-design-tokens) |

### Tests

| Datei | Zweck |
|-------|-------|
| `website/src/lib/mediaviewer-bridge.test.ts` | ÄNDERN: Neue Message-Typen parsen/validieren |
| `website/src/components/MediaviewerPanel.test.ts` | ÄNDERN: Grilling-Mode-Rendering + mode-switch |
| `website/src/lib/tickets/grilling.test.ts` | ÄNDERN: final-grilling-v1-Questionnaire-Lookup |
| `mediaviewer-widget/src/embed/bridge.test.ts` | ÄNDERN: Neue Message-Typen |
| `mediaviewer-widget/src/MediaviewerWidget.test.tsx` | ÄNDERN: Grilling-Mode-Snapshot |

## Fragebogen: `final-grilling-v1`

### Struktur (6 Sektionen, 23 Fragen)

**1. Anforderungsklärung** — Was genau soll gebaut werden?
- q1: Was ist das Kernproblem, das dieses Ticket löst?
- q2: Welche Acceptance Criteria müssen erfüllt sein?
- q3: Gibt es Abhängigkeiten zu anderen Tickets oder Komponenten?
- q4: Welche Stakeholder sind betroffen?

**2. Architektur & Design**
- q5: Welche Komponenten/Dateien sind betroffen?
- q6: Gibt es ein Architektur-Diagramm oder eine Spec?
- q7: Welche bestehenden Patterns werden wiederverwendet?
- q8: Sind Breaking Changes zu erwarten?

**3. Risiken & Edge Cases**
- q9: Was sind die kritischsten Edge Cases?
- q10: Welche Fehlerzustände müssen behandelt werden?
- q11: Gibt es Security-Implikationen?
- q12: Performance- oder Skalierungsbedenken?

**4. Testing-Strategie**
- q13: Welche Test-Typen sind nötig? (Unit, Integration, E2E?)
- q14: Welche bestehenden Tests sind betroffen?
- q15: Braucht es neue Test-Fixtures oder Mocks?
- q16: Wie wird die Korrektheit verifiziert?

**5. Deployment & Rollout**
- q17: Welche Umgebungen sind betroffen? (dev, beide Brands?)
- q18: Gibt es einen Rollback-Plan?
- q19: Sind DB-Migrationen, Secrets oder Config-Änderungen nötig?
- q20: Wer reviewt und deployed?

**6. Abschluss & Übergabe**
- q21: Sind alle Unklarheiten beseitigt?
- q22: Was sind die nächsten Schritte nach der Implemetierung?
- q23: Gibt es offene Punkte für ein Follow-up-Ticket?

### Implizite Generierung

Die Fragen werden nicht rein statisch gerendert, sondern **dynamisch aus
Ticket-Daten abgeleitet**:

- Jede Frage wird um **kontextspezifische Hinweise** ergänzt, die aus dem
  Ticket-Body, vorhandenen Grilling-Antworten, Attachments und Spec-Referenzen
  extrahiert werden (z. B. "Betroffene Dateien laut Ticket: `PortalSidekick.svelte`,
  `MediaviewerPanel.svelte`").
- KI-Vorschläge (Visual Companion) werden als optional expandierbare Karten
  unter jeder Frage eingeblendet und enthalten Analyse-Ergebnisse aus dem
  Ticket-Kontext (z. B. erkannte Risikobereiche, vorgeschlagene Test-Matrix).

### GrillingSessionData-Typ

```typescript
interface GrillingSessionData {
  ticketId: string;
  questionnaireId: string; // "final-grilling-v1"
  questions: GrillingQuestion[]; // geflattet aus QUESTIONNAIRES
  hints: Record<string, string>; // questionId → kontextspezifischer Hinweis
  suggestions: Record<string, string[]>; // questionId → KI-Vorschläge
  existingAnswers: Record<string, string>; // bereits gespeicherte Antworten
  assets: Array<{ name: string; url: string; type: string }>; // Ticket-Anhänge
}
```

## Acceptance Criteria

1. Der `SidekickHome` zeigt einen neuen Tile "Final Grilling" (admin-seitig, nur bei vorhandenem Ticket-Kontext via `sidekick:navigate`).
2. Bei Klick öffnet der Mediaviewer-Panel im `grilling`-Mode mit `setMode`-Message und `setGrillingData`.
3. Der Widget rendert den `final-grilling-v1`-Fragebogen mit pro Frage kontextspezifischen Hinweisen aus Ticket-Daten.
4. Fragen können im Widget beantwortet werden — Antworten werden via Host-Mediation per `PATCH /api/admin/tickets/:id` in `grilling_answers` persistiert (Akkumulativ-Merge wie bestehendes `ticket.sh grill`).
5. KI-Vorschläge werden als expandierbare Karten unter jeder Frage angezeigt (fail-soft: kein Vorschlag = keine Karte).
6. Der Widget funktioniert für beide Brands (mentolder + korczewski) via identischer postMessage-Infrastruktur.
7. Bestehende Video-Funktionalität bleibt unverändert (Mode-Umschaltung ist nicht-destruktiv, `video`-Mode arbeitet unverändert).
8. `task test:changed` läuft grün nach allen Änderungen.
9. `task freshness:regenerate` + `task freshness:check` laufen grün.
10. Der Fragebogen ist in `QUESTIONNAIRES` registriert und vom bestehenden `GrillingStepper` (admin) sowie via `ticket.sh grill` nutzbar.
