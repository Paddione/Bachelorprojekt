# Design: Factory-Watchdog RED-GREEN Gap

## Änderung

### 1. `scripts/factory/watchdog.sh` — Attempt-Counter `prog`-CTE filtern

**IST (Zeilen 134-157):**
```sql
prog AS (
  SELECT max(pe.at) AS last_at
  FROM tickets.factory_phase_events pe JOIN tgt ON pe.ticket_id = tgt.id
)
```

**SOLL:**
```sql
prog AS (
  SELECT max(pe.at) AS last_at
  FROM tickets.factory_phase_events pe JOIN tgt ON pe.ticket_id = tgt.id
  WHERE pe.state IN ('done', 'partial-done', 'blocked')
)
```

Begründung: Nur abgeschlossene Phasen (`done`, `partial-done`) oder geblockte Phasen (`blocked`) stellen echten Fortschritt dar. Ein `entered`-Ereignis ohne korrespondierendes `done`/`blocked` bedeutet, dass die Pipeline die Phase betreten, aber nicht abgeschlossen hat — das ist kein Fortschritt.

### 2. `openspec/specs/software-factory.md` — Anforderung präzisieren

**IST (Zeilen 202-204):**
> existiert ein `tickets.factory_phase_events`-Eintrag, dessen `at` neuer ist als das `updated_at` des Zählers, SHALL der Zähler auf `1` zurückgesetzt werden

**SOLL:**
> existiert ein `tickets.factory_phase_events`-Eintrag mit `state IN ('done', 'partial-done', 'blocked')`, dessen `at` neuer ist als das `updated_at` des Zählers, SHALL der Zähler auf `1` zurückgesetzt werden

### Nicht geändert

- Die Pipeline selbst (`pipeline.mjs`) bleibt unverändert. Das Schreiben von `entered`-Events ist korrektes Verhalten für die Fortschrittsanzeige.
- Die Modell-Eskalationsleiter (lines 26-31 in pipeline.mjs) bleibt unverändert — sie funktioniert, sobald der Zähler den Versuch korrekt zählt.
- `dispatcher-bridge.sh` und `factory-prep` bleiben unverändert — `model_tier` wird bereits aus dem Launch-Payload gelesen.
