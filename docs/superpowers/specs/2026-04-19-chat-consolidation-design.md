# Chat-Konsolidierung: Direktnachrichten → Chat-Räume + ChatWidget-Expansion

**Datum:** 2026-04-19
**Status:** Approved

## Ziel

Das bisherige Direktnachrichten-System (1-zu-1 Admin↔Kunde via `message_threads`/`messages`) wird in das bestehende Chat-Räume-System migriert. Das ChatWidget wird zum primären Messaging-Interface ausgebaut — mit Raumliste und eingebettetem Nachrichten-Panel. Alle redundanten Seiten, Komponenten und API-Routen entfallen.

---

## Datenmodell

### Änderungen an `chat_rooms`

```sql
ALTER TABLE chat_rooms ADD COLUMN is_direct BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_rooms ADD COLUMN direct_customer_id TEXT;
```

- `is_direct=true` kennzeichnet einen 1-zu-1-Direktchat mit einem Kunden
- `direct_customer_id` enthält den Keycloak `sub` des Kunden
- Ein Direktraum pro Kunde (eindeutig via `is_direct=true AND direct_customer_id=<sub>`)

### Entfallende Tabellen

Nach erfolgreicher Migration:
- `message_threads` — DROP
- `messages` — DROP

### Kein weiteres Schema nötig

Alle anderen Chat-Tabellen (`chat_room_members`, `chat_messages`, `chat_message_reads`) bleiben unverändert und decken jetzt auch Direktchats ab.

---

## Datenmigration

Script: `scripts/migrate-messages-to-rooms.ts`

Ablauf für jeden `message_thread`:
1. Prüfe ob `chat_room` mit `is_direct=true AND direct_customer_id=<customer_id>` existiert
2. Falls nein: erstelle `chat_room` (name="Chat mit Admin", is_direct=true, created_by=admin-sub)
3. Füge Admin und Kunden als Members in `chat_room_members` ein
4. Übertrage alle `messages` → `chat_messages` (sender_id, body, created_at, sender_name)
5. Setze `chat_message_reads` Einträge für bereits gelesene Nachrichten (wo `read_at IS NOT NULL`)
6. Nach vollständigem Durchlauf: DROP TABLE messages, message_threads

**Dev/k3d:** Tabellen sind leer → Migration überspringbar, Schema-Änderung via Kustomize reicht.

---

## API-Änderungen

### Entfällt

| Route | Grund |
|---|---|
| `GET/POST /api/portal/messages` | Ersetzt durch rooms |
| `GET/POST /api/portal/messages/[threadId]` | Ersetzt durch rooms/[id]/messages |
| `GET /api/portal/nachrichten` | Obsolet |
| `GET/POST /api/admin/messages` | Ersetzt durch rooms |
| `GET/POST /api/admin/messages/[threadId]` | Ersetzt durch rooms/[id]/messages |

### Neu

**`POST /api/portal/rooms/ensure-direct`**
- Prüft ob für den eingeloggten User ein Direktraum (`is_direct=true`) existiert
- Falls nicht: erstellt Chat-Raum + fügt User und Admin als Members hinzu
- Gibt `{ room_id: number }` zurück
- Wird beim ersten Öffnen des ChatWidgets aufgerufen

### Angepasst

**`GET /api/portal/rooms`** — gibt jetzt auch Direkträume zurück (`is_direct` im Response-Objekt)

**`messaging-db.ts`** — alle Direktnachrichten-Funktionen entfernen:
- `getOrCreateThread`, `getThreadMessages`, `addMessage`, `markMessagesRead`, `getUnreadCount` (thread-basiert)
- `listRoomsWithInboxData` anpassen: liest aus `chat_rooms` inkl. `is_direct`

---

## ChatWidget UI

### Layout

Floating-Button unten rechts → Klick öffnet Popup (ca. 600×420px):

```
┌──────────────────────────────────────────────┐
│ 💬 Nachrichten                           [×] │
├──────────────┬───────────────────────────────┤
│ Allgemein  3 │  Allgemein                    │
│ Chat mit.. 1 │  ─────────────────────────── │
│ Projekt X    │  Admin: Hallo!       10:32    │
│              │  Du: Hi, danke!      10:33    │
│              │  ─────────────────────────── │
│              │  ┌─────────────────────────┐ │
│              │  │ Nachricht schreiben...  │ │
│              │  └──────────────────── [→] ┘ │
└──────────────┴───────────────────────────────┘
                                        [💬 2]
```

### Verhalten

- Floating-Button zeigt Gesamt-Unread-Count aller Räume
- Raumliste links: Name + Unread-Badge, sortiert nach letzter Aktivität
- Direktraum ("Chat mit Admin") erscheint immer oben in der Liste
- Beim ersten Öffnen: `ensure-direct` aufrufen, Direktraum automatisch selektieren
- Polling alle 5s (nur wenn Popup offen, nur aktiver Raum)
- Message-Rendering wiederverwendet Logik aus `ChatRoomPanel.svelte`

---

## Komponenten & Seiten

### Entfällt

| Datei | Grund |
|---|---|
| `src/components/MessagePanel.svelte` | Durch ChatRoomPanel-Logik im Widget ersetzt |
| `src/components/portal/NachrichtenSection.astro` | Raumliste jetzt im Widget |
| `src/pages/portal/nachrichten.astro` | Direktchat jetzt im Widget |
| `src/pages/admin/nachrichten.astro` | Admin nutzt /admin/raeume |

### Geändert

| Datei | Änderung |
|---|---|
| `src/components/ChatWidget.svelte` | Vollständiges Popup mit Raumliste + Message-Panel |
| `src/pages/portal/raum/[id].astro` | Bleibt (optionale Vollseiten-Ansicht für Räume) |
| `src/pages/admin/raeume.astro` | Direkträume erscheinen mit "Direkt"-Badge |

---

## Zusammenfassung aller Änderungen

| Bereich | Aktion |
|---|---|
| DB: `chat_rooms` | +`is_direct`, +`direct_customer_id` |
| DB: `message_threads`, `messages` | Droppen nach Migration |
| `messaging-db.ts` | Thread-Funktionen entfernen, Room-Funktionen erweitern |
| `ChatWidget.svelte` | Vollständiges Popup-UI |
| `MessagePanel.svelte` | Entfernen |
| `NachrichtenSection.astro` | Entfernen |
| `/portal/nachrichten.astro` | Entfernen |
| `/admin/nachrichten.astro` | Entfernen |
| `/api/portal/messages*` | Entfernen |
| `/api/admin/messages*` | Entfernen |
| `/api/portal/nachrichten` | Entfernen |
| `/api/portal/rooms/ensure-direct` | Neu |
| `scripts/migrate-messages-to-rooms.ts` | Neu (einmalig) |
