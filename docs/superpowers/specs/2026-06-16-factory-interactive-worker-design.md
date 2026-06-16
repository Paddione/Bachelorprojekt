---
title: Factory Interactive Worker
date: 2026-06-16
status: draft
ticket_id: null
plan_ref: null
areas:
  - factory
  - dev-flow
---

# Factory Interactive Worker

## Ziel

Interaktive Claude Code Sessions können als qualitätssichernde Worker in der Software Factory teilnehmen — ohne API-Aufruf aus Application-Code. Konkret: Wo DeepSeek-Scout schwache Ergebnisse liefert (`touched_files=[]`, dünne Spec), springt die interaktive Session ein und erzeugt einen sauberen Plan. Der Dispatcher startet erst dann den Autopilot-Pipeline-Lauf, wenn Branch + Plan-File auf GitHub committed vorliegen.

## Kontext & Ist-Zustand

- **Autopilot-Architektur:** `wakeup.sh` → ein `claude -p`-Prozess → lädt `dispatcher.js` als Workflow → nested `workflow(pipeline.js)` pro Feature.
- **Scout-Schwäche:** DeepSeek-Scout liefert häufig `touched_files=[]` und zu kurze Specs. Die Pipeline schlägt damit als Deploy-Kandidat still fehl oder erzeugt leere PRs.
- **Readiness-Lücke:** `factory-prep-bridge.sh` prüft aktuell nicht ob Branch + Plan-File auf GitHub existieren. Tickets ohne Plan werden trotzdem in die `launch`-Liste aufgenommen.
- **14 Tickets in `planning`** — alle blockiert weil Scout-Output unbrauchbar und kein Plan vorliegt.

## Mechanismus 1 — Scout-Quality-Detektor (automatisch)

### Trigger

In `scripts/factory/pipeline.js`, nach Abschluss der Scout-Phase, bevor Design/Plan beginnt.

### Qualitätskriterien (schwach wenn eines zutrifft)

| Kriterium | Schwellwert |
|-----------|-------------|
| `touched_files` | leer (`[]`) |
| Spec-Inhalt | < 300 Zeichen |
| `plan_path` | nicht gesetzt |

### Aktion bei schwachem Scout

1. Interner Ticket-Kommentar via `ticket.sh comment`:
   ```
   SCOUT_WEAK=true
   touched_files=0
   spec_length=<n>
   reason=<erster Treffer>
   ```
2. Ticket-Status bleibt `planning` — kein Autopilot-Retry.
3. Pipeline gibt strukturierten Fehler zurück (`{status:"scout_weak", ticket_id}`), Dispatcher loggt ihn.

Kein neuer DB-Spalte nötig — der interne Kommentar ist der persistente Marker.

## Mechanismus 2 — Readiness-Guard im Dispatcher (automatisch)

### Ort

`scripts/factory/factory-prep-bridge.sh` — neue Filter-Stufe nach der SQL-Kandidaten-Query, vor dem JSON-Output.

### Prüfung pro Kandidat-Ticket

```bash
# 1. Branch auf GitHub vorhanden?
git ls-remote --exit-code origin "refs/heads/$branch" >/dev/null 2>&1 || FAIL="no_branch"

# 2. Plan-File auf Branch committed?
git show "origin/$branch:$plan_path" >/dev/null 2>&1 || FAIL="no_plan_on_branch"
```

Schlägt eine der Prüfungen fehl → Ticket wird aus der `launch`-Liste entfernt und als `not_ready` geloggt (kein Error, nur Info).

### Effekt

Der Autopilot berührt kein Ticket mehr, dessen Plan nicht sauber auf GitHub liegt. Das verhindert leere `pipeline.js`-Läufe und fehlerhafte Plan-Reuse-Versuche.

## Mechanismus 3 — `/factory-worker-on` (interaktiv, on demand)

### Aktivierung

User ruft `/factory-worker-on` auf (neue Skill-Datei `.claude/skills/factory-worker/SKILL.md`).

### Schritt 1 — Sentinel-Lock setzen

```bash
bash scripts/agent-lock.sh claim ticket "interactive-scout" \
  --label interactive-worker --worktree "$PWD"
```

Dispatcher sieht beim nächsten Tick: `interactive-worker` aktiv → reduziert Parallel-Slots um 1 (lässt dem Human Platz in der Queue).

### Schritt 2 — Scan: Tickets ohne sauberen Plan

Query gegen die DB (via `kubectl exec`):

