---
title: "freetoken-local-backend — Implementation Plan"
ticket_id: T014028
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freetoken-local-backend — Implementation Plan

_Ticket: T014028_

## File Structure

```
.opencode/agent-models.jsonc                  # Provider freetoken-local + Agenten-Umhängen
scripts/llm/loadouts.json                     # 2 Loadouts enabled:false, factory.model
scripts/factory/route-provider.sh             # PIN-/Emergency-Fallback auf FreeToken
scripts/plan-qa-check.sh                      # MODEL-Default
docs/agent-guide/registry/agents.yaml         # Mirror (agent-roster.bats)
docs/agent-guide/maps/agents-map.md           # Mirror
AGENTS.md                                     # Agent-Tabelle
tests/spec/freetoken-local-backend/           # neuer BATS-Test
docs/runbooks/freetoken-native.md             # Betrieb-Runbook
openspec/changes/freetoken-local-backend/     # dieser Change
```

## Tasks

- [ ] **T1 — BATS-Test (RED).** `tests/spec/freetoken-local-backend/routing.bats`:
      (a) `route-provider.sh` PIN-Pfad emittiert provider `freetoken` + baseUrl
      `http://127.0.0.1:1919/v1`; (b) `loadouts.json` hat beide Loadouts auf
      `enabled:false`; (c) `agent-models.jsonc` definiert Provider `freetoken-local`
      mit Modell `Qwen3.6-35B-A3B-NVFP4`; (d) kein aktiver Agent referenziert
      `llamacpp-local/qwen38-220k` mehr.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/freetoken-local-backend/
# expected: FAIL (red — Umstellung noch nicht implementiert)
```

- [ ] **T2 — agent-models.jsonc.** Provider `freetoken-local`
      (`npm: @ai-sdk/openai-compatible`, `baseURL: http://127.0.0.1:1919/v1`,
      Modell `Qwen3.6-35B-A3B-NVFP4`, limit.context 262144) ergänzen; Familien-
      Subagenten (`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`) und alle
      Primaries, die auf `llamacpp-local/qwen38-220k` zeigen, umhängen;
      `gemma26-throughput-primary` entfernen; tote Modell-Einträge
      `gemma26-throughput`/`qwen38-220k` aus `llamacpp-local.models` entfernen.

- [ ] **T3 — loadouts.json.** Beide Loadouts `enabled: false` + Kommentar mit
      Migrationsverweis (T014028); `factory.model` → `Qwen3.6-35B-A3B-NVFP4`.

- [ ] **T4 — route-provider.sh + plan-qa-check.sh.** Fallback/PIN emitieren
      `provider=freetoken`, `baseUrl=http://127.0.0.1:1919/v1`;
      `PLAN_QA_MODEL`-Default auf FreeToken-ID.

- [ ] **T5 — Mirror-Dateien.** `agents.yaml`, `agents-map.md`, `AGENTS.md`
      an T2 angepasst; `task agents:toolset:check` bzw. roster-Tests grün.

- [ ] **T6 — Runbook.** `docs/runbooks/freetoken-native.md`: Start/Stop
      (Windows-seitig detached), Logs, JIT-Warmup-Hinweis, WSL-Symlink-vs-
      NTFS-Hardlink-Falle, `.wslconfig`-Stand (24 GB / 12 Kerne, 2026-08-23),
      VRAM-Exklusivität.

- [ ] **T7 — DB-Migration (Deployment).** `tickets.provider_config`: FreeToken-
      Zeile eintragen, llama-Zeilen demoten. Gehört in den Deploy-Schritt,
      nicht ins Repo.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Test aus T1 läuft gegen den unveränderten
      Branch und schlägt fehl.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/freetoken-local-backend/
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Nach T2–T5 ist der Test grün; zusätzlich:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
task test:changed
task freshness:regenerate && task freshness:check
```

- [ ] **Final Verification.** Drei CI-Gates lokal grün (test:changed,
      freshness:check, workspace:validate).
