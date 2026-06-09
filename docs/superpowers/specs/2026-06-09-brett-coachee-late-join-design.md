# Design: Brett — Coachee Late-Join

**Datum:** 2026-06-09  
**Branch:** feature/brett-coachee-late-join  
**Ticket:** TBD

## Kontext & Problem

Der Host (Leiter) einer Brett-Session kann technisch bereits ohne Coachee starten — `canStart: opts.isLeader` hat keine Coachee-Prüfung, und der Join-Handler auf dem Server funktioniert in allen Phasen. **Was fehlt:** Sobald die Runde startet und die UI in den Board-View wechselt, verschwindet der Session-Code vollständig. Es gibt kein Invite-Mechanismus im Board-View, keine Benachrichtigung wenn jemand mid-session beitritt, und kein Teilnehmer-Panel für Rollenverwaltung.

## Ziele

1. Host kann Session starten und den Invite-Link danach noch teilen
2. Coachee kann mit einem Link während laufender Runde beitreten
3. Leiter wird benachrichtigt wenn jemand beitritt
4. Leiter kann Rollen über ein Teilnehmer-Panel zuweisen

## Nicht in Scope

- Server-seitige Änderungen (kein neuer Endpoint, kein Protokoll-Change)
- Automatische Rollenzuweisung beim Beitritt
- QR-Code-Generierung
- Änderungen am Lobby-Flow

## Architektur

Drei neue Client-UI-Module, minimale Änderungen an zwei bestehenden Dateien.

### Neue Dateien

```
brett/src/client/ui/
├── topbar-invite.ts        # "Einladen"-Button + Popup + Clipboard
├── topbar-participants.ts  # 👥-Button + Teilnehmer-Panel + Rollenzuweisung
└── late-join-toast.ts      # Toast-Benachrichtigung für Late-Join
```

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `brett/public/index.html` | Zwei neue Button-Slots im Topbar |
| `brett/src/client/board-boot.ts` | Beide Module mounten, Late-Join-Hook registrieren |
| `brett/src/client/ws-client.ts` | `setLateJoinHandler(cb)` hinzufügen |

## Komponenten-Design

### `topbar-invite.ts`

```typescript
export function mountInviteButton(anchorEl: HTMLElement, getSessionCode: () => string | null): void
```

- Rendert "Einladen"-Button im Topbar
- **Nur sichtbar wenn** `getSessionCode()` einen Wert zurückgibt
- **Klick-Verhalten:**
  1. `navigator.clipboard.writeText(buildInviteUrl(code))` — sofort
  2. Öffnet Dropdown-Popup direkt unter dem Button mit:
     - Vollständiger Link als selektierbarer Text
     - "Kopiert ✓"-Bestätigung für 2 Sekunden, dann zurück zu normalem Text
- `buildInviteUrl(code)`: `${window.location.origin}/api/join?code=${encodeURIComponent(code)}`
- Popup schließt bei Klick außerhalb

### `topbar-participants.ts`

```typescript
export function mountParticipantsButton(
  anchorEl: HTMLElement,
  deps: {
    getLobbyState: () => LobbyState;
    sendClient: (msg: ClientMessage) => void;
    isLeiter: () => boolean;
  }
): { update: () => void }
```

- Rendert 👥-Button im Topbar
- **Toggle-Panel** (öffnet/schließt bei Klick)
- **Panel-Inhalt:** Roster-Liste — pro Teilnehmer: Farb-Dot + Name + aktuelle Rolle
- **Rollenzuweisung (nur Leiter):** Dropdown neben jedem Eintrag mit Optionen `beobachter | stellvertreter`
  - Auswahl sendet `{ type: 'admin_assign_role', targetPlayerId, role }` via `sendClient`
- `update()`: re-rendert den Panel-Inhalt aus dem aktuellen Lobby-State — wird von `board-boot.ts` bei jedem `lobbyChangeHandler`-Event aufgerufen

### `late-join-toast.ts`

```typescript
export function showLateJoinToast(name: string): void
```

- Rendert einen Toast oben rechts im Viewport
- Text: `"[name] ist beigetreten"`
- Auto-dismiss nach 3 Sekunden (CSS-Animation)
- Mehrere gleichzeitige Toasts stacken vertikal
- Kein interaktiver Button — Rollenzuweisung erfolgt über das Panel

## Datenfluss

### Late-Join-Erkennung in `ws-client.ts`

```typescript
let lateJoinHandler: ((name: string) => void) | null = null;
export function setLateJoinHandler(cb: typeof lateJoinHandler): void { lateJoinHandler = cb; }

// In der presence_join-Verarbeitung:
// Nur feuern wenn Phase active oder paused (nicht lobby)
if (msg.type === 'presence_join' && currentPhase !== 'lobby' && currentPhase !== null) {
  lateJoinHandler?.(msg.participant?.name ?? 'Unbekannt');
}
```

### Verdrahtung in `board-boot.ts`

```typescript
// Nach Board-Mount:
const inviteCleanup = mountInviteButton(topbarEl, () => wsClient.getLobbyState().sessionCode);

const participantsPanel = mountParticipantsButton(topbarEl, {
  getLobbyState: wsClient.getLobbyState,
  sendClient: wsClient.sendClient,
  isLeiter: () => myRole === 'leiter',
});

wsClient.setLateJoinHandler((name) => {
  if (myRole === 'leiter') showLateJoinToast(name);
  participantsPanel.update();
});

// Bestehenden lobbyChangeHandler erweitern:
wsClient.setLobbyChangeHandler(() => {
  participantsPanel.update();
  // ...existing lobby re-render logic...
});
```

## HTML-Struktur (index.html Topbar)

```html
<!-- Bestehender Topbar -->
<div id="topbar">
  <!-- ... bestehende Elemente ... -->
  <div id="topbar-invite-slot"></div>      <!-- NEU -->
  <div id="topbar-participants-slot"></div> <!-- NEU -->
  <!-- ... -->
</div>
```

## Tests

Neue Testdateien in `brett/test/`:

| Datei | Testfälle |
|-------|-----------|
| `topbar-invite.test.ts` | Button sichtbar/unsichtbar je sessionCode; Popup öffnet/schließt; clipboard wird mit korrekter URL aufgerufen; "Kopiert"-Feedback erscheint |
| `topbar-participants.test.ts` | Panel zeigt Roster korrekt; Rollenwechsel sendet korrektes WS-Nachricht; Dropdown nur für Leiter sichtbar; `update()` re-rendert bei State-Änderung |
| `late-join-toast.test.ts` | Toast erscheint mit korrektem Namen; Auto-dismiss nach 3s (fake timers); mehrere Toasts stacken |

Schätzung: ~10-14 neue Unit-Tests.

## Aufwand-Schätzung

| Aufgabe | Geschätzte Stunden |
|---------|--------------------|
| `topbar-invite.ts` + Tests | 1.5h |
| `topbar-participants.ts` + Tests | 2h |
| `late-join-toast.ts` + Tests | 1h |
| `ws-client.ts` Late-Join-Hook | 0.5h |
| `board-boot.ts` Verdrahtung | 0.5h |
| `index.html` Topbar-Slots | 0.5h |
| **Gesamt** | **~6h** |
