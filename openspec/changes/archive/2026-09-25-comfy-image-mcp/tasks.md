---
title: "comfy-image-mcp — Implementation Plan"
ticket_id: T900379
domains: [llm, mcp, scripts, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# comfy-image-mcp — Implementation Plan

_Ticket: T900379 · Design: `openspec/changes/comfy-image-mcp/design.md` (D1–D7) · Delta: `specs/llm-local-dev.md`._

**Ziel:** Muse Code (WSL und Windows) erzeugt über `image_generate`/`image_result`/`image_status` Bilder mit
dem lokalen ComfyUI (Qwen-Image 2.1, RTX 3060 Ti), optional freigestellt und verpixelt, direkt in einen
Git-Arbeitsbaum. ComfyUI läuft nur bei Bedarf. Ein Partial, sequentiell.

## File Structure

| Datei | Aktion |
|---|---|
| `scripts/lib/wsl-paths.mjs` | neu — `toWslPath`, `isGitWorkTree` (aus glimmer `lib.mjs` extrahiert, D1) |
| `scripts/glimmer-worker-mcp/lib.mjs` | geändert — importiert und re-exportiert beide Funktionen aus `scripts/lib/wsl-paths.mjs` |
| `scripts/comfy-image-mcp/lib.mjs` | neu — reine Logik: Argument-Validierung, `out_path`-Prüfung (D3), Workflow-Befüllung über Klassennamen (D5), Job-Queue mit Leerlauf-Callback (D4) |
| `scripts/comfy-image-mcp/comfy-client.mjs` | neu — HTTP gegen ComfyUI (`/system_stats`, `/prompt`, `/history`, `/view`, `/interrupt`), Bedarfsstart/-stopp über `COMFY_IMAGE_SYSTEMCTL` |
| `scripts/comfy-image-mcp/server.mjs` | neu — HTTP/JSON-RPC-Hülle, drei Tools, Job-Runner |
| `scripts/comfy-image-mcp/workflow.json` | neu — API-Vorlage aus `~/ComfyUI/qwen-workflow-api.json` |
| `scripts/comfy-image-mcp/postprocess.py` | neu — Freistellung (`rembg`) und Pixelate (Pillow), D6 |
| `scripts/comfy-image-mcp/package.json` | neu — `{"type":"module","private":true}` |
| `scripts/comfy-image-mcp/comfyui.service` | neu — User-Unit ohne `WantedBy`, Werte aus `start-qwen.sh` |
| `scripts/comfy-image-mcp/comfy-image-mcp.service` | neu — User-Unit des MCP-Servers |
| `scripts/comfy-image-mcp/install.sh` | neu — pip-Abhängigkeiten, Token, Units (kopiert), Registrierung (D7) |
| `scripts/comfy-image-mcp/README.md` | neu — Zweck, Tools, Asset-Eignung, Installation, Grenzen |
| `taskfiles/Taskfile.llm.yml` | Task `comfy-image:install` |
| `tests/spec/llm-local-dev/comfy-image-mcp.bats` | neu — Laufzeittests gegen den echten Server mit Fake-ComfyUI und Fake-`systemctl` |
| `tests/spec/llm-local-dev/fake-comfyui.py` | neu — Stub-Server für die BATS-Tests |
| `tests/spec/llm-local-dev/comfy-image-postprocess.bats` | neu — Tests für `postprocess.py` |
| `openspec/specs/llm-local-dev.md` | über Archiv-Merge des Deltas |
| `components/website/src/data/test-inventory.json` | regeneriert |

S1-Budgets (Limits `.mjs` 800, `.sh` 800, `.py` 800; keine der geänderten Dateien ist gebaselined):

| Datei | Ist | Budget |
|---|---|---|
| `scripts/glimmer-worker-mcp/lib.mjs` | 170 | 630 |
| `taskfiles/Taskfile.llm.yml` | 212 | – (kein S1-Limit für `.yml`) |

Zielgrößen neuer Dateien: `server.mjs` < 320, `lib.mjs` < 250, `comfy-client.mjs` < 200,
`postprocess.py` < 150, `install.sh` < 170, `fake-comfyui.py` < 120 Zeilen.
`scripts/glimmer-worker-mcp/lib.mjs` wird durch die Extraktion kleiner (≈ −20 Zeilen).

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Task 1 — Laufzeittests zuerst (RED)

- [ ] **1.1** `tests/spec/llm-local-dev/fake-comfyui.py` anlegen: `http.server` auf einem per Argument
  übergebenen Port. `GET /system_stats` → `{"devices":[{"name":"cuda:0 fake","vram_total":8589934592,"vram_free":6442450944}]}`;
  `POST /prompt` → speichert den Body als `last_prompt.json` im Verzeichnis aus env `FAKE_COMFY_DIR`,
  antwortet `{"prompt_id":"p1","number":0,"node_errors":{}}`; enthält der Prompt-Text `FAIL_PROMPT`, antwortet
  er HTTP 400 mit `{"error":{"message":"bad"},"node_errors":{"1":{"errors":[{"message":"bad node"}]}}}`;
  `GET /history/p1` → `{"p1":{"status":{"status_str":"success","completed":true},"outputs":{"9":{"images":[{"filename":"x.png","subfolder":"","type":"output"}]}}}}`;
  `GET /view` → ein 64×64-PNG (mit Pillow erzeugt, falls vorhanden, sonst ein eingebettetes Base64-PNG);
  `POST /interrupt` → `{}`.
- [ ] **1.2** `tests/spec/llm-local-dev/comfy-image-mcp.bats` anlegen. Kopfkommentar: SSOT
  `openspec/specs/llm-local-dev.md` mit den fünf Requirement-Namen, Prüfmodus Output-Verifikation.
  - `setup_file`: zwei freie Ports (MCP und Fake-ComfyUI), Token `test-token`. Fake-`systemctl` in
    `$BATS_FILE_TMPDIR/bin/systemctl`: hängt `"$*"` an `$BATS_FILE_TMPDIR/systemctl.log`; bei
    `--user start comfyui` startet es `fake-comfyui.py` im Hintergrund und schreibt dessen PID nach
    `fake.pid`; bei `--user stop comfyui` beendet es diesen Prozess. Fake-Python `postprocess`:
    `COMFY_IMAGE_PYTHON` zeigt auf `python3`. Temp-Git-Repo `repo/assets` mit einem Commit, Ordner `nogit`.
    Server mit `COMFY_IMAGE_MCP_PORT`, `COMFY_IMAGE_MCP_TOKEN`, `COMFY_IMAGE_URL=http://127.0.0.1:<fake>`,
    `COMFY_IMAGE_SYSTEMCTL=$BATS_FILE_TMPDIR/bin/systemctl`, `COMFY_IMAGE_IDLE_S=3`,
    `COMFY_IMAGE_TIMEOUT_FLOOR_S=1` starten, auf `/health` warten; `teardown_file` beendet Server und Fake.
  - Tests (je einer pro Szenario):
    1. `/health` liefert `ok: true` (Positiv-Anker).
    2. `tools/list` ohne Bearer → HTTP 401; mit Bearer → genau `image_generate,image_result,image_status`.
    3. `image_generate` mit `out_path` in `nogit/` → `isError`, und `systemctl.log` enthält kein `start`.
    4. `image_generate` mit `out_path` auf eine vorhandene Datei ohne `overwrite` → `isError`, Datei unverändert
       (`sha256sum` vorher/nachher gleich).
    5. `image_generate` mit `out_path` `repo/assets/hero.png`, Prompt `a red fox` → `job_id`;
       `image_result` (`wait_s` 20) → `status` `done`, `seed` ist eine Zahl, Datei existiert und beginnt mit
       der PNG-Signatur, `git_status` nennt `assets/hero.png`; `systemctl.log` enthält `--user start comfyui`;
       `last_prompt.json` enthält `a red fox` und den gemeldeten Seed.
    6. Windows-Form: `out_path` als `\\wsl.localhost\<distro>\…` des Temp-Repos → `done`.
    7. `FAIL_PROMPT` → `status` `failed`, `error` enthält `bad node`.
    8. `image_generate` mit `transparent: true, pixelate: {size: 16, colors: 4}` → `done`, zusätzlich existiert
       `assets/sprite.raw.png`; `last_prompt.json` enthält `plain white background`. Skip, wenn
       `python3 -c 'import PIL'` scheitert (`skip "Pillow not installed"`) oder `rembg` fehlt
       (`skip "rembg not installed"`).
    9. Auto-Stopp: nach dem letzten Job `sleep 5` → `systemctl.log` enthält `--user stop comfyui`;
       `image_status` meldet danach `comfy.ok` false.
- [ ] **1.3** `tests/spec/llm-local-dev/comfy-image-postprocess.bats` anlegen. `setup`: `python3 -c 'import PIL'`
  sonst `skip "Pillow not installed"`. Erzeugt per Python ein 256×256-RGBA-Bild mit weichem Kreis (Farbverlauf,
  Alpha-Rand). Tests:
    1. `--pixelate 32 --colors 8` → längere Seite 32, höchstens 8 deckende Farben, alle Alpha-Werte ∈ {0,255}.
    2. `--pixelate 32 --colors 8 --scale 4` → Größe 128, jeder 4×4-Block einfarbig.
    3. `--transparent` → Modus RGBA; Skip ohne `rembg` (`skip "rembg not installed"`).
    4. Ungültige Eingabedatei → Exit ≠ 0, stderr nicht leer.
- [ ] **1.4** RED bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/comfy-image-mcp.bats tests/spec/llm-local-dev/comfy-image-postprocess.bats
# expected: FAIL (scripts/comfy-image-mcp/ existiert noch nicht)
```

## Task 2 — Gemeinsames Pfad-Modul (Extraktion)

- [ ] **2.1** `scripts/lib/wsl-paths.mjs` anlegen mit `toWslPath` und `isGitWorkTree`, wortgleich aus
  `scripts/glimmer-worker-mcp/lib.mjs` extrahiert (inkl. Kommentar der drei Pfadformen).
- [ ] **2.2** In `scripts/glimmer-worker-mcp/lib.mjs` beide Funktionen entfernen, stattdessen
  `import { toWslPath, isGitWorkTree } from '../lib/wsl-paths.mjs';` und `export { toWslPath, isGitWorkTree };`
  — `server.mjs` und der bestehende Test importieren weiter aus `lib.mjs`.
- [ ] **2.3** Regression:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/glimmer-worker-mcp.bats
```

## Task 3 — Nachbearbeitung `postprocess.py`

- [ ] **3.1** CLI mit `argparse`: `--in`, `--out`, `--transparent`, `--pixelate SIZE`, `--colors N` (Default 16,
  2–256), `--scale K` (Default 1, 1–16). Reihenfolge: Freistellung, dann Pixelate.
- [ ] **3.2** Freistellung: `from rembg import remove, new_session`; Session `isnet-general-use`; Import erst in
  der Funktion, damit Pixelate ohne `rembg` läuft. Fehlt `rembg` bei `--transparent` → Exit 3 mit Hinweis
  auf `task llm:comfy-image:install`.
- [ ] **3.3** Pixelate: längere Seite per `Image.Resampling.BOX` auf `SIZE`; Alpha (falls vorhanden) mit
  Schwelle 128 binär; RGB der deckenden Pixel mit `quantize(colors=N, method=Image.Quantize.MEDIANCUT)`;
  transparente Pixel danach wieder auf Alpha 0; `--scale` mit `Image.Resampling.NEAREST`.
- [ ] **3.4** Jeder Fehler → Meldung auf stderr, Exit ≠ 0. Grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/comfy-image-postprocess.bats
```

## Task 4 — Reine Logik `scripts/comfy-image-mcp/lib.mjs`

- [ ] **4.1** `validateArgs(args)` → normalisierte Parameter oder Fehlertext: `prompt` nicht leer; `width`/`height`
  256–1536 und Vielfache von 16 (Default 768); `steps` 1–60 (Default 25); `seed` Ganzzahl ≥ 0, sonst
  `randomInt(0, 2**31)`; `pixelate.size` 8–512, `colors` 2–256, `scale` 1–16; `timeout_s` auf
  [`COMFY_IMAGE_TIMEOUT_FLOOR_S`, 1800], Default 600.
- [ ] **4.2** `checkOutPath(p, overwrite)` → `{path, dir}` oder Fehlertext: `toWslPath`, Endung `.png`,
  Elternordner existiert, `isGitWorkTree(dir)`, vorhandene Datei nur mit `overwrite`.
- [ ] **4.3** `buildPrompt(template, params)` → tiefe Kopie der Vorlage; setzt über `class_type`:
  `TextEncodeQwenImage21.inputs.prompt` (bei `transparent` mit Zusatz
  `, isolated on a plain white background, centered, no shadow`) und `.negative_prompt`,
  `KSampler.inputs.seed`/`.steps`, `EmptyLatentImage.inputs.width`/`.height`,
  `SaveImage.inputs.filename_prefix` = `comfy-image-mcp`. Fehlt ein Knotentyp → `Error` mit dessen Namen.
  `assertTemplate(template)` prüft das beim Serverstart.
- [ ] **4.4** `ImageQueue` (FIFO, ein laufender Job, `waitFor(id, ms)`, `snapshot()`, Aufbewahrung beendeter
  Jobs 1 h) mit Hook `onIdle`: nach Ende des letzten Jobs startet ein Timer (`idleMs`); ein neuer Job löscht ihn.
  `idleRemainingS()` für `image_status`.

## Task 5 — ComfyUI-Client `scripts/comfy-image-mcp/comfy-client.mjs`

- [ ] **5.1** `createClient({ url, systemctl, startTimeoutS })` mit `isUp()` (`/system_stats`, 3 s),
  `ensureUp()` (sonst `systemctl --user start comfyui`, Poll alle 1 s bis `startTimeoutS`; Misserfolg → Fehler
  mit dem Ende von `journalctl --user -u comfyui -n 20 --no-pager`), `stop()` (`systemctl --user stop comfyui`),
  `submit(prompt)` (`POST /prompt` mit `client_id`; HTTP ≠ 200 → Fehler mit `node_errors`-Meldungen),
  `waitHistory(id, deadline)` (Poll `/history/<id>` alle 1 s; `status_str` `error` → Fehler mit den
  `execution_error`-Nachrichten), `fetchImage(ref)` (`/view?filename=&subfolder=&type=` → Buffer),
  `interrupt()`, `stats()` (VRAM aus `devices[0]`).

## Task 6 — Server `scripts/comfy-image-mcp/server.mjs`

- [ ] **6.1** Aufbau wie `scripts/glimmer-worker-mcp/server.mjs`: `requireToken('COMFY_IMAGE_MCP_TOKEN')`,
  `guardRequest`/`corsHeadersFor`, `/health`, `/mcp` mit `initialize`, `tools/list`, `tools/call`. Env:
  `COMFY_IMAGE_MCP_PORT` (13008), `COMFY_IMAGE_URL` (`http://127.0.0.1:8189`), `COMFY_IMAGE_SYSTEMCTL`
  (`systemctl`), `COMFY_IMAGE_PYTHON` (`~/ComfyUI/.venv/bin/python`), `COMFY_IMAGE_IDLE_MIN` (15),
  `COMFY_IMAGE_IDLE_S` (nur Tests, überschreibt Minuten), `COMFY_IMAGE_START_TIMEOUT_S` (180),
  `COMFY_IMAGE_TIMEOUT_FLOOR_S` (60), `COMFY_IMAGE_WORKFLOW` (Default `workflow.json` neben dem Server).
- [ ] **6.2** Job-Runner: `ensureUp` → `buildPrompt` → `submit` → `waitHistory` → `fetchImage` → schreibt nach
  `out_path` (ohne Nachbearbeitung) bzw. nach `<name>.raw.png` und ruft `postprocess.py` per `spawn` (Zeitlimit
  = Restzeit). Deadline überschritten → `interrupt()`, Status `timeout`. Zeiten je Phase in `timings`.
  `git status --porcelain -- <out_path>` ins Ergebnis.
- [ ] **6.3** `onIdle` → `client.stop()` und Log-Zeile. `image_status` → `comfy.ok`, `vram_free_mb`,
  `vram_total_mb`, Queue, `idle_stop_in_s`.
- [ ] **6.4** Tool-Beschreibungen nennen, wofür das Modell taugt (Key-Art, Hintergründe, Icons, Schrift im Bild),
  die Dauer (≈ 2 min pro 768²-Bild) und dass Sprite-Sheets/Animationen nicht konsistent gelingen.
- [ ] **6.5** `workflow.json` aus `~/ComfyUI/qwen-workflow-api.json` übernehmen (die `"prompt"`-Graph-Ebene).
- [ ] **6.6** Grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/comfy-image-mcp.bats
```

## Task 7 — Units, Installer, Task, README

- [ ] **7.1** `comfyui.service`: Kopfkommentar mit `# Status:`-Zeile, `Environment=` für
  `CUDA_DEVICE_ORDER=PCI_BUS_ID`, `CUDA_VISIBLE_DEVICES=GPU-6b9ac882-e9e9-a364-4423-92d838536b86`,
  `HF_HUB_DISABLE_TELEMETRY=1`, `OMP_NUM_THREADS=8`; `WorkingDirectory=%h/ComfyUI`;
  `ExecStart=%h/ComfyUI/.venv/bin/python main.py --listen 127.0.0.1 --port 8189 --lowvram --reserve-vram 1.5 --disable-pinned-memory`;
  **kein** `[Install]`-Abschnitt.
- [ ] **7.2** `comfy-image-mcp.service` nach dem Muster von `glimmer-worker-mcp.service` (Port 13008,
  `EnvironmentFile=%h/.config/comfy-image-mcp/server.env`).
- [ ] **7.3** `install.sh` nach dem Muster von `scripts/glimmer-worker-mcp/install.sh`, zusätzlich Schritt
  `install_python_deps`: `"$PY" -m pip install rembg onnxruntime` und
  `"$PY" -c 'from rembg import new_session; new_session("isnet-general-use")'`. Beide Units **kopieren**
  (gerendert, wie T900376); nur `comfy-image-mcp` wird `enable --now`, `comfyui` nur `daemon-reload`.
  Registrierung `mcpServers.comfy-image`; Override der Ziele über `COMFY_IMAGE_MUSE_SETTINGS`.
  `--register-only` wie beim Vorbild.
- [ ] **7.4** BATS-Test ergänzen (in `comfy-image-mcp.bats`): Installer mit `--register-only` gegen zwei
  Temp-Settings (eine mit `mcpServers.glimmer-worker`, eine leer) und Temp-`COMFY_IMAGE_ENV_FILE` → beide
  führen `comfy-image` mit URL `http://127.0.0.1:13008/mcp`, `glimmer-worker` bleibt erhalten, `.bak` existiert;
  und `docs/agent-guide/registry/mcp.yaml` enthält kein `comfy-image`.
- [ ] **7.5** `taskfiles/Taskfile.llm.yml`: Task `comfy-image:install` (desc mit Port und `[T900379]`),
  `cmds: - bash scripts/comfy-image-mcp/install.sh`.
- [ ] **7.6** `README.md`: Zweck, Tools-Tabelle, Asset-Eignung (gut / mit Nachbearbeitung / kaum), Installation,
  Bedarfsstart und Auto-Stopp, Grenzen.

## Task 8 — Final Verification

- [ ] **8.1** Alle neuen und berührten Tests:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/comfy-image-mcp.bats tests/spec/llm-local-dev/comfy-image-postprocess.bats tests/spec/llm-local-dev/glimmer-worker-mcp.bats tests/spec/systemd-units/
```

- [ ] **8.2** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
