# Proposal: comfy-image-trim

## Why

Qwen-Image zeichnet ein freigestelltes Motiv mit viel Rand. Pixelate verkleinert bisher die ganze Leinwand, sodass
ein 64-px-Sprite nur zu einem Drittel aus dem Motiv besteht (Live-Test T900379: Ritter bei `size: 64`). Für
Game-Sprites ist das unbrauchbar ohne Handarbeit.

## What

- Neuer Parameter `trim` für `image_generate`. Default: an, wenn `transparent: true`; `trim: false` behält die
  volle Leinwand.
- `postprocess.py --trim` schneidet nach der Freistellung auf die Bounding-Box der deckenden Pixel zu und lässt
  einen kleinen transparenten Rand (2 % der längeren Seite, mindestens 1 px), **vor** dem Pixelate.
- Ohne Alphakanal oder ohne deckende Pixel ist `--trim` wirkungslos.
- Die Übersetzung der Job-Parameter in `postprocess.py`-Argumente wandert als reine Funktion nach `lib.mjs`,
  damit sie testbar ist.

_Ticket: T900386_
