# Partial p3 — Zugriff: Adapter `data.styles()` + Daemon-Route
**Role:** implementation | **Ticket:** T002468 | **Depends:** p1, p2

> **Achtung:** Dieser Partial hängt an K2 (T002461). `daemon/server.ts` und der
> Route-Mechanismus existieren erst nach K2-Merge (PR #3553). Der Branch wird
> vor diesem Partial auf main rebased. Nicht vor dem K2-Merge dispatchen.

## Goal: Modelle können die Stil-Datenbank über Adapter + Daemon abfragen

Geänderte Dateien: `.lavish/kit/adapter.js`, `.lavish/kit/daemon/server.ts`
Neue Datei: `.lavish/kit/daemon/routes/styles.ts`

## Daemon-Route

Neue Datei `routes/styles.ts` nach dem Muster `routes/cockpit.ts` (K2):

- `stylesHandler(c)` — liest `.lavish/styles/index.json` + die referenzierten
  Einträge (Repository-Root auflösen, z. B. via `process.cwd()`-basiertem Pfad
  oder konfigurierbarem `STYLES_DIR`), antwortet:

```json
{ "entries": [...], "fetchedAt": "<iso>" }
```

- Fehlerpfad (D13): bei nicht lesbarer Quelle `{ error: e.message, fetchedAt, staleSince }`
  statt stiller Null — exakt das `portfolioHandler`-Muster mit `setCache`.

In `server.ts` registrieren: `app.get('/api/cockpit/styles', stylesHandler)` —
Neben den bestehenden `/api/cockpit/*`-Routen (K2-Struktur).

## Adapter-Methode

In `adapter.js` (K2-Stand, 301 Zeilen) eine neue Methode ergänzen:

```js
styles: async () => {
  // GET ${BASE}/api/cockpit/styles, fetchedAt-Fallback wie fetchEndpoint
  // Rückgabe { entries, fetchedAt } | { error, fetchedAt }
}
```

Muster: wie `ticketAction`/`agentAction` (fetch auf `BASE`), aber GET und ohne Token.
**Kein Panel ruft `fetch()` direkt auf** — nur `data.styles()` (E1).

## Acceptance

- `GET /api/cockpit/styles` liefert `entries` aus `index.json` + `fetchedAt`
- Fehlerfall liefert `error` + `fetchedAt`, nie stille Null (D13)
- `adapter.js` exportiert `data.styles()`; kein direkter `fetch()` in `panel.js`
- Kein Test verändert; nur die 3 genannten Dateien
