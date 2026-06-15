---
ticket_id: null
plan_ref: null
status: draft
created: 2026-06-15
---

# Cockpit Feature Suggestion Manager — Design Spec

## Ziel

Die Überblick-Linse des `/admin/cockpit` wird um ein Feature-Portfolio-Management erweitert:
- Features für den nächsten Schritt auswählen/abwählen
- Features verwerfen (discard)
- Features zum Major Feature upgraden
- KI-gestütztes Rollen/Rerollen von Feature-Vorschlägen via Deepseek API
- Kommentar pro Feature für Reroll-Kontext
- Default: Gleichverteilung über Produkte

## Datenmodell

Neue Spalten auf `tickets.tickets`:
- `next_step BOOLEAN NOT NULL DEFAULT false` — für nächsten Schritt markiert
- `discarded BOOLEAN NOT NULL DEFAULT false` — verworfen
- `major_feature BOOLEAN NOT NULL DEFAULT false` — zum Major Feature upgegraded
- `suggestion_comment TEXT` — Kommentar für AI-Reroll-Kontext

## API-Design

### Erweiterte Endpunkte
- `GET /api/admin/cockpit/portfolio` → `FeatureNode` enthält neue Felder
- `POST /api/admin/cockpit/suggest` — Deepseek API aufrufen, Vorschläge generieren
- `POST /api/admin/cockpit/feature-action` — `{ featureId, action: 'next_step'|'discard'|'major'|'comment', value?: boolean|string }`

### Suggest-Endpoint
- Nimmt Liste aller Features mit ihren aktuellen States
- Sendet an Deepseek API (deepseek-chat)
- Prompt: "Verteile diese Features gleichmäßig auf next_step. Berücksichtige discarded-Flags."
- Returns: `{ suggestions: { featureId: string, nextStep: boolean, reason: string }[] }`

## UI-Design

### Überblick-Linse
- **SuggestionBar** (oben): Roll-Button mit Provider-Selector (default: Deepseek), Gleichverteilungs-Toggle
- **FeatureCard** (erweitert):
  - Action-Buttons: [Nächster Schritt ✓/✗] [Verwerfen 🗑] [Major ★]
  - State-Indikatoren: Badge für next_step (grün), discarded (rot/durchgestrichen), major (gold)
  - Kommentar-Feld: ausklappbar, Textarea mit "Für Reroll speichern"
  - Ausgeworfene Features: ausgegraut, nach unten sortiert

### Verteilungs-Logik
- Default: Gleichverteilung (Features gleichmäßig auf Produkte)
- Optional: Manuelle Verteilung (User selektiert selbst)
- Reroll berücksichtigt Kommentare als Kontext
