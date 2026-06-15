# Grilling → Ticket — geteilte Fähigkeit

Eine *Grilling-Session* (strukturiertes Q/A-Interview — Coaching-Fragebogen, Deep-Grilling
vor dem Planen, Klärungsrunde, Incident-Befragung) **an ein bestehendes Ticket senden**.
Das Wissen landet in der `grilling_answers` JSONB-Spalte auf `tickets.tickets` und (sofern
nicht unterdrückt) zusätzlich als lesbarer Timeline-Kommentar.

## Wann grillen

- **Klärung statt Raten:** Wenn eine offene Frage nur der Mensch beantworten kann (Scope,
  Akzeptanzkriterien, Design-Präferenz), grillen statt annehmen.
- **Persistenz statt flüchtig:** Antworten gehören ans Ticket, nicht nur in den Chat —
  so sind sie für Factory/dev-flow-execute/Panel wieder abrufbar.

## Aufruf

```bash
scripts/ticket.sh grill --id <external_id> \
  [--questionnaire <qid>] \          # default: coaching-sessions-v1
  ( --json '{"q1":"...","q2":"..."}' \
  | --answers-file <pfad.json> \
  | --answer qid=text --answer qid=text ... ) \
  [--no-comment] \
  [--brand <mentolder|korczewski>]
```

**Semantik:**
- **Per-Frage-Merge** (akkumulierend, wie das Panel-Auto-Save): bestehende Antworten bleiben,
  gleiche `questionId` wird überschrieben.
- **Idempotent:** legt die Spalte bei Bedarf selbst an (`ADD COLUMN IF NOT EXISTS`) → funktioniert
  unabhängig vom Merge-Zeitpunkt des T000737-Panels, bleibt aber form-identisch.
- **Validierung vor Cluster-Zugriff:** fehlende `--id` oder Antwort-Quelle → Exit 2 ohne kubectl.
  Ticket nicht gefunden → Exit 1.
- **Brand:** via `--brand` oder `BRAND`-Env (mentolder=`workspace`, korczewski=`workspace-korczewski`).

## Strukturiert vs. ad-hoc

- **Strukturiert** (`--questionnaire coaching-sessions-v1`, registriert in
  `website/src/lib/tickets/grilling.ts`): rendert nach dem T000737-Merge direkt im
  `GrillingAnswersPanel`.
- **Ad-hoc** (eigener Fragebogen-Slug, nicht registriert): wird gespeichert, aber vom Panel
  (das nur bekannte `QUESTIONNAIRES` rendert) **nicht** angezeigt → hier ist der
  Timeline-Kommentar die universelle Sichtbarkeit. Ein generischer Panel-Renderer für
  unbekannte Fragebögen ist ein Folge-Ticket (kein Blocker).

## Beispiele

Ad-hoc-Klärung an ein Planungsbüro-Ticket:
```bash
scripts/ticket.sh grill --id T000812 \
  --answer scope="nur mentolder, korczewski später" \
  --answer deadline="kein Hard-Date"
```

Strukturierter Coaching-Fragebogen aus Datei (forward-kompatibel mit dem Panel):
```bash
scripts/ticket.sh grill --id T000812 --questionnaire coaching-sessions-v1 \
  --answers-file /tmp/coaching-answers.json
```
