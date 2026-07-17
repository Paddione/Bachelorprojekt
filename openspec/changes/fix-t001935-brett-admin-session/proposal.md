# Fix: brett admin_session_create-Ablehnung ohne UI-Feedback

## Purpose

Wenn ein Admin versucht, eine neue Brett-Sitzung zu erstellen, während bereits eine aktive/pausierte Sitzung läuft, sendet der Server eine `error`-Nachricht mit `reason: 'session-active'`. Der Client zeigt jedoch kein Feedback — der Menü-Button wirkt tot.

## Scope

- Client-seitige Behandlung der `error`-Nachricht vom Server
- UI-Feedback wenn Session aktiv/pausiert ist (Toast oder Hinweis)
- Kein Server-seitiger Code nötig (Logik ist korrekt in `ws-admin-commands.ts:71-73`)
