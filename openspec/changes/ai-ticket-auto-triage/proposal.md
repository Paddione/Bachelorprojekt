---
ticket_id: T000992
plan_ref: openspec/changes/ai-ticket-auto-triage/tasks.md
status: planning
date: 2026-06-20
---

# Proposal: AI: Ticket-Auto-Triage (Severity-Erkennung)

_Ticket: T000992_

## Why

Neue Tickets werden heute ohne Severity-Erstbewertung angelegt — Patrick muss jede Severity
manuell setzen. Bei hohem Ticket-Aufkommen verschießt sich die Triage-Warteschlange, was
die Latenz von „Ticket angelegt → Bearbeitung priorisiert" unnötig in die Länge zieht.
Die Heuristik-Triage nimmt Patrick die Erstbewertung bei eindeutigen Fällen ab (Confidence >90%
→ auto-apply) und liefert bei mittlerer Confidence einen Vorschlag-Comment, den Patrick mit
einem Klick bestätigt. Das verkürzt die Triage-Zeit auf <30s pro Ticket und senkt die
manuelle Routinetriage-Last.

## What

### Heuristik-Regelsatz

Neues Ticket wird angelegt (manuell oder via Intake). Ein Heuristik-Regelsatz analysiert
Titel, Beschreibung und Bereich (`areas`):

- **Keyword-Matching** — Begriffe wie „kritisch", „prod-down", „Datenverlust" erhöhen die
  Severity-Score.
- **Bereichsgewichtung** — `infra`/`chat` werden als kritischer bewertet als `docs`.

Die Few-Shot-Beispiele aus 20 vergangenen, von Patrick manuell triagierten Tickets
kalibrieren die Heuristik-Regeln (statischer Datensatz, nicht auto-updating in v1).

### Confidence-Branching

| Confidence | Aktion |
|------------|--------|
| >90%       | Severity-Feld wird direkt gesetzt (auto-apply) |
| 50–90%     | Comment „Vorgeschlagene Severity: X (Confidence: Y%)" — Patrick bestätigt per Button |
| <50%       | keine Aktion |

### Akzeptanzkriterien

1. Neues Ticket wird beim Create automatisch analysiert
2. Bei >90% Confidence: Severity-Feld wird direkt gesetzt (auto-apply)
3. Bei 50–90%: Comment „Vorgeschlagene Severity: X (Confidence: Y%)" — Patrick bestätigt per Button
4. Bei <50%: keine Aktion
5. Triage-Zeit <30s pro Ticket (Latenz-SLA)

### Edge Cases

- Ticket hat keine Beschreibung: Confidence <50%, keine Auto-Triage
- Patrick überschreibt Auto-Triage: Wird als Training-Signal geloggt (für künftige
  Few-Shot-Kalibrierung)
- Bulk-Import von Tickets: Triage läuft asynchron, nicht blockierend

### Fehlerfall-Behandlung

- Heuristik-Regelwerk wirft Exception: Ticket wird ohne Auto-Triage angelegt, Error-Log,
  kein User-Nachricht
- Manual-Override des Users: Respektiert immer, Auto-Triage wird nicht re-applied

### Erfolgsmetrik

- Triage-Zeit <30s pro Ticket (P95)
- ≥70% der Auto-Triages haben Confidence >90% (nach 4 Wochen Kalibrierung)
- Patrick-Override-Rate <30% (System ist brauchbar)

### Technische Constraints

- Heuristik-Modell (Regeln + Keywords), kein LLM-Aufruf nötig
- Few-Shot-Datensatz: 20 vergangene Tickets (statisch, nicht auto-updating in v1)
- Auto-Apply nur bei >90% — sonst Vorschlag-Comment
- Erfolgsmetrik = Latenz (<30s), nicht Genauigkeit

## Betroffene Dateien

- Neue `scripts/triage/heuristik.mjs` — Regelwerk + Keyword-Matching
- `scripts/vda/ticket/create.sh` — Triage-Hook nach Create
- Neue `scripts/triage/few-shot-examples.json` — 20 Trainings-Tickets
- `website/src/lib/tickets/triage-display.ts` — Vorschlag-Comment-Rendering
