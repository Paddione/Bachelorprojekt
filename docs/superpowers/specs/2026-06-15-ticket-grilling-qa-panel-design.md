---
title: "Ticket Grilling QA Panel"
slug: ticket-grilling-qa-panel
date: 2026-06-15
ticket_id: null
plan_ref: null
status: draft
domains: [website, database]
---

# Spec: Ticket Grilling QA Panel

## Ziel

Das Ticketsystem soll Grilling-Fragebögen direkt im Ticket-Detail anzeigen und Antworten auf diese Fragen speicherbar machen. Aktuell verweist T000737 in seiner Beschreibung nur auf ein externes HTML-Formular (`docs/coaching/t000737-session-grilling-gekko.html`) — Antworten müssen manuell als Markdown ins Ticket kopiert werden. Nach diesem Feature können Antworten direkt im Ticket-Overview eingegeben und gespeichert werden.

## Hintergrund

- `docs/coaching/t000737-session-grilling-gekko.html` enthält 23 Fragen in 6 Abschnitten zu Coaching-Sessions
- Das Formular hat einen "Als Markdown kopieren"-Button — keine API-Integration
- Die Ticket-Detail-Seite (`website/src/pages/admin/tickets/[id].astro`) zeigt aktuell kein Grilling-Panel
- Das DB-Feld `ai_question`/`human_answer` ist ein einzelnes Freitext-Feld — nicht für strukturierte Q&A-Sets

## Feature-Scope

### In-Scope
1. **DB-Migration**: Neues JSONB-Feld `grilling_answers` in `tickets.tickets`
2. **Fragebogen-Registry** (`website/src/lib/tickets/grilling.ts`): Die 23 Fragen des Coaching-Fragebogens als TypeScript-Konstante, generisch erweiterbar für künftige Fragebögen
3. **API-Erweiterung**: `grillingAnswers` zur PATCH-Whitelist von `/api/admin/tickets/[id]` hinzufügen
4. **DB-Layer**: `grillingAnswers` in `patchAdminTicket` integrieren (ohne `admin.ts` zu verlängern — Budget=0)
5. **UI-Panel** (`GrillingAnswersPanel.svelte`): Svelte-Komponente mit allen Fragen, Textareas, Auto-Save oder Save-Button
6. **Einbindung** in `website/src/pages/admin/tickets/[id].astro` — Panel erscheint wenn `grilling_answers` oder ein Ticket-Tag für Grilling vorhanden ist
7. **Grilling-HTML anpassen**: Den "Als Markdown kopieren"-Button durch einen "Direkt im Ticket speichern"-Link ersetzen (optional, nice-to-have)

### Out-of-Scope
- Grilling in der Ticketliste/Tabelle (nur Detail-View)
- Neue Fragebögen via Admin-UI erstellen
- Antworten als eigene Tabelle normalisieren (JSONB reicht)

## Fragebogen-Struktur (aus dem HTML extrahiert)

### Fragebogen-ID: `coaching-sessions-v1`

**Abschnitt 1: Die Coaching-Beziehung**
- q1: Wie stellst du dir den idealen Einstieg in eine Coaching-Beziehung vor?
- q2: Soll es eine Erstsession geben? Wie lang, mit welchem Ziel?
- q3: Wie viele Sessions umfasst ein typisches Coaching bei dir? (feste Anzahl oder offen?)
- q4: In welchem Rhythmus sollen Sessions stattfinden? (wöchentlich, 14-tägig, bedarfsgesteuert?)

**Abschnitt 2: Session-Struktur**
- q5: Beschreibe den Ablauf einer einzelnen Session — von Begrüßung bis Abschluss.
- q6: Welche Phasen sollte eine Session haben? (z. B. Check-in, Thema, Erkenntnis, Commitment)
- q7: Braucht es einen strukturierten Leitfaden oder darf jede Session anders sein?
- q8: Soll es Vor- oder Nachbereitung geben? (z. B. Reflexionsfragen zwischen den Sessions)

**Abschnitt 3: Methoden & Werkzeuge**
- q9: Mit welchen Methoden möchtest du arbeiten?
- q10: Welche Rituale oder wiederkehrenden Elemente sind dir wichtig?
- q11: Soll der Coachee konkrete Aufgaben/Experimente zwischen den Sessions bekommen?
- q12: Wie gehst du mit Widerstand oder Blockaden um?

**Abschnitt 4: Dokumentation & Fortschritt**
- q13: Wie hältst du Erkenntnisse aus einer Session fest?
- q14: Soll der Coachee Zugriff auf seine Notizen haben?
- q15: Wie misst du Fortschritt über mehrere Sessions hinweg?
- q16: Was ist für dich ein erfolgreicher Abschluss eines Coachings?

