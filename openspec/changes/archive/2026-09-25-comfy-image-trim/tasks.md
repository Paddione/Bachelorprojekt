---
title: "comfy-image-trim — Implementation Plan"
ticket_id: T900386
domains: [llm, mcp, scripts, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# comfy-image-trim — Implementation Plan

_Ticket: T900386 · Design: `openspec/changes/comfy-image-trim/design.md` (D1–D4) · Mitgenommen: T900387
(Review-Fixes aus PR #5890, die vor dem Merge nicht mehr auf den Branch kamen — Cherry-Pick von 279209f1d und
815a6f0cb)._

## File Structure

| Datei | Aktion |
|---|---|
| `scripts/comfy-image-mcp/postprocess.py` | `--trim` (Zuschnitt zwischen Freistellung und Pixelate) |
| `scripts/comfy-image-mcp/lib.mjs` | `trim`-Default in `validateArgs`, neue reine Funktionen `postprocessArgs`, `needsPostprocess` |
| `scripts/comfy-image-mcp/server.mjs` | nutzt `postprocessArgs`/`needsPostprocess`, Tool-Schema um `trim` erweitert |
| `scripts/comfy-image-mcp/README.md` | `trim` dokumentiert |
| `tests/spec/llm-local-dev/comfy-image-postprocess.bats` | drei Trim-Tests |
| `tests/spec/llm-local-dev/comfy-image-mcp.bats` | Default-Regel über `postprocessArgs` |
| `components/website/src/data/test-inventory.json` | regeneriert |

Alle Dateien sind nicht gebaselined (`.mjs`/`.py` Limit 800); größte ist `server.mjs` mit rund 330 Zeilen.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Task 1 — Tests (RED)

- [ ] **1.1** Postprocess: kleines Motiv auf großer Leinwand → `--trim` liefert Motiv plus Rand (50×90);
  `--trim --pixelate 32` lässt das Motiv die längere Seite bis auf ≤ 2 px füllen; RGB-Bild bleibt bei `--trim`
  gleich groß.
- [ ] **1.2** MCP: `postprocessArgs(validateArgs(…).params, …)` enthält `--trim` bei `transparent` ohne `trim`,
  nicht bei `trim:false`, nicht ohne `transparent`.

```bash
COMFY_IMAGE_TEST_PYTHON=~/ComfyUI/.venv/bin/python tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/comfy-image-postprocess.bats tests/spec/llm-local-dev/comfy-image-mcp.bats
# expected: FAIL (4 Tests: --trim unbekannt, postprocessArgs fehlt)
```

## Task 2 — Umsetzung (GREEN)

- [ ] **2.1** `postprocess.py`: `trim(img)` — Bounding-Box der Pixel mit Alpha ≥ 128, Rand
  `max(1, round(0.02 × längere Seite))`, an Bildgrenzen beschnitten; ohne Alpha/ohne deckende Pixel unverändert.
- [ ] **2.2** `lib.mjs`: `trim` in `validateArgs` (Default = `transparent`), `postprocessArgs`, `needsPostprocess`.
- [ ] **2.3** `server.mjs`: Argumentbau und Rohbild-Entscheidung über die neuen Funktionen; Schema und
  Tool-Beschreibung um `trim`.
- [ ] **2.4** README.

## Task 3 — Final Verification

- [ ] **3.1** Tests aus Task 1 plus `glimmer-worker-mcp.bats` grün.
- [ ] **3.2** Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **3.3** Nach dem Merge den installierten Server neu starten (`systemctl --user restart comfy-image-mcp`) und
  einen Live-Sprite erzeugen.
