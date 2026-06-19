---
slug: grilling-ui-multichoice
ticket_id: T000737
status: spec_ready
date: 2026-06-20
plan_ref: docs/superpowers/plans/2026-06-20-grilling-ui-multichoice.md
---

# Grilling UI: Multiple-Choice-Chips und Daten-Reset

## Warum / Kontext

Das In-Ticket-Grilling (`GrillingStepper`) hat zwei Probleme:

1. **Falsche Questionnaire hardcoded**: `[id].astro:182` übergibt immer `questionnaireId="coaching-sessions-v1"` — auch für reine Software-Dev-Tickets wie T000737.
2. **Kein Multiple-Choice**: `GrillingQuestion` hat kein `choices`-Feld. Der Nutzer kann nur freitext tippen. Für Fragen mit erwartbarem Antwortspektrum (z.B. "Welche Test-Typen?", "Wöchentlich oder monatlich?") fehlen Schnell-Auswahl-Chips.
3. **Garbage-Daten in T000737**: `grilling_answers` enthält Test-Dummy-Werte ("f", "ff", "fff") und alle Fragen sind als `dismissed` markiert — muss gelöscht werden.
4. **"Alle anzeigen"-Modus nicht implementiert**: Der Modus-Toggle ist vorhanden, aber im "all"-Modus wird dasselbe `{#if current}` Einzelfragen-Template gezeigt statt einer Liste.

## Was / Lösungsansatz

### 1. T000737 Daten-Reset (Sofortmaßnahme, kein Code-Change)
Löscht `grilling_answers` und `grilling_meta` für T000737 via PATCH-API oder direktem SQL.

### 2. `choices?: string[]` zum Typ hinzufügen
```typescript
export interface GrillingQuestion {
  id: string;
  label: string;
  choices?: string[];  // Schnell-Auswahl-Chips für häufige Antworten
}
```

Choices werden zu ausgewählten Fragen beider Questionnaires hinzugefügt:

**`final-grilling-v1`** (SW-Dev-Kontext):
- q8 (Breaking Changes): ["Nein, rückwärtskompatibel", "Ja, aber kontrolliert", "Ja, koordinierter Rollout nötig"]
- q13 (Test-Typen): ["Unit", "Integration", "E2E", "Unit + E2E", "Alle drei"]
- q17 (Umgebungen): ["Nur dev", "dev + mentolder", "dev + korczewski", "Alle Envs (dev + beide Brands)"]
- q18 (Rollback): ["Ja, reversibel", "Nein, Forward-only-Migration", "Nicht nötig (Feature-Flag)"]
- q19 (DB/Secrets/Config): ["Nein", "Ja, DB-Migration", "Ja, neue Secrets", "Ja, Config-Änderungen", "Mehreres davon"]
- q20 (Reviewer): ["Patrick (Self-Review)", "Factory-Autopass", "Manuell deployen nötig"]

**`coaching-sessions-v1`** (Coaching-Kontext):
- q3 (Anzahl Sessions): ["3-5 Sessions (kompakt)", "8-10 Sessions (standard)", "12+ Sessions (intensiv)", "Offen je nach Bedarf"]
- q4 (Rhythmus): ["Wöchentlich", "Alle 2 Wochen", "Monatlich", "Bedarfsgesteuert"]
- q17 (Dauer): ["45 Minuten", "60 Minuten", "90 Minuten", "120 Minuten"]
- q18 (Unterschiede): ["Ja, Erst-/Folge-/Abschluss-Session verschieden", "Nein, gleiche Struktur immer", "Nur Abschluss-Session anders"]
- q19 (Flexibilität): ["Sehr strukturiert (vorgegebener Ablauf)", "Hybrid (Rahmen + Coachee-Steuerung)", "Offen (Coachee bestimmt)"]

### 3. GrillingStepper: Choice-Chips rendern
- Bei Fragen mit `choices`: Chip-Buttons **über** dem Textarea zeigen
- Klick: ersetzt den Textarea-Inhalt mit dem Choice-Text (wenn leer) oder **ersetzt** ihn (einfachste UX)
- Visuell: kleine abgerundete Buttons im Gold-Stil, Klick markiert den aktiven Chip

### 4. GrillingStepper: "Alle anzeigen"-Modus implementieren
Im `mode === 'all'`-Zweig: alle Fragen als kompakte Liste mit je einem einzeiligen Input.
Answered-Fragen komprimiert zeigen (Label + Preview der Antwort), unanswered als Input-Zeile.

### 5. Questionnaire-Auswahl in `[id].astro` dynamisch machen
Statt hardcoded `"coaching-sessions-v1"`:
```astro
const grillingQnId = (() => {
  // Wenn bereits Antworten unter einer bestimmten Questionnaire-ID existieren, die behalten
  const existing = Object.keys(ticket.grillingAnswers ?? {}).filter(k => k !== 'coaching-sessions-v1');
  if (existing.length > 0) return existing[0];
  // Default: final-grilling-v1 für alle SW-Dev-Tickets
  return 'final-grilling-v1';
})();
```
T000737 bekommt nach dem Daten-Reset `final-grilling-v1`.

## Acceptance Criteria

- [ ] T000737 hat keine garbage-Daten mehr (`grilling_answers = null`, `grilling_meta = null`)
- [ ] `GrillingQuestion.choices?: string[]` kompiliert ohne TS-Fehler
- [ ] Fragen mit `choices` zeigen Chip-Buttons im GrillingStepper
- [ ] Chip-Klick füllt das Textarea-Feld
- [ ] "Alle anzeigen"-Modus zeigt alle Fragen als Liste
- [ ] `[id].astro` übergibt keine hardcoded `coaching-sessions-v1` mehr
- [ ] Alle bestehenden Tests laufen grün
- [ ] Neue Tests: Chip-Auswahl, All-Modus, Questionnaire-Auswahl-Logik

## Nicht im Scope
- Multi-Select (mehrere Chips gleichzeitig auswählen)
- Neues DB-Feld `questionnaire_id` in der Tickets-Tabelle
- `GrillingAnswersPanel.svelte` (Legacy-Komponente, derzeit nicht in `[id].astro` eingebunden)
