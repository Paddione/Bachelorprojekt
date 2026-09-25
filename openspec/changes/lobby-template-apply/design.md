# Design: lobby-template-apply (T900361)

## Problem
Leiter wählt im Lobby-Dropdown ein System-Szenario (z. B. Familiensystem),
aber es erscheinen keine vordefinierten Figuren. Der manuelle
Board-Template-Pfad war nie Ende-zu-Ende verdrahtet (präexistent, vor T900360).

## Root Cause (zwei Brüche)
1. **Client:** `lobby.ts:95` deklariert `onSetBoardTemplate`, `lobby.ts:155`
   ruft `handlers.onSetBoardTemplate?.(id)` auf — aber `main.ts`
   `renderLobby` (Zeilen 65–81) übergibt den Handler nicht. Optional
   Chaining → stiller No-op.
2. **Server:** `ADMIN_TYPES` (`ws-handler.ts:101–113`) enthält
   `admin_set_board_template` nicht → Gate `ws-connection.ts:327` routet
   nie zu `handleAdminMessage` → Case `ws-admin-commands.ts:287` ist
   Dead Code (einziger Caller von `handleAdminMessage`).

## Fix (zwei Zeilen + Feedback)
1. `ws-handler.ts`: `'admin_set_board_template'` in `ADMIN_TYPES`
   aufnehmen (gleicher Keycloak-admin-ODER-leiter-Gate wie Reset).
2. `main.ts` `renderLobby`: `onSetBoardTemplate`-Eintrag ergänzen,
   leiter-gated wie `onSetTemplate`/`onSetOptik`, sendet
   `{ type: 'admin_set_board_template', boardTemplateId: id }`
   (Typ existiert bereits in `messages.ts:29`).
3. **Client-Feedback (Scope MIT):** Server sendet bei unbekannter
   Template-ID `{ type: 'error', reason: 'unknown-board-template' }`
   an den Sender (`ws-admin-commands.ts`); Client mappt die Reason in
   `ws-client.ts` (Generik `ws-client.ts:463–469` existiert) auf den
   Toast-Text `Vorlage nicht gefunden.` (`showExportToast`,
   `ui/export-toast.ts`-Präzedenz).

## Verworfene Alternativen
- Lobby-Dropdown direkt auf Reset-Pfad umbiegen: verliert die
  Template-Auswahl ( Familiensystem vs. Team-Konflikt vs. Innere Anteile).
- Nur Server fixen: Dropdown bleibt No-op (Break 1) — kein Effekt.
- Nur Client fixen: Nachricht wird am Gate gedroppt (Break 2).

## Tests
- BATS `tests/spec/brett.bats` (ROT vor Fix, GRÜN danach):
  (a) ADMIN_TYPES enthält `admin_set_board_template`,
  (b) `main.ts` verdrahtet `onSetBoardTemplate`,
  (c) unbekannte ID → Sender-Error `unknown-board-template`,
  (d) Client mappt Reason auf Toast `Vorlage nicht gefunden.`
- Manueller Browser-Check (Leiter): Szenario wählen → Figuren erscheinen;
  ungültige ID → Fehler-Toast.
