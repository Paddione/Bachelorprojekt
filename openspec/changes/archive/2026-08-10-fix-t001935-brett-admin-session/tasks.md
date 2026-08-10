# Tasks: brett admin_session_create-Ablehnung ohne UI-Feedback

## Task 1: Client error handler für admin_session_create

**Dateien:** `brett/src/client/ws-connection-client.ts`, `brett/src/client/main.ts`

1. In `ws-connection-client.ts`:prüfe ob der WebSocket-Message-Handler `error`-Nachrichten mit `reason: 'session-active'` behandelt
2. Falls nicht: füge einen Handler hinzu, der bei `session-active` eine UI-Benachrichtigung zeigt
3. Nutze die bestehende Toast-Infrastruktur (siehe `brett/src/client/ui/`)

## Task 2: Test schreiben

**Dateien:** `brett/test/lobby-admin-session-create.test.ts`

1. Erweitere den bestehenden Test um einen Fall, in dem der Server `error: session-active` zurückgibt
2. Prüfe dass der Client die Nachricht empfängt und verarbeitet

## Verify

```bash
cd brett && npm test
```
