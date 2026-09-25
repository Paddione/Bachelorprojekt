---
ticket_id: T900386
plan_ref: openspec/changes/comfy-image-trim/tasks.md
status: active
date: 2026-09-25
---

# Design: comfy-image-trim

_Ticket: T900386 · Parent-Spec: `llm-local-dev` · Vorgänger: T900379 (`comfy-image-mcp`)_

## Befund

Live-Lauf 2026-09-25 (`image_generate {transparent:true, pixelate:{size:64,colors:16,scale:4}, seed:7}`): Das
Motiv füllte etwa ein Drittel der Höhe des 64-px-Sprites, weil `pixelate` die 768²-Leinwand samt leerem Rand
verkleinert.

## Entscheidungen

- **D1 — Default an bei `transparent`.** Vom Nutzer entschieden (2026-09-25). `trim` fehlt → `trim = transparent`.
  Explizites `trim: false` behält die Leinwand (z. B. wenn mehrere Sprites dieselbe Leinwandgröße brauchen).
- **D2 — Zuschnitt in `postprocess.py`.** Neue Stufe zwischen Freistellung und Pixelate: Bounding-Box der Pixel
  mit Alpha ≥ 128 (dieselbe Schwelle wie das harte Alpha im Pixelate), erweitert um
  `max(1, round(0.02 × längere Seite))` px, auf die Bildgrenzen beschnitten. Kein Alphakanal oder keine deckenden
  Pixel → unverändert (kein Fehler), damit `trim` ohne `transparent` harmlos bleibt.
- **D3 — Seitenverhältnis bleibt frei.** Kein Auffüllen auf ein Quadrat: `pixelate.size` gilt weiter für die
  längere Seite; ein hoher Ritter wird z. B. 64 hoch und schmaler.
- **D4 — Argument-Bau als reine Funktion.** `postprocessArgs(params, inPath, outPath)` in `lib.mjs` liefert die
  Argumentliste für `postprocess.py`; `server.mjs` nutzt sie. Das macht die Default-Regel und die Weitergabe von
  `--trim` ohne GPU und ohne Server testbar.

## Tests

- `tests/spec/llm-local-dev/comfy-image-postprocess.bats`: kleines Motiv auf großer transparenter Leinwand —
  `--trim` liefert die Motivgröße plus Rand; `--trim --pixelate 32` lässt das Motiv die 32 px der längeren Seite
  ausfüllen (deckende Pixel berühren oben und unten fast den Rand); Bild ohne Alpha bleibt bei `--trim` gleich groß.
- `tests/spec/llm-local-dev/comfy-image-mcp.bats`: `postprocessArgs` per `node` — `transparent` ohne `trim` enthält
  `--trim`, mit `trim:false` nicht, ohne `transparent` nicht.
