---
title: "freetoken-repo-ssot — Implementation Plan"
ticket_id: T014105
domains: [llm-local-dev, agent-guide]
status: active
file_locks:
  - .opencode/agent-models.jsonc
  - docs/agent-guide/registry/agents.yaml
  - AGENTS.md
  - .opencode/plugin/freetoken-active.ts
  - scripts/opencode-sync-agents.sh
  - tests/spec/llm-local-dev.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freetoken-repo-ssot — Implementation Plan

_Ticket: T014105_

## File Structure

```
.opencode/agent-models.jsonc          # + freetoken-local Provider (3 Checkpoints + Alias), 13 Agenten auf freetoken-local/active
docs/agent-guide/registry/agents.yaml # Spiegelung der Modell-Strings (P4.3-Drift-Gate)
AGENTS.md                             # Routing-Tabelle: 6 lokale Zeilen auf FreeToken-Alias
.opencode/plugin/freetoken-active.ts  # NEU — Plugin aus der Global-Config (~/.config/opencode/plugin/)
scripts/opencode-sync-agents.sh       # verteilt künftig auch .opencode/plugin/*.ts
tests/spec/llm-local-dev.bats         # 5 neue T014105-Guards (RED bereits nachgewiesen)
```

Keine der Dateien liegt in zwei Partials. Das letzte Partial trägt die Tests-Rolle.

## Partial P1 — config-core (SSOT + Spiegelung)

target_files: `.opencode/agent-models.jsonc`, `docs/agent-guide/registry/agents.yaml`, `AGENTS.md`

- [ ] **P1.1** Provider-Block `freetoken-local` in `.opencode/agent-models.jsonc`
      ergänzen (npm `@ai-sdk/openai-compatible`, baseURL `http://127.0.0.1:1919/v1`):
      drei konkrete Modelleinträge mit den gemessenen Limits und
      Messwert-Provenienz in den name-Strings (Qwen3.6-35B-A3B-NVFP4 → 131072,
      gpt-oss-20b → 65536, Gemma-4-26B-A4B-NVFP4 → 32768; output je 8192) plus
      Alias-Eintrag `active` (Fallback-Limit 131072). Der bestehende Provider
      `llamacpp-local` bleibt unverändert bestehen (Loadout existiert weiter,
      `opencode-routes-via-proxy.bats` braucht den Proxy-Verweis).
- [ ] **P1.2** Alle 13 lokalen Agenten (`gptoss`, `devstral`, `gemma`, `gemma12`,
      `qwen38`, `gemma26-primary`, `gemma26-vision`, `gptoss-primary`,
      `devstral-primary`, `gemma12-primary`, `gemma26-throughput-primary`,
      `qwen38-primary`, `freetoken-primary`) im Repo-SSOT auf
      `"model": "freetoken-local/active"` umhängen; Beschreibungen auf
      Alias-Semantik umstellen (modellagnostisch, Limit via Plugin).
- [ ] **P1.3** `docs/agent-guide/registry/agents.yaml`: die `runtimes.model`-
      Strings derselben 13 Agenten auf `freetoken-local/active` spiegeln —
      `tests/spec/agent-roster.bats` P4.3 prüft die Zuordnung beidseitig.
- [ ] **P1.4** `AGENTS.md` Routing-Tabelle: die sechs sichtbaren lokalen Zeilen
      (`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`, Primaries) auf den
      FreeToken-Alias umschreiben, Verweis auf T014028/T014105.

## Partial P2 — plugin-distribution

target_files: `.opencode/plugin/freetoken-active.ts`, `scripts/opencode-sync-agents.sh`

- [ ] **P2.1** `.opencode/plugin/freetoken-active.ts` aus der Global-Config
      (`~/.config/opencode/plugin/freetoken-active.ts`) ins Repo übernehmen —
      Inhalt identisch: config-Hook fragt `http://127.0.0.1:1900/engine/status`
      ab (Timeout 1500 ms), leitet die Modell-ID aus dem Pfad-Basisnamen ab,
      setzt Limit+Name des Alias aus dem konkreten Eintrag, fail-silent bei
      nicht erreichbarem Daemon.
- [ ] **P2.2** `scripts/opencode-sync-agents.sh`: nach dem Prompt-Kopiervorgang
      eine analoge Verteilung für Plugins ergänzen — `mkdir -p` auf dem globalen
      Plugin-Verzeichnis, dann `cp -f "$REPO_DIR"/.opencode/plugin/*.ts` dorthin;
      Muster und Ausgabezeile am Prompt-Block orientieren.
- [ ] **P2.3** Global-Seite konsolidieren: Sync einmal laufen lassen und
      gegenprüfen, dass die globale Kopie des Plugins mit dem Repo-Stand
      übereinstimmt und die Global-Config den Alias samt Provider vom SSOT
      übernimmt (der Agent-Block wird ohnehin komplett ersetzt).

## Partial P3 — tests-verify (Tests-Rolle)

target_files: `tests/spec/llm-local-dev.bats`

- [ ] **P3.1 (RED, bereits erledigt und nachgewiesen).** Fünf T014105-Guards in
      `tests/spec/llm-local-dev.bats` ergänzt: Provider-Deklaration auf :1919,
      drei gemessene Limits, Alias-Verdrahtung aller 13 Agenten, Plugin im Repo
      mit Daemon-Referenz, Sync-Plugin-Verteilung. Läuft gegen den Stand vor
      P1/P2:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats
# expected: FAIL (red — gemessen 2026-08-23 im Worktree: Tests 22–26 schlugen fehl)
```

- [ ] **P3.2 (GREEN).** Nach P1/P2 denselben Lauf wiederholen — alle fünf
      T014105-Tests müssen grün sein, die 21 Bestands-Tests unberührt:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats
# expected: PASS (26/26)
```

## Verify (final)

- [ ] **Final Verification.** Die drei Pflicht-Gates plus die direkt betroffenen
      Nachbarschafts-Guards:

```bash
task test:changed
task freshness:regenerate
task freshness:check
./tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
./tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/opencode-agent-model-drift.bats
./tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats
```

Budgets (S1): alle Dateien additiv unter 60 Zeilen Delta außer
`.opencode/agent-models.jsonc` (+~50 Zeilen Provider-Block, Bestand 805 Zeilen,
JSONC zählt nicht unter das 600-Zeilen-LOC-Gate laut gates.yaml-Ausnahmen);
neues Plugin ~60 Zeilen. Keine Brand-Domain-Literale beteiligt.
