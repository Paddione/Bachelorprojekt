# p2 — axe für Whiteboard (`fa-24-whiteboard.spec.ts`)

## Ziel
Neuer Test `T-axe: Whiteboard hat 0 critical/serious` nach dem Vorbild von
`a11y-axe.spec.ts:55-60` (Tags wcag2a/wcag2aa/wcag21a/wcag21aa, Filter
critical/serious, Befund-Ausgabe mit IDs + Targets). Basis-URL weiter
`BOARD_URL` (Default `http://board.localhost`, CI `https://board.mentolder.de`).

## Randbedingungen
- Upstream-Container (Nextcloud Whiteboard): Falls dessen UI prinzipbedingt
  Verstöße meldet (Fremd-UI — vgl. Nicht-Ziele des Goals: registrieren, nicht
  umgestalten), Test NICHT aufweichen, sondern Befund + `board`-Version in
  `phase-events.log` → PR-Body (Folge-Entscheidung, kein stiller Skip).
- `AUTH_CONFIG_ERROR`-Guard und T1/T2 unangetastet lassen.
- Kein Screenshot-Overhead ( Seite ist minimal).

## Gates
- Lokal (`BOARD_URL=http://board.localhost`, falls erreichbar) oder CI-URL:
  grün oder sauber dokumentierter Befund.
