# Spec: Ticket-Auto-Triage (Severity-Erkennung)

**Datum:** 2026-06-10
**Branch:** `feature/5010796c-ticket-auto-triage`
**Status:** Design
**Ticket:** 5010796c
**Brands:** beide (mentolder + korczewski)

## Problem

Wenn ein neues Ticket angelegt wird (feature, bug, task, project), fehlen initial
Einschätzungen zu **Priority** und **Severity**. Admins müssen diese manuell setzen —
ein repetitiver Schritt, der bei hohem Ticket-Aufkommen zum Flaschenhals wird. Die
bestehende `classify.ts`-API setzt Priority/Attention-Mode direkt am Ticket (auto-write),
liefert aber keinen Severity-Vorschlag und erfordert einen manuellen UI-Click.

## Lösung (Überblick)

Ein **Auto-Triage-Agent** läuft fire-and-forget nach jeder Ticket-Erstellung an. Er
analysiert Titel + Beschreibung mit Claude Haiku (kostengünstig) und schreibt einen
**System-Kommentar** mit Vorschlägen für Priority, Severity und Component — ohne das
Ticket direkt zu verändern. Ein Admin sieht den Vorschlag im Timeline-Feed und kann
ihn per Click übernehmen oder ignorieren.

## Entscheidungen

| # | Frage | Entscheidung |
|---|-------|--------------|
| 1 | Auto-Set oder Vorschlag? | **Vorschlag als Kommentar** (kind='system'). Kein direktes Schreiben von severity/priority. |
| 2 | Modell | **Claude Haiku** via `getProviderConfig(source, 'haiku')` — kostengünstig, schnell. |
| 3 | Trigger-Zeitpunkt | **Fire-and-forget nach createAdminTicket / insertBugTicket** — non-blocking, Ticket-Create bleibt schnell. |
| 4 | Geltungsbereich | **Alle Ticket-Typen** (feature, bug, task, project). |
| 5 | Severity-Skala | `critical / major / minor / trivial` (existiert bereits als DB-Constraint). |
| 6 | Bestehende classify.ts | **Unverändert** — die neue Triage-Funktion ist ein separater Pfad. classify.ts bleibt der manuelle "Re-Classify"-Button. |

## 1. Datenmodell

Keine Schema-Änderungen erforderlich. Alle benötigten Spalten existieren bereits:

- `tickets.tickets.severity TEXT CHECK (severity IN ('critical','major','minor','trivial'))`
- `tickets.tickets.priority TEXT CHECK (priority IN ('hoch','mittel','niedrig'))`
- `tickets.ticket_comments.kind TEXT CHECK (kind IN ('comment','status_change','system'))`

Der Triage-Vorschlag wird als `kind='system'` Kommentar mit `visibility='internal'` geschrieben.

## 2. API-Design

### Neuer Endpunkt: `POST /api/admin/tickets/[id]/triage`

Manueller Trigger (Admin-UI Button "Auto-Triage") — identische Logik wie der automatische
Hook, aber explizit anstoßbar. Antwortet synchron mit dem Triage-Ergebnis.

```
Request:  POST /api/admin/tickets/[id]/triage
Response: { priority: "hoch", severity: "major", component: "brett", reasoning: "..." }
```

### Auto-Hook (fire-and-forget)

Nach erfolgreicher Ticket-Erstellung in:
- `POST /api/admin/tickets/index.ts` (feature/task/project)
- `POST /api/admin/bugs/create.ts` (bug)
- `POST /api/tickets/comment.ts` (Portal-Feedback → task)

Wird `autoTriage(ticketId, brand)` **ohne await** gestartet. Fehler werden geloggt,
blockieren aber den Create-Flow nicht.

## 3. LLM-Prompt-Design

```
Analysiere dieses Ticket und schlage Priority, Severity und Component vor.

Titel: {title}
Beschreibung: {description}
Typ: {type}

Antworte ausschliesslich als JSON:
{"priority":"low|medium|high|critical","severity":"critical|major|minor|trivial","component":"<short name>","reasoning":"<1 Satz Begruendung>"}

Regeln:
- priority: low=kosmetisch, medium=beeinträchtigend, high=blockierend, critical=Datenverlust/Systemausfall
- severity: critical=Produktionsausfall, major=funktionale Einschränkung, minor=kleiner Fehler, trivial=Schönheitsfehler
- component: ein Wort oder Slash-Pfad, max 20 Zeichen (z.B. website/auth, brett, arena, infra)
- reasoning: maximal 1 Satz, warum diese Einordnung
```

## 4. Kommentar-Format

Der System-Kommentar wird als Markdown formatiert:

```
🤖 **Auto-Triage Vorschlag**
- **Priority:** hoch
- **Severity:** major
- **Component:** brett
- **Begründung:** Funktionale Einschränkung im Multiplayer-Modus betrifft aktive Nutzer.
```

## 5. Fehlerbehandlung

- `ANTHROPIC_API_KEY` fehlt → still no-op (log + return)
- LLM nicht erreichbar → log error, kein Kommentar (Ticket-Erstellung nicht blockiert)
- JSON-Parse-Fehler → Retry einmal, dann log + skip
- Leeres Titel+Beschreibung → skip (kein sinnvoller Triage möglich)

## 6. Nicht-Ziele

- Kein automatisches Setzen von severity/priority am Ticket (nur Vorschlag)
- Keine Änderung der bestehenden classify.ts (manueller Re-Classify-Button bleibt separat)
- Kein Webhook/Listener-Pattern — direkte Funktion nach Create
- Keine Batch-Triage bestehender Tickets (kann über den manuellen Endpunkt erfolgen)
