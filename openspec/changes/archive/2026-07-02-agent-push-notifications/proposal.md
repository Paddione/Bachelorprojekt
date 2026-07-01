---
ticket_id: T000991
status: planning
title: "Proposal: agent-push-notifications"
date: 2026-06-20
plan_ref: openspec/changes/agent-push-notifications/tasks.md
spec_ref: docs/superpowers/specs/2026-06-20-agent-push-notifications.md
---

# Proposal: agent-push-notifications

_Ticket: T000991_

## Why

Patrick arbeitet mit opencode- oder agy-Sessions (lokal oder remote). Wenn eine Session einen
relevanten Status erreicht (gestartet, fertig, Mishap erkannt, PR geöffnet, Review nötig), erfährt
er davon aktuell nur, wenn er aktiv ins Terminal schaut. Bei langlaufenden Sessions oder
Hintergrund-Tasks der agy-Factory gehen fertige/blockierte Status unbemerkt vorbei.

Ein Push-Hook sendet diese Events als HTTP-POST an einen self-hosted ntfy-Server. Patrick bekommt die
Notification auf seinem Android-Smartphone via ntfy-App — within 10s nach dem Event. Opt-in pro Quelle
(opencode / agy), default aus, DSGVO-konform (Topic-Auth, keine sensiblen Ticket-Inhalte im Body).

## What

### Kern-Nutzerflow

Patrick aktiviert die Notifications in den Admin-Einstellungen der Website (default: aus) — pro Quelle
(opencode / agy) einzeln zuschaltbar. Ein universelles Hook-Script (`scripts/agent-push.sh`) nimmt
Event-Typ + Payload + Quelle entgegen, prüft den Opt-in-Status über die Website-API (fail-closed),
und sendet bei Freigabe einen HTTP-POST an den ntfy-Server. Patrick subscribt in der ntfy-App auf die
Topics `bachelorprojekt-opencode` und `bachelorprojekt-agy`.

### Event-Quellen

**opencode-Sessions**

| Event | Trigger | Severity |
|-------|---------|----------|
| `session.started` | opencode-Session startet | niedrig |
| `session.completed` | Session erfolgreich beendet | mittel |
| `session.failed` | Session mit Fehler abgebrochen | kritisch |
| `mishap.detected` | Mishap-Tracker hat neuen Mishap angelegt | kritisch |
| `pr.opened` | Session hat PR geöffnet | hoch |
| `review.requested` | PR wartet auf Patricks Review | hoch |

**agy-Sessions**

| Event | Trigger | Severity |
|-------|---------|----------|
| `task.assigned` | agy hat Task bekommen | niedrig |
| `task.completed` | Task erfolgreich abgeschlossen | mittel |
| `task.blocked` | Task blockiert (Wartet auf Input) | hoch |
| `task.failed` | Task fehlgeschlagen | kritisch |

### Architektur-Skizze

```
opencode-Session ─┐
                   ├─→ agent-push.sh ─→ Opt-in-Check (Website-API) ─→ HTTP-POST ─→ ntfy-Server ─→ Patrick's Android
agy-Session ──────┘                                          ↑
                                                   Admin-Einstellungen (Opt-in pro Quelle)
```

### Neue Artefakte

- **`k3d/ntfy.yaml`** — ntfy-Deployment (Image `binwiederhier/ntfy`), Service, Traefik-IngressRoute,
  Topic-Auth via Access-Token (SealedSecrets). Self-hosted, DSGVO-relevant, shared base manifest.
- **`scripts/agent-push.sh`** — universeller Push-Hook: Opt-in-Check → HTTP-POST → Retry 3x → Fallback-Log.
- **`.opencode/hooks/session-start.sh` / `session-end.sh`** — opencode-Session-Lifecycle-Hooks.
- **`.agy/hooks/task-event.sh`** — agy-Task-Lifecycle-Hook.
- **`website/src/lib/agent-push-settings.ts`** — Opt-in-Verwaltung (DB-Read/Write).
- **`website/src/pages/api/admin/agent-push/settings.ts`** — Settings-API (GET/POST, admin-guarded).
- **`website/src/components/admin/AgentPushSettings.svelte`** — UI-Toggle pro Quelle.

### Akzeptanzkriterien

1. opencode/agy-Session-Events lösen HTTP-POST an ntfy-Server aus.
2. Patrick bekommt Notification auf Android via ntfy-App.
3. Notification enthält: Event-Typ, Session-ID/Ticket-ID, Timestamp, kurze Zusammenfassung.
4. Opt-in pro Quelle in Admin-Einstellungen (default: aus).
5. ntfy-Topic pro Quelle (`bachelorprojekt-opencode`, `bachelorprojekt-agy`).

### Edge Cases

- ntfy-Server nicht erreichbar: Event wird geloggt, keine Blockade der Session.
- Patrick hat ntfy-App nicht installiert: Events verhallen ungehört, aber ntfy speichert 24h.
- Sehr viele Events (z.B. 10 Sessions parallel): Jedes Event einzeln — Patrick kann ntfy-Topic
  stummschalten.
- Netzwerk-Timeout beim POST: Retry 3x mit Backoff, danach aufgeben und loggen.
- Opt-in-API nicht erreichbar: fail-closed — kein Push (DSGVO-sicher).

### Fehlerfall-Behandlung

- ntfy-Server kaputt: Events werden in lokales Logfile (`/var/log/agent-push.log`) geschrieben,
  Patrick kann per CLI einsehen.
- Event-Payload fehlerhaft: Notification mit „Event unparseable — siehe Logs" + rohes Event in Body.
- Authentifizierung fehlgeschlagen: Warn-Log, keine Retries.

### Erfolgsmetrik

- Patrick sieht within 10s ein Session-Event auf seinem Handy.
- >=90% der Events kommen an (Telemetrie: sent vs. acked).
- False-Positive-Rate <5% (Notification die Patrick ignoriert).

### Technische Constraints

- **Quellen:** Nur opencode + agy (nicht Factory, nicht CI, nicht Deploy — enger Scope).
- **Backend:** ntfy self-hosted (im dev-Cluster via `k3d/ntfy.yaml` deployt).
- **Gruppierung:** Keine — jedes Event sofort (opencode-Sessions selten genug).
- **Opt-in:** Default aus, pro Quelle aktivierbar in Admin-Einstellungen.
- **Ziel:** Nur Patrick (operative Events).
- **DSGVO:** ntfy-Topic-Auth, keine sensiblen Ticket-Inhalte im Notification-Body
  (nur Event-Typ + Ticket-ID + Link).

### GIVEN / WHEN / THEN

**GIVEN** Patrick hat opencode-Notifications in den Admin-Einstellungen aktiviert
**WHEN** eine opencode-Session endet mit Exit-Code 0
**THEN** sendet `agent-push.sh opencode session.completed <session-id>` einen POST an das Topic
`bachelorprojekt-opencode` und Patrick sieht innerhalb 10s die Notification auf seinem Handy.

**GIVEN** opencode-Opt-in ist deaktiviert (default)
**WHEN** eine Session endet
**THEN** sendet `agent-push.sh` keinen POST (fail-closed), schreibt nur einen Skip-Eintrag ins Logfile.

**GIVEN** der ntfy-Server ist nicht erreichbar
**WHEN** `agent-push.sh` versucht zu senden
**THEN** retryt 3x mit Backoff, gibt danach auf, loggt das Event nach `/var/log/agent-push.log`
und beendet sich mit exit 0 (Session wird nicht blockiert).
