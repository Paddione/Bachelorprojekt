---
title: "glimmer-local-backend — Implementation Plan"
ticket_id: T900365
domains: [llm, opencode, factory, scripts, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# glimmer-local-backend — Implementation Plan

_Ticket: T900365 · Design: `openspec/changes/glimmer-local-backend/design.md` (D1–D9 sind dort
begründet und gemessen; dieser Plan setzt sie nur um)._

**Ziel:** `:1919` serviert Muse Glimmer 30B `UD-IQ3_XXS` plus DFlash2-Drafter statt Qwen3.8-27B GSQ-RCO.
Jede Stelle im Repo, die das Backend benennt, zieht nach. Einziger Partial; die Aufgaben laufen in
Reihenfolge, weil die Tests aus Task 1 die Zielwerte der Tasks 2–6 festschreiben.

**Namens-Tabelle (verbindlich in allen Tasks):**

| alt | neu |
|---|---|
| Modell-ID / Alias / Katalog-Key `Qwen3.8-27B-gsq` | `Muse-Glimmer-30B` |
| `llamacpp-local/Qwen3.8-27B-gsq` | `llamacpp-local/Muse-Glimmer-30B` |
| Unit `scripts/llm/qwen38-gsq.service` | `scripts/llm/glimmer.service` |
| Agent `qwen38-primary`, Prompt `.opencode/prompts/qwen38-primary.md` | `glimmer-primary`, `.opencode/prompts/glimmer-primary.md` |
| Loadout-Slug `qwen38-gsq` | `glimmer` |
| Kontext 153600 · Compaction-Trigger 120000 · DCP 40 %/75 % (61440/115200) | 131072 · 97472 · 40 %/70 % (52429/91750) |

Historische Erwähnungen (Ticket-Kommentare wie „seit T900359 …“, archivierte Changes,
`scripts/llm/measurements/`, `CHANGELOG.md`) bleiben unverändert. Umgeschrieben wird nur, was einen
**Ist-Zustand** behauptet.

## File Structure

| Datei | Aktion |
|---|---|
| `scripts/llm/glimmer.service` | neu (D1–D6) |
| `scripts/llm/qwen38-gsq.service` | `git rm` |
| `.opencode/agent-models.jsonc` | Provider-Name, Katalog-Key, Limits, Agenten, Rename Primary |
| `.opencode/opencode.jsonc` | Default-Modell, Compaction-Kommentar |
| `.opencode/dcp.jsonc` | Keys + 40 %/70 % |
| `.opencode/prompts/qwen38-primary.md` → `.opencode/prompts/glimmer-primary.md` | `git mv` + Engine-Abschnitt |
| `.opencode/prompts/local-subagent.md` | Engine- und Schwellenwerte |
| `.opencode/prompts/orchestrator.md` | L-Budget 100k → 90k |
| `.opencode/plugin/system-message-merge.ts` | nur Kommentar |
| `.opencode/skills/freetoken-setup/SKILL.md` | RETIRED-Hinweis nennt Glimmer |
| `scripts/brain-ingest.sh`, `Taskfile.yml`, `taskfiles/Taskfile.brain.yaml` | Default-Modell |
| `scripts/factory/pipeline.mjs`, `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh` | Default-Modell |
| `scripts/factory-mcp-node/server.mjs`, `scripts/factory/mcp-go/main.go`, `scripts/factory/mcp-go/README.md` | Default-Modell + D9-Gate |
| `scripts/plan-qa-check.sh` | Default-Modell + D9 |
| `scripts/brain-ingest-transform.sh`, `scripts/factory/triage-body.sh`, `scripts/health-goals-payload.py`, `scripts/arbitration/synthesize.mjs`, `scripts/web-audit.mjs` | D9 |
| `scripts/lib/llm-stack-measure.sh` | Slug→Modell-Zuordnung |
| `scripts/llm/loadouts.json` | Eintrag `qwen38-gsq` → `glimmer` |
| `scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql` | Backend-Zeile `qwen38-gsq` → `glimmer` |
| `AGENTS.md`, `.claude/lib/goals.md`, `docs/agent-guide/registry/agents.yaml` | Ist-Angaben |
| `docs/agent-guide/maps/agents-map.md`, `docs/code-quality/repo-index.json` | regeneriert, nicht von Hand |
| `tests/spec/llm-local-dev.bats` | Erwartungen + neue Tests (Unit-Profil, D9) |
| `tests/spec/llm-local-dev/single-static-model.bats`, `tests/spec/llm-local-dev/system-message-merge.bats` | Erwartungen |
| `tests/spec/local-llm-proxy/qwen38-default-backend.bats` → `tests/spec/local-llm-proxy/glimmer-default-backend.bats` | `git mv` + Erwartungen |
| `tests/spec/local-llm-proxy/opencode-agent-model-drift.bats`, `tests/spec/local-llm-proxy/gemma-kv-quant.bats` | Erwartungen, Ausnahmeliste |
| `tests/spec/software-factory/local-llm-freetoken-direct.bats`, `tests/spec/brain-ingest-task-defaults.bats` | Erwartungen |
| `tests/spec/dev-flow-plan/plan-qa-payload.bats` | D9-Zusicherung |
| `components/website/src/data/test-inventory.json` | regeneriert |

S1-Zeilenbudgets der geänderten Code-Dateien (Ist · Restbudget laut `bash scripts/plan-lint.sh residual_budget <datei>`).
Alle Änderungen sind Ersetzungen; netto wächst nur `server.mjs` um höchstens 2 Zeilen:

| Datei | Ist | Budget |
|---|---|---|
| `scripts/brain-ingest.sh` | 686 | 114 |
| `scripts/factory-mcp-node/server.mjs` | 757 | 43 |
| `scripts/factory/provider-register-local.sh` | 61 | 739 |
| `scripts/factory/route-provider.sh` | 138 | 662 |
| `scripts/lib/llm-stack-measure.sh` | 290 | 510 |
| `scripts/plan-qa-check.sh` | 311 | 489 |
| `.opencode/plugin/system-message-merge.ts` | 128 | 772 |
| `scripts/brain-ingest-transform.sh` | 215 | 585 |
| `scripts/factory/triage-body.sh` | 52 | 748 |
| `scripts/arbitration/synthesize.mjs` | 131 | 669 |
| `scripts/web-audit.mjs` | 451 | 349 |

`scripts/factory/pipeline.mjs` und `scripts/factory/mcp-go/main.go` haben kein S1-Budget (Ignore-Liste
bzw. keine Limit-Extension); sie ändern sich zeilenneutral.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Task 1 — Tests auf den Zielzustand ziehen (RED)

- [ ] **1.1** `tests/spec/llm-local-dev.bats`: In allen Erwartungen `Qwen3.8-27B-gsq` → `Muse-Glimmer-30B`,
  `qwen38-primary` → `glimmer-primary`, `153600` → `131072`, Unit-Pfad → `scripts/llm/glimmer.service`.
  Der Test „T900348: catalog context matches -c and port of the llama.cpp unit“ prüft danach `131072`
  und `1919` gegen `glimmer.service`. Zwei neue Tests anhängen:
  - `"T900365: glimmer.service carries the measured serving profile"`: Positiv-Anker, dass die Unit
    existiert. Dann per `grep -F` auf `ExecStart` bis zur letzten Fortsetzungszeile:
    `--spec-type draft-dflash`, `--spec-draft-n-max 4`, `-c 131072`, `-ctk q8_0`, `-ctv q8_0`,
    `--alias Muse-Glimmer-30B`, `--port 1919`, `--host 0.0.0.0`, `Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf`.
    Negativ: kein `--mmproj`, kein `-devd CUDA1`, und `scripts/llm/qwen38-gsq.service` existiert nicht.
  - `"T900365: reasoning-off callers also send reasoning_strength low"`: für jede der Dateien
    `scripts/brain-ingest-transform.sh`, `scripts/factory/triage-body.sh`, `scripts/health-goals-payload.py`,
    `scripts/arbitration/synthesize.mjs`, `scripts/web-audit.mjs`, `scripts/factory-mcp-node/server.mjs`,
    `scripts/factory/mcp-go/main.go`, `scripts/plan-qa-check.sh`: Positiv-Anker, dass die Datei
    `enable_thinking` enthält, dann dass sie `reasoning_strength` mit `low` enthält
    (`grep -E 'reasoning_strength["'"'"']?[[:space:]]*[:=]+[[:space:]]*["'"'"']low'`, jeweils mit Dateiname
    in der Fehlermeldung). Für `server.mjs` und `main.go` zusätzlich, dass die Modell-Bedingung `glimmer`
    nennt (`grep -qi 'glimmer'`).
- [ ] **1.2** `tests/spec/llm-local-dev/single-static-model.bats` und
  `tests/spec/llm-local-dev/system-message-merge.bats`: gleiche Ersetzungen (Key, Agentenname,
  Modell im Test-Payload).
- [ ] **1.3** `git mv tests/spec/local-llm-proxy/qwen38-default-backend.bats tests/spec/local-llm-proxy/glimmer-default-backend.bats`.
  Erster Test prüft `"model": "llamacpp-local/Muse-Glimmer-30B"` und neu als Negativ-Aussage
  `"model": "llamacpp-local/Qwen3.8-27B-gsq"`. Kopfkommentar um T900365 ergänzen; der Migrationstest
  T013141 (historisches Backend `llamacpp-qwen38`) bleibt unverändert.
- [ ] **1.4** `tests/spec/local-llm-proxy/opencode-agent-model-drift.bats`: Zähl-Test auf
  `llamacpp-local/Muse-Glimmer-30B`, Testname entsprechend.
- [ ] **1.5** `tests/spec/local-llm-proxy/gemma-kv-quant.bats`: `qwen38-gsq` aus `_KV_Q4_ALLOWED` streichen,
  **nicht** `glimmer` aufnehmen, denn Glimmer fährt `q8_0` (D4). Dadurch prüft der bestehende Test,
  dass das neue Loadout nicht mit `q4_0` startet.
- [ ] **1.6** `tests/spec/software-factory/local-llm-freetoken-direct.bats` und
  `tests/spec/brain-ingest-task-defaults.bats`: erwartete Default-Modell-ID `Muse-Glimmer-30B`. In der
  Liste retired model ids (falls der Test eine führt) zusätzlich `Qwen3.8-27B-gsq` aufnehmen, wie im
  software-factory-Delta verlangt.
- [ ] **1.7** `tests/spec/dev-flow-plan/plan-qa-payload.bats`, Test „T002595“: nach der
  `enable_thinking`-Zusicherung ergänzen:
  `echo "$output" | jq -e '.chat_template_kwargs.reasoning_strength == "low"' >/dev/null`.
- [ ] **1.8** Rotlauf. Erwartet: jede geänderte Datei hat mindestens einen roten Test.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats tests/spec/llm-local-dev/ \
  tests/spec/local-llm-proxy/glimmer-default-backend.bats tests/spec/local-llm-proxy/opencode-agent-model-drift.bats \
  tests/spec/local-llm-proxy/gemma-kv-quant.bats tests/spec/software-factory/local-llm-freetoken-direct.bats \
  tests/spec/brain-ingest-task-defaults.bats tests/spec/dev-flow-plan/plan-qa-payload.bats
# expected: FAIL (red — Unit, Katalog, Defaults und D9-Kwargs sind noch Qwen)
```

- [ ] **1.9** Commit: `test(test): expect Muse Glimmer on :1919 [T900365]`.

## Task 2 — systemd-Unit (D1–D6)

- [ ] **2.1** `scripts/llm/glimmer.service` anlegen. Kopfkommentar im Stil der alten Unit: Modellquellen
  (`unsloth/Muse-Glimmer-30B-GGUF` → `Muse-Glimmer-30B-UD-IQ3_XXS.gguf`,
  `incoai/Muse-Glimmer-30B-DFlash2-GGUF` → `Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf`, beide nach
  `~/models/Muse-Glimmer-30B`), Installation (`hf download …`, Symlink, `daemon-reload`, `enable --now`),
  die Voraussetzung llama.cpp ≥ `e85e15cf6` (DFlash2, #27816) hinter `%h/opt/llama-current`, die
  Messtabelle aus `design.md` (n4/q8_0-Zeile und Baseline ohne Drafter), der Hinweis, warum der Drafter
  nicht auf der 3060 Ti laufen kann (Fehlerzeile zitieren), und die WSL-Auslagerungsgrenze aus der
  alten Unit. Service-Block:

```ini
[Unit]
Description=llama-server Muse Glimmer 30B UD-IQ3_XXS + DFlash2 (RTX 5070 Ti, 131k ctx) auf :1919
After=network.target

[Service]
Type=simple
Environment=CUDA_DEVICE_ORDER=PCI_BUS_ID
Environment=CUDA_VISIBLE_DEVICES=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4
ExecStart=%h/opt/llama-current/bin/llama-server \
  -m %h/models/Muse-Glimmer-30B/Muse-Glimmer-30B-UD-IQ3_XXS.gguf \
  -md %h/models/Muse-Glimmer-30B/Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf \
  --spec-type draft-dflash --spec-draft-n-max 4 \
  --alias Muse-Glimmer-30B \
  -c 131072 \
  -fit off -ngl 999 -ngld all \
  -fa on -ctk q8_0 -ctv q8_0 \
  --temp 1.0 --top-p 0.95 --top-k 64 \
  -np 1 --jinja \
  --host 0.0.0.0 --port 1919
Restart=on-failure
RestartSec=10
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

  Nur die 5070 Ti ist sichtbar, deshalb braucht es kein `-dev`/`-devd`; Target und Drafter landen beide
  auf CUDA0. Das ist die in D2 erzwungene Platzierung.
- [ ] **2.2** `git rm scripts/llm/qwen38-gsq.service`.
- [ ] **2.3** Commit: `feat(scripts): glimmer.service replaces qwen38-gsq on :1919 [T900365]`.

## Task 3 — opencode-Konfiguration

- [ ] **3.1** `.opencode/agent-models.jsonc`, Provider `llamacpp-local`:
  - Kopfkommentar: seit T900365 Muse Glimmer 30B + DFlash2 über `scripts/llm/glimmer.service`.
  - `"name"`: `"llama.cpp :1919 (Muse Glimmer 30B UD-IQ3_XXS + DFlash2, RTX 5070 Ti, 131k ctx)"`.
  - Katalog-Key `Qwen3.8-27B-gsq` → `Muse-Glimmer-30B`; `limit.context` und `limit.input` `131072`,
    `output` `8192`. Der Messkommentar darüber nennt die Werte aus `design.md` (llama.cpp `e85e15cf6`,
    q8_0-KV, draft-dflash n-max 4: ~79 tok/s kurz; 117.097-Token-Prompt: Prefill ~1095 tok/s,
    Decode 84–89 tok/s, Needle gefunden) und den Reasoning-Hinweis: das Template setzt
    `Reasoning strength: high` selbst; kleines `max_tokens` liefert leeren content.
  - `"name"` des Modells: `"Muse Glimmer 30B (llama.cpp :1919, RTX 5070 Ti, 131k ctx, ~79–89 tok/s decode, reasoning high)"`.
  - Agenten `local` und `reviewer`: `model` → `llamacpp-local/Muse-Glimmer-30B`; in der `description`
    von `local` „Qwen3.8-27B dense … 150k served KV“ → „Muse Glimmer 30B … 131k served KV“; Kommentar
    „≤153600 served KV“ → „≤131072“.
  - Agent `qwen38-primary` → Key `glimmer-primary`, `model` wie oben,
    `prompt` → `{file:./prompts/glimmer-primary.md}`, `description` und Kommentar auf Glimmer
    (131k served KV, gemessen 2026-09-25). Permissions unverändert übernehmen (enthält `planner-muse`,
    siehe REQ-SF-EXECUTOR-004).
  - Danach darf `grep -n 'Qwen3.8\|qwen38-primary\|153600' .opencode/agent-models.jsonc` nichts mehr
    liefern.
- [ ] **3.2** `.opencode/opencode.jsonc`: `"model": "llamacpp-local/Muse-Glimmer-30B"`; Kopfkommentar auf
  Glimmer; die Rechenzeilen im Compaction-Kommentar: `Muse-Glimmer-30B (input 131072): 131072 − 33600 = 97472`
  und `131072 − max(8192, 33600) = 97472`. Die Kalibrierungs-Absätze zu Qwen (T900350/T900362) als
  Historie markieren („bis T900365, Qwen 153600: …“). Die Zahlen des `compaction`-Blocks bleiben.
- [ ] **3.3** `.opencode/dcp.jsonc`: beide Keys → `llamacpp-local/Muse-Glimmer-30B`; `modelMaxLimits` `"75%"` →
  `"70%"`. Kommentar: `40 % = 52429 → Nudge`, `70 % = 91750 → Zwang, 5722 unter dem Compaction-Trigger 97472`,
  und warum nicht 75 % (98304 läge über dem Trigger).
- [ ] **3.4** `git mv .opencode/prompts/qwen38-primary.md .opencode/prompts/glimmer-primary.md`. Erste Zeile
  und Abschnitt „Engine reality“ neu: Muse Glimmer 30B UD-IQ3_XXS + DFlash2 (`--spec-draft-n-max 4`)
  auf einer RTX 5070 Ti, 131072 served KV, q8_0-KV, Reasoning-Level `high` durch das Chat-Template.
  Geschwindigkeit ~79 tok/s kurz, 84–89 tok/s bei ~117k, Prefill ~1095 tok/s, ein voller 117k-Prompt
  also etwa 110 s. Der Reasoning-Budget-Hinweis bleibt inhaltlich. Keine `Reasoning strength`-Zeile
  in den Prompt schreiben (D6). Der Workflow-Teil ab „Autonomous Ticket Hammering Workflow“ bleibt
  unverändert.
- [ ] **3.5** `.opencode/prompts/local-subagent.md`: Engine-Satz auf Glimmer (DFlash2 statt MTP),
  `≤153600` → `≤131072`; DCP-Schwellen „≈61k … ≈115k“ → „≈52k … ≈92k“; „auto-compaction at 120k“ → „at ≈97k“;
  „dense 27B“ → „dense 30B“. Budget-Klassen „S ~32k / M ~80k / L ~100k“ → „S ~32k / M ~80k / L ~90k“.
- [ ] **3.6** `.opencode/prompts/orchestrator.md` Zeile mit den Budget-Klassen: `L ~100k` → `L ~90k`
  (L muss unter dem lokalen Trigger von 97472 bleiben). Weitere Zahlen dort nur ändern, wenn sie den
  lokalen Kontext betreffen.
- [ ] **3.7** `.opencode/plugin/system-message-merge.ts`: nur den Kommentar in Zeile 8
  (`qwen38-primary` → `glimmer-primary`). Keine Logikänderung; das Plugin bleibt auch unter Glimmer
  sinnvoll, weil opencode weiterhin `system,system,user` schickt.
- [ ] **3.8** `.opencode/skills/freetoken-setup/SKILL.md`: der RETIRED-Satz nennt als Ist-Backend
  `llama-server` mit `Muse-Glimmer-30B` (`glimmer.service`).
- [ ] **3.9** Commit: `feat(agents): local roster on Muse-Glimmer-30B, 131k window [T900365]`.

## Task 4 — Skripte: Default-Modell-ID und Reasoning-Level (D9)

- [ ] **4.1** Literal-Tausch `Qwen3.8-27B-gsq` → `Muse-Glimmer-30B` in: `scripts/brain-ingest.sh` (Zeilen 14
  und 47), `Taskfile.yml` (Zeile ~5410), `taskfiles/Taskfile.brain.yaml` (Kommentar Zeile ~56),
  `scripts/factory-mcp-node/server.mjs` (`DEFAULT_LOCAL_LLM_MODEL`), `scripts/factory/mcp-go/main.go`
  (`defaultLocalLLMModel`), `scripts/factory/mcp-go/README.md`, `scripts/factory/pipeline.mjs`
  (`LOCAL_MODEL_ID`), `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh`
  (Default + Kommentar zur Unit), `scripts/plan-qa-check.sh` (`PLAN_QA_MODEL`-Default).
- [ ] **4.2** Kontrolle:
  `git grep -n 'Qwen3.8-27B-gsq' -- scripts Taskfile.yml taskfiles ':!scripts/llm/measurements'` muss leer sein,
  bis auf die Migration aus Task 5.

- [ ] **4.3** Überall `reasoning_strength: "low"` in dasselbe `chat_template_kwargs`-Objekt neben
  `enable_thinking: false` setzen:
  - `scripts/brain-ingest-transform.sh` Zeile ~141:
    `"chat_template_kwargs":{"enable_thinking":false,"reasoning_strength":"low"}`; Kommentar Zeile ~139 um
    „Muse Glimmer uses chat_template_kwargs.reasoning_strength“ ergänzen.
  - `scripts/factory/triage-body.sh` Zeile ~51: `{chat_template_kwargs: {enable_thinking: false, reasoning_strength: "low"}}`.
  - `scripts/health-goals-payload.py` Zeile ~36: `{'enable_thinking': False, 'reasoning_strength': 'low'}`.
  - `scripts/arbitration/synthesize.mjs` Zeile ~85 und `scripts/web-audit.mjs` Zeile ~254:
    `{ enable_thinking: false, reasoning_strength: 'low' }`.
  - `scripts/plan-qa-check.sh` Zeile ~123: `chat_template_kwargs: {enable_thinking: $et, reasoning_strength: "low"}`.
    Das äußere `enable_thinking: $et` bleibt.
- [ ] **4.4** Modell-gegatete Aufrufer:
  - `scripts/factory-mcp-node/server.mjs` Zeile ~509: Bedingung
    `/qwen|glimmer/i.test(model)`, Body `{ enable_thinking: false, reasoning_strength: 'low' }`.
  - `scripts/factory/mcp-go/main.go` Zeile ~816: `m := strings.ToLower(model); if strings.Contains(m, "qwen") || strings.Contains(m, "glimmer") {`
    mit `map[string]any{"enable_thinking": false, "reasoning_strength": "low"}`. Die Kommentare zu
    `extractAnswerFromReasoning` („Qwen3 reasoning trace“) auf „reasoning trace (Qwen3/Glimmer)“.
    `gofmt`-Formatierung einhalten; Go ist lokal nicht installiert, daher kompiliert erst CI.
    Die Änderung muss syntaktisch trivial bleiben.
- [ ] **4.5** Nicht angefasst werden `scripts/llm-proxy/` (stillgelegt), `scripts/llm/bench-*.sh` und
  `scripts/finetune/`.
- [ ] **4.6** Commit: `feat(scripts): default local model id Muse-Glimmer-30B, reasoning_strength low where thinking is disabled [T900365]`.

## Task 5 — Registries und Doku

- [ ] **5.1** `scripts/llm/loadouts.json`: den ersten Eintrag (`slug` `qwen38-gsq`) ersetzen durch `slug` `glimmer`,
  `label` `"Muse Glimmer 30B UD-IQ3_XXS + DFlash2 - llama.cpp :1919, 131k Kontext"`,
  `model` `"models/Muse-Glimmer-30B/Muse-Glimmer-30B-UD-IQ3_XXS.gguf"`, `fit.minCtx` und `args.ctx`
  `131072`, `cacheTypeK`/`cacheTypeV` `"q8_0"`, `speculative.specType` `"draft-dflash"`,
  `speculative.draftModelPath` `"models/Muse-Glimmer-30B/Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf"`,
  `notes` mit Verweis auf `glimmer.service` [T900365]. Übrige Felder wie beim alten Eintrag.
  Danach `node -e "JSON.parse(require('fs').readFileSync('scripts/llm/loadouts.json','utf8'))"`.
- [ ] **5.2** `scripts/lib/llm-stack-measure.sh` Zeilen ~161–162: `if l.get('slug') == 'glimmer': s.add('Muse-Glimmer-30B')`.
- [ ] **5.3** `scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql`: Zeile
  `('qwen38-gsq', …, '{"qwen38-gsq": "Qwen3.8-27B-gsq"}'::jsonb, …)` →
  `('glimmer', 'llamacpp', 'http://llm-gateway-host:1919/v1', NULL, true, 1, '[]'::jsonb, '{"glimmer": "Muse-Glimmer-30B"}'::jsonb, 1, '[]'::jsonb, NULL)`.
  Die Migration ist idempotent und schaltet nicht geseedete Zeilen am Ende ab, sodass `qwen38-gsq` beim
  nächsten `task devmesh:registry:migrate` deaktiviert wird. Gleiches Vorgehen wie T900363, das diese
  Datei in-place geändert hat.
- [ ] **5.4** `AGENTS.md` Zeilen 14/16/26: Modell `llamacpp-local/Muse-Glimmer-30B (131k served KV, DFlash2)`;
  Zeile 16 Agentenname `glimmer-primary`, Beschreibung „Plan-primary (Muse Glimmer, Spark-Familie)“.
- [ ] **5.5** `.claude/lib/goals.md` Zeile ~237: Ist-Satz auf `Muse-Glimmer-30B` (131k Kontext, DFlash2 via
  `glimmer.service`). **Achtung:** T900364 (andere Session, `dev-flow-chore`) bearbeitet gerade
  `goals.md`-Tabellenformate. Vor dem Edit `git fetch origin main` und bei Konflikt rebasen; nur diese
  eine Zeile ändern.
- [ ] **5.6** `docs/agent-guide/registry/agents.yaml`: Einträge `local`, `reviewer` (Modell + note) und
  `qwen38-primary` → Key `glimmer-primary` (Modell + note). Danach `node scripts/agent-guide/emit-maps.mjs`
  (oder `task freshness:regenerate` in Task 7) regeneriert `docs/agent-guide/maps/agents-map.md`;
  die Map nicht von Hand bearbeiten.
- [ ] **5.7** Commit: `docs(docs): registries and docs name Muse-Glimmer-30B [T900365]`.

## Task 6 — Rollout auf dem Host, Laufzeitprüfung, Rollback-Kriterium

Läuft in `dev-flow-execute` **vor** dem Merge auf dem Branch-Stand, weil der Qualitätsbeleg `:1919`
braucht. `:1919` fällt dabei aus; das ist mit dem Operator abgestimmt (Session 2026-09-25).

- [ ] **6.1** Voraussetzungen prüfen: `~/opt/llama.cpp-e85e15c/build/bin/llama-server` existiert,
  `~/models/Muse-Glimmer-30B/` enthält beide Dateien (13.130.658.848 und 1.645.657.280 Byte).
- [ ] **6.2** Umschalten:

```bash
ln -sfn ~/opt/llama.cpp-e85e15c/build ~/opt/llama-current
systemctl --user disable --now qwen38-gsq
ln -sf "$PWD/scripts/llm/glimmer.service" ~/.config/systemd/user/glimmer.service
systemctl --user daemon-reload && systemctl --user enable --now glimmer
until curl -sf http://127.0.0.1:1919/health >/dev/null; do sleep 3; done
curl -s http://127.0.0.1:1919/v1/models | jq -r '.data[].id'          # erwartet: Muse-Glimmer-30B
curl -s http://127.0.0.1:1919/props | jq '.default_generation_settings.n_ctx'   # erwartet: 131072
nvidia-smi --query-gpu=name,memory.used --format=csv,noheader        # 5070 Ti ~15,1 GB
```

- [ ] **6.3** D9-Messung: dieselbe Anfrage, einmal mit `chat_template_kwargs: {reasoning_strength: "low"}` und
  einmal ohne, `max_tokens` 512, Prompt aus `scripts/factory/triage-body.sh`. Notiert werden
  `finish_reason`, `content`-Länge und `reasoning_content`-Länge. Erwartet bei `low`: `content` nicht
  leer. Ist er leer, das `max_tokens` der betroffenen Aufrufer anheben und die Zahl im Ticket festhalten.
- [ ] **6.4** Durchsatz-Stichprobe mit dem Messskript des Changes:
  `bash openspec/changes/glimmer-local-backend/measurements/glimmer-bench.sh 1919 rollout`. Soll:
  Decode kurz ≥ 70 tok/s, Needle gefunden, Tool-Call geparst.
- [ ] **6.5** Qualitätsbeleg mit einem echten opencode-Dispatch: `bash scripts/opencode-sync-agents.sh`, dann ein
  `local`-Dispatch mit einer kleinen, realen Edit-Aufgabe in einem Wegwerf-Worktree (Datei lesen,
  gezielter Edit, `bats`-Lauf). Erwartet: gültige Tool-Calls, Edit angewendet, keine leere Antwort.
  Ergebnis mit Befehl als Ticket-Kommentar.
- [ ] **6.6** Rollback-Kriterium: Schlagen 6.4 oder 6.5 fehl und lässt sich das nicht in dieser Session
  beheben, zurück auf Qwen:
  `ln -sfn ~/opt/llama.cpp-src/build ~/opt/llama-current && systemctl --user disable --now glimmer && git show origin/main:scripts/llm/qwen38-gsq.service > ~/.config/systemd/user/qwen38-gsq.service && systemctl --user daemon-reload && systemctl --user enable --now qwen38-gsq`.
  Dann kein Merge, sondern Ticket-Kommentar mit dem Befund an den Operator.

## Task 7 — GREEN und finale Verifikation

- [ ] **7.1** Denselben Testlauf wie in 1.8 wiederholen: alle grün.
- [ ] **7.2** Rest-Suche als Positiv-/Negativ-Anker (Befehl mit Stand ins Ticket, Mess-Konvention):

```bash
PRE=$(git rev-parse HEAD)
git grep -l -E 'Qwen3\.8-27B-gsq|qwen38-gsq|qwen38-primary' "$PRE" -- . \
  ':!openspec/changes' ':!docs/superpowers' ':!components/website/CHANGELOG.md' \
  ':!scripts/llm/measurements' ':!docs/agent-guide/registry/config-overview.md' | sed "s|^$PRE:||"
git grep -c 'Muse-Glimmer-30B' "$PRE" -- .opencode/agent-models.jsonc   # Positiv-Anker: > 0
```

  Erwartet: Die erste Liste enthält nur noch Stellen, die ausdrücklich Historie beschreiben; jede
  einzelne wird im Ticket begründet. Ausgenommen sind außerdem die unveränderten Migrationen
  `2026-08-22-llm-proxy-qwen38-backend.sql` und Test T013141.
- [ ] **7.3** Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/glimmer-local-backend/tasks.md
```

- [ ] **7.4** `task test:inventory` und die regenerierten Dateien (`components/website/src/data/test-inventory.json`,
  `docs/agent-guide/maps/agents-map.md`, `docs/code-quality/repo-index.json`) mitcommitten:
  `chore(scripts): regenerate inventories [T900365]`.
- [ ] **7.5** Deliverables auf dem Branch vorhanden: `scripts/llm/glimmer.service`,
  `.opencode/prompts/glimmer-primary.md`, `tests/spec/local-llm-proxy/glimmer-default-backend.bats`;
  `scripts/llm/qwen38-gsq.service` und `.opencode/prompts/qwen38-primary.md` sind entfernt.
