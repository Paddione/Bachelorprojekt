# Partial p1 — Datenebene: JSON-Schema + Beispiel-Einträge
**Role:** implementation | **Ticket:** T002468 | **Depends:** —

## Goal: `.lavish/styles/` mit Schema und 2 echten Beispiel-Einträgen anlegen

Neue Dateien: `.lavish/styles/schema.json`, `.lavish/styles/status-panel-akzent.json`, `.lavish/styles/rail-nav-tokens.json`

## schema.json

JSON-Schema (draft-07), das jeden Eintrag validiert:

- `id` (string, Pflicht, kebab-case)
- `name` (string, Pflicht, deutsch)
- `zweck` (string, Pflicht, deutsch — Gestaltungsabsicht)
- `herkunft` (object, Pflicht: `{ projekt, datei, zeile }`)
- `beleg_ausschnitt` (string, Pflicht — Code/HTML-Ausschnitt aus dem Referenz-Board)
- `token_bezuege` (array of string, Pflicht, `minItems: 1` — nur `--lv-*`/`--color-*`-Tokens)
- `tags` (array of string, optional)
- `additionalProperties: false`

## Zwei Beispiel-Einträge

Aus echten Kit-Board-Dateien im selben Worktree (`.lavish/reference-board.html`):

- **Eintrag 1** (`status-panel-akzent`): Beleg-Ausschnitt eines Panel-Rahmens/Status-Elements,
  `token_bezuege` ausschließlich Tokens aus `tokens.css` (`--color-accent` etc.).
- **Eintrag 2** (`rail-nav-tokens`): Beleg-Ausschnitt der Rail-Navigation,
  nur Token-Bezüge, keine festen Hex-/Pixel-Werte.

Beide `beleg_ausschnitt`-Werte **dürfen keine festen Farben/Größen** enthalten —
nur Token-Referenzen (D14 Regel 2).

## Acceptance

- `schema.json` validiert alle Pflichtfelder, `additionalProperties: false`
- Mindestens 2 Einträge vorhanden, beide gültig gegen schema.json
- Kein fester Hex-/Pixel-Wert in `token_bezuege` oder `beleg_ausschnitt`
- Keine Datei außerhalb von `.lavish/styles/` verändert
