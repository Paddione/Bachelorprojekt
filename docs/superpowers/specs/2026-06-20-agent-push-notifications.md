---
ticket_id: T000991
plan_ref: openspec/changes/agent-push-notifications/tasks.md
status: active
date: 2026-06-20
---

# Spec: Agent-Push-Notifications für opencode/agy-Sessions

## Kern-Nutzerflow

Patrick arbeitet mit opencode- oder agy-Sessions (lokal oder remote). Wenn eine Session einen relevanten Status erreicht (gestartet, fertig, Mishap erkannt, PR geöffnet, Review nötig), sendet ein Hook eine HTTP-POST an einen self-hosted ntfy-Server. Patrick bekommt die Notification auf seinem Android-Smartphone via ntfy-App.

Patrick aktiviert die Notifications in Admin-Einstellungen (default: aus) — pro Quelle (opencode / agy) einzeln zuschaltbar.

## Event-Quellen

### opencode-Sessions

| Event | Trigger | Severity |
|-------|---------|----------|
| `session.started` | opencode-Session startet | niedrig |
| `session.completed` | Session erfolgreich beendet | mittel |
| `session.failed` | Session mit Fehler abgebrochen | kritisch |
| `mishap.detected` | Mishap-Tracker hat neuen Mishap angelegt | kritisch |
| `pr.opened` | Session hat PR geöffnet | hoch |
| `review.requested` | PR wartet auf Patricks Review | hoch |

### agy-Sessions

| Event | Trigger | Severity |
|-------|---------|----------|
| `task.assigned` | agy hat Task bekommen | niedrig |
| `task.completed` | Task erfolgreich abgeschlossen | mittel |
| `task.blocked` | Task blockiert (Wartet auf Input) | hoch |
| `task.failed` | Task fehlgeschlagen | kritisch |

## Akzeptanzkriterien

1. opencode/agy-Session-Events lösen HTTP-POST an ntfy-Server aus
2. Patrick bekommt Notification auf Android via ntfy-App
3. Notification enthält: Event-Typ, Session-ID/Ticket-ID, Timestamp, kurze Zusammenfassung
4. Opt-in pro Quelle in Admin-Einstellungen (default: aus)
5. ntfy-Topic pro Quelle (z.B. `bachelorprojekt-opencode`, `bachelorprojekt-agy`)

## Edge Cases

- ntfy-Server nicht erreichbar: Event wird geloggt, keine Blockade der Session
- Patrick hat ntfy-App nicht installiert: Events verhallen ungehört, aber ntfy speichert 24h
- Sehr viele Events (z.B. 10 Sessions parallel): Jedes Event einzeln — Patrick kann ntfy-Topic stummschalten
- Netzwerk-Timeout beim POST: Retry 3x mit Backoff, danach aufgeben und loggen

## Fehlerfall-Behandlung

- ntfy-Server kaputt: Events werden in lokales Logfile (`/var/log/agent-push.log`) geschrieben, Patrick kann per CLI einsehen
- Event-Payload fehlerhaft: Notification mit „Event unparseable — siehe Logs" + rohes Event in Body
- Authentifizierung fehlgeschlagen: Warn-Log, keine Retries

## Erfolgsmetrik

- Patrick sieht within 10s ein Session-Event auf seinem Handy
- ≥90% der Events kommen an (Telemetrie: sent vs. acked)
- False-Positive-Rate <5% (Notification die Patrick ignoriert)

## Technische Constraints

- **Quellen:** Nur opencode + agy (nicht Factory, nicht CI, nicht Deploy — enger Scope)
- **Backend:** ntfy self-hosted (existierende Infrastruktur möglich — Synapse-Server ist ähnlich, ggf. ntfy zusätzlich deployen)
- **Gruppierung:** Keine — jedes Event sofort (opencode-Sessions selten genug)
- **Opt-in:** Default aus, pro Quelle aktivierbar in Admin-Einstellungen
- **Ziel:** Nur Patrick (operative Events)
- **DSGVO:** ntfy-Topic-Auth, keine sensiblen Ticket-Inhalte im Notification-Body (nur Event-Typ + Ticket-ID + Link)

## Architektur-Skizze

```
opencode-Session ─┐
                   ├─→ Hook-Script ─→ HTTP-POST ─→ ntfy-Server ─→ Patrick's Android
agy-Session ──────┘                     ↑
                                        │
                            Admin-Einstellungen (Opt-in pro Quelle)
```

## Betroffene Dateien

- Neue `scripts/agent-push.sh` — universeller Push-Hook (nimmt Event-Typ, Payload, Quelle)
- Neue `k3d/ntfy.yaml` — ntfy-Deployment (falls nicht schon vorhanden)
- `website/src/lib/agent-push-settings.ts` — Opt-in-Verwaltung
- `website/src/pages/api/admin/agent-push/settings.ts` — Settings-API
- Neue `website/src/components/admin/AgentPushSettings.svelte` — UI für Opt-in
- opencode-Hook: `.opencode/hooks/session-end.sh` (oder ähnlich, je nach opencode-Hook-System)
- agy-Hook: entspricht agy-Hook-Mechanismus
