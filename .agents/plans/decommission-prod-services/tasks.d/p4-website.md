# p4 — Website Produkt-Code (Whiteboard) entfernen

Ziel: Whiteboard aus der Website schneiden. Abhängig von nichts; disjunkt zu p1–p3/p5.

## Löschen

- `components/website/src/lib/whiteboard.ts` + `components/website/src/lib/whiteboard.test.ts`
- `apps/whiteboard/app.yaml` — VORHER Katalog-Generator prüfen (wer liest `apps/*/app.yaml`?
  Falls Generator Whiteboard-Slug hart erwartet, Generator mit anpassen oder Eintrag als
  `retired` markieren statt Datei zu löschen).

## Editieren (Whiteboard-Pfade herausschneiden, Rest erhalten)

- `components/website/src/pages/api/meeting/finalize.ts`,
  `components/website/src/pages/api/meeting/save-transcript.ts`: Whiteboard-Import + zugehörige
  Handler-Pfade entfernen; Meetings ohne Whiteboard müssen bauen und laufen.
- `components/website/src/lib/meetings-db.ts`, `components/website/src/lib/system-test-seed-data.ts`:
  nur Whiteboard-Refs entfernen.
- Importer checken: `grep -rn "lib/whiteboard" components/website/src` — alle Treffer abarbeiten.

## Leitplanken

- KEINE DB-Migration (Spalten bleiben ungenutzt stehen; Brand korczewski frozen, T002479).
- Falls `finalize.ts`/`save-transcript.ts` ohne Whiteboard-Pfad sinnlos werden: Endpunkte als Ganzes
  entfernen + Router-/Nav-Refs nachziehen (im Partial dokumentieren).

## Verify dieses Partials

`npm run typecheck --prefix components/website` grün; Vitest der geänderten Bereiche grün;
`grep -rn "whiteboard" components/website/src` trifft nur p6-Allowlist.