**Abschnitt 5: Timing & Flexibilität**
- q17: Wie lang sollten Sessions sein? (45 Min, 60 Min, 90 Min?)
- q18: Gibt es Unterschiede zwischen Erst-, Folge- und Abschlusssession?
- q19: Wie flexibel darf der Ablauf sein?
- q20: Wie gehst du mit akuten Themen um, die nicht auf dem Plan standen?

**Abschnitt 6: Deine Wünsche**
- q21: Was fehlt dir in aktuellen Coaching-Tools immer wieder?
- q22: Was wäre für dich der größte Gewinn eines durchdachten Session-Konzepts?
- q23: Welche drei Eigenschaften muss dein ideales Session-Format haben?

## Datenmodell

```sql
-- Neues JSONB-Feld in tickets.tickets
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB;

-- Struktur: { "questionnaire": "coaching-sessions-v1", "answers": { "q1": "...", "q23": "..." } }
```

## TypeScript-Typ

```typescript
// website/src/lib/tickets/grilling.ts (neue Datei)
export interface GrillingQuestion {
  id: string;       // "q1" ... "q23"
  label: string;    // Die Frage
}

export interface GrillingSection {
  title: string;
  questions: GrillingQuestion[];
}

export interface GrillingQuestionnaire {
  id: string;
  title: string;
  sections: GrillingSection[];
}

export const QUESTIONNAIRES: Record<string, GrillingQuestionnaire> = {
  'coaching-sessions-v1': { ... }
};

export interface GrillingAnswers {
  questionnaire: string;
  answers: Record<string, string>;
}
```

## API-Change

```typescript
// website/src/pages/api/admin/tickets/[id].ts
// PATCH-Whitelist ergänzen:
const PATCHABLE = [
  // ... existing fields ...
  'grillingAnswers',  // neu
];
```

## UI-Entscheidung: Welcher Fragebogen wird für welches Ticket angezeigt?

Das Panel wird aktiviert wenn:
1. `grilling_answers` bereits befüllt ist (Antworten vorhanden), ODER
2. Ein Link in der Ticket-Beschreibung auf ein HTML-Grilling-Formular zeigt (Regex-Match), ODER  
3. **Einfachste Variante**: Das Panel ist immer im Ticket-Detail verfügbar und zeigt den Standard-Fragebogen `coaching-sessions-v1` — User kann ihn ausfüllen oder kollabieren/ignorieren

→ **Empfehlung:** Immer sichtbar, collapsible, leer-Zustand zeigt "Noch keine Antworten". Fragebogen-Selektion über Dropdown falls künftig mehrere Fragebögen existieren.

## S1-Budget-Analyse

| Datei | Aktuell | S1-Limit | Budget |
|-------|---------|----------|--------|
| `website/src/lib/tickets/admin.ts` | 677 | 677 (gebaselined) | **0** |
| `website/src/lib/tickets-db.ts` | 1093 | 1106 (gebaselined) | +13 |
| `website/src/pages/admin/tickets/[id].astro` | 383 | ~500 | ~117 |
| `website/src/pages/api/admin/tickets/[id].ts` | 66 | 600 | 534 |
| `website/src/lib/tickets/grilling.ts` | NEU | 600 | 600 |
| `website/src/components/admin/GrillingAnswersPanel.svelte` | NEU | keine .svelte S1 | ∞ |

**Kritisch:** `admin.ts` Budget=0. Jede Grilling-Erweiterung MUSS in `grilling.ts` (neu) oder `tickets-db.ts` (Puffer=13) gehen. In `admin.ts` nur: 1-3 Zeilen `grillingAnswers: GrillingAnswers | null` im Interface + entsprechendes SQL-Column-Mapping (zeilenneutral wenn Imports nicht wachsen).

## Akzeptanzkriterien

1. Ticket-Detail-Seite zeigt ein "Grilling"-Panel mit allen 23 Fragen als Textareas
2. Antworten können gespeichert werden (PATCH an `/api/admin/tickets/[id]`)
3. Gespeicherte Antworten werden beim nächsten Laden der Seite wieder angezeigt
4. Das Panel ist collapsible (nicht permanent sichtbar wenn leer)
5. Das bestehende HTML-Formular funktioniert weiterhin (kein Breaking Change)
6. S1/S2/S3/S4-Gates bleiben grün (insb. `admin.ts` Budget=0 respektiert)
