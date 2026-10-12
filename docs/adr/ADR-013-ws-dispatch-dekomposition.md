# ADR-013: WS-Dispatch-Dekomposition — Handler-Module statt Riesen-Switch

**Status:** Accepted  
**Datum:** 2026-10-12  
**Ticket:** T901934

## Kontext

Der Code-Graph (68k Nodes, Stand 2026-10-11) wies zwei Dispatch-Funktionen als
Top-Komplexitäts-Hotspots aus:

- `components/brett/src/server/ws-admin-commands.ts::handleAdminMessage`
  (Komplexität 147, kognitiv 511, 29 Cases auf 479 Zeilen)
- `components/brett/src/client/ws-client.ts::onWsMessage`
  (Komplexität 100, kognitiv 288)

Jede neue Message-Sorte erhöhte die zyklomatische Komplexität genau einer
Funktion und machte Tests (Deps-Mock für 29 Typen) sowie Reviews (500+-Zeilen-
Diffs) schwerer. Gleichzeitig enthielten die Switches wörtliche Duplikate
(Undo/Redo-Re-Snapshot, Spotlight/Dim-Validierung, Leiter-Gate).

## Entscheidung

Message-Dispatches werden nach Domänen in Handler-Module zerlegt; die
ursprüngliche Funktion bleibt als dünner Router mit stabiler Signatur erhalten:

- Server: `ws-admin-session.ts`, `ws-admin-figures.ts`,
  `ws-admin-templates.ts`, `ws-admin-board.ts` — ein Handler pro Typ,
  Signatur `(ws, msg, room, deps)` analog zu `ws-figure-commands.ts`.
  `handleAdminMessage` delegiert pro Case (eine Zeile), `await` nur auf
  Pfaden, die schon vorher `await` enthielten (identisches Timing).
- Client: `ws-message-snapshot.ts`, `ws-message-figures.ts` — Snapshot mit
  typisiertem Kontext-Objekt (Lobby-/Moderations-Stores bleiben in
  `ws-client.ts`, selbes Getter/Setter-Pattern wie `ws-lobby-handlers.ts`).
- Exakte Intra-File-Duplikate werden dabei gefaltet (Undo/Redo-Snapshot,
  Spotlight/Dim, Leiter-Gate), rein mechanisch und ohne Verhaltensänderung.

Regel für die Zukunft: Wächst ein Dispatch über ~15 Cases oder enthält ein
Case mehr als ~40 Zeilen, wird er nach diesem Muster extrahiert, statt den
Switch weiter zu verlängern.

## Konsequenzen

- Plus: Handler sind einzeln les- und testbar (neue Tests:
  `brett/test/admin-undo-redo.test.ts`, `admin-round-moderation.test.ts`);
  Router-Diffs bleiben klein; Duplikat-Folds entfernen ~100 Zeilen.
- Neutral: Mehr Dateien pro Domäne (4 Server-, 2 Client-Module); Import-Kette
  `ws-admin-commands → ws-handler` bleibt wie zuvor (Modul-Zyklus bestand
  schon, Nutzung ist laufzeit-verzögert wie bei `ws-figure-commands.ts`).
- Risiko: keines für Verhalten — 679 brett-Tests, Client-/Server-Typecheck
  und bestehende Handler-Tests pinnen die Zerlegung (T901934).

## Gesehen-und-bewusst-behalten (Triage T901934)

Bei derselben Graph-Analyse als gesund befunden und NICHT geändert:

- Die 12 CALLS-Zyklen sind ereignis-getrieben (UI-Listener, setTimeout,
  Reconnect-Backoff, Queue-Drain), vendored (three.js, GLTFLoader) oder
  Resolver-Artefakte (`subprocess.run` → `run`, `raw.query` → Shim-`query`,
  `console.error` → Logger-`error`). Kein synchroner gratuitoser Zyklus.
- Strukturell ähnliche, aber absichtlich getrennte Paare bleiben getrennt:
  Story-Preview-Varianten, Skill-skript-eigene Utilities (`version_ge`,
  `api_request` — Skills sind Verteilungseinheiten), Backend-Varianten mit
  eigenen Signaturen.