```sql
SELECT t.external_id, t.title, t.brand, t.branch, t.plan_path
FROM tickets.tickets t
WHERE t.status IN ('planning', 'backlog')
  AND (t.branch IS NULL OR t.plan_path IS NULL
       OR EXISTS (
         SELECT 1 FROM tickets.ticket_comments c
         WHERE c.ticket_id = t.id
           AND c.body LIKE 'SCOUT_WEAK=true%'
           AND c.visibility = 'internal'
       ))
ORDER BY t.planning_rank ASC NULLS LAST, t.created_at ASC
LIMIT 10;
```

Ausgabe: nummerierte Liste mit Ticket-ID, Titel, Brand, aktuellem Status.

### Schritt 3 — Scout-Loop

Für jedes gewählte Ticket:

1. Zeige Ticket-Details + vorhandenen Scout-Kommentar (falls `SCOUT_WEAK`).
2. Starte `dev-flow-plan` interaktiv — User scoutet, brainstormt, planst.
3. Am Ende: Plan auf Branch committed, Branch auf GitHub gepusht.
4. `bash scripts/ticket.sh stage-plan --id $ext_id --branch $branch --plan $plan_path`
5. Nächstes Ticket oder `/factory-worker-off`.

### Schritt 4 — Abmelden

```bash
bash scripts/agent-lock.sh release ticket "interactive-scout"
```

Dispatcher erhält seinen Parallel-Slot zurück.

## Neue Dateien

| Datei | Zweck |
|-------|-------|
| `.claude/skills/factory-worker/SKILL.md` | `/factory-worker-on` Skill |
| `scripts/factory/scout-quality-check.js` | Exportierbare Qualitäts-Prüffunktion für `pipeline.js` |
| `scripts/factory/readiness-check.sh` | Bash-Funktion für `factory-prep-bridge.sh` |

## Geänderte Dateien

| Datei | Änderung |
|-------|---------|
| `scripts/factory/pipeline.js` | Scout-Quality-Check nach Scout-Phase einbauen |
| `scripts/factory/factory-prep-bridge.sh` | Readiness-Guard-Filter nach SQL-Query |
| `scripts/factory/dispatcher.js` | Vor LAUNCH: `bash scripts/agent-lock.sh list \| grep -q interactive-worker` → wenn gefunden `MAX_PARALLEL -= 1` |

## Datenfluss

```
[Ticket status=planning, kein Plan]
        │
        ▼
/factory-worker-on
  → Sentinel-Lock setzen
  → Scan: Tickets ohne sauberen Plan
  → User wählt Ticket
  → dev-flow-plan (interaktiv)
  → Plan committed auf Branch
  → ticket.sh stage-plan
        │
        ▼
[Ticket status=plan_staged, Branch + Plan auf GitHub]
        │
        ▼
Dispatcher-PREP (nächster Tick)
  → Readiness-Guard: Branch ✓, Plan-File ✓
  → Ticket in launch-Liste
  → pipeline.js: Scout → Design → Implement → Verify → Deploy
```

## Abgrenzung

- **Kein Push von Factory an User:** Kein `agent-msg.sh`-Assignment, kein Notification-System.
- **Kein automatischer Scout-Retry durch Autopilot:** Schwacher Scout → Ticket wartet auf Human.
- **Kein neuer Ticket-Status:** `SCOUT_WEAK` lebt als interner Kommentar, nicht als DB-Spalte.
- **Kein Workflow-Harness-Nesting für den interaktiven Scout:** Der User führt `dev-flow-plan` interaktiv aus — die Factory orchestriert das nicht.

## Akzeptanzkriterien

- [ ] `pipeline.js` schreibt bei schwachem Scout `SCOUT_WEAK=true` als internen Kommentar
- [ ] `factory-prep-bridge.sh` überspringt Tickets ohne Branch + Plan-File auf GitHub
- [ ] `/factory-worker-on` listet Tickets ohne sauberen Plan korrekt
- [ ] Nach `/factory-worker-on`-Loop: Ticket liegt auf `plan_staged`, Branch + Plan auf GitHub
- [ ] Dispatcher reduziert Parallel-Slots um 1 wenn `interactive-worker`-Lock aktiv
- [ ] BATS-Test: `readiness-check.sh` mit fehlendem Branch → expect skip
- [ ] BATS-Test: Scout-Quality-Check mit leerem `touched_files` → expect `SCOUT_WEAK`-Kommentar
