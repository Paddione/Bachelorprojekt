## Why

Die opencode-Konfiguration driftet über Ebenen hinweg: `.opencode/agent-models.jsonc` (SSOT) enthält Modell-Einträge mit überdeklarierten Kontext-Limits (opencode-zen/big-pickle: 1M statt ~260k real; Qwen3.6-35B 'active': 200000 LADDER_CEILING vs. 262144 advertised), AGENTS.md/agents.yaml widersprechen der SSOT (orchestrator-Zeile), und es existieren doppelte globale Configs (`~/.config/opencode/opencode.json` + `opencode.jsonc`). Das führt zu 'Input sequence length exceeds'-Drops, falschen Modell-Wahrheiten beim Dispatch und manueller Doppelpflege.

## What Changes

- **SSOT-Konsolidierung**: `.opencode/agent-models.jsonc` bleibt Single Source of Truth; Sync bleibt via `scripts/opencode-sync-agents.sh`.
- **Kontext-Limit-Kalibrierung**: `limit.context` des FreeToken-Qwen3.6-35B ('active') an die gemessene KV-Ceiling angleichen; fake/überdeklarierte Limits (z.B. big-pickle 1M) durch realistische Werte mit Messdatum ersetzen.
- **Stale-Modell-Bereinigung**: Modell-Einträge ohne Existenz-Beleg (kein Loadout, kein `/models`-Eintrag) entfernen.
- **Compaction-Tuning**: `compaction`-Parameter (buffer/keep.tokens) an die kalibrierte Grenze anpassen, damit Auto-Compact unterhalb der Ceiling feuert.
- **Dokumentations-Abgleich**: AGENTS.md-Tabelle, `docs/agent-guide/registry/agents.yaml`, `.claude/agents/*.md` aus der SSOT ableiten bzw. Drift beheben.
- **Config-Visualisierung (neu)**: generierte Markdown-Tree-Übersicht von Providern/Modellen/Agenten mit Limit+Messdatum+Status (ok|stale|fehlt|unbelegt), regenerierbar per Skript, nie hand-editiert. Plus nvim-Hinweis (jsonc-Highlighting, `foldmethod=syntax`).
- **Globale Duplikat-Bereinigung**: `~/.config/opencode/opencode.json` + `.bak`-Dateien konsolidieren/archivieren.

## Capabilities

### New Capabilities
- `opencode-agent-config-sync`: SSOT-Pfad für opencode-Agenten/Modelle — deklarierte Limits, Existenz-Beleg-Regeln, Sync-Kontrakt, Dokumentations-Ableitung und generierte Config-Visualisierung.

### Modified Capabilities
_keine_ — bestehende SSOT-Specs (`opencode-local-model-runner`, `llm-local-dev`) decken diesen Bereich nicht ab; neue Capability entsteht.

## Impact

- `.opencode/agent-models.jsonc` (SSOT, limit.context/Modelle/Agenten)
- `.opencode/opencode.jsonc` (compaction; Provider-Kommentare)
- `scripts/opencode-sync-agents.sh` (falls Viz- oder Dokumentations-Ableitung ergänzt wird)
- `AGENTS.md`, `docs/agent-guide/registry/agents.yaml`, `.claude/agents/*.md`
- Neu: `scripts/opencode-config-viz.sh` + `docs/agent-guide/registry/config-overview.md` (generiert)
- Global: `~/.config/opencode/opencode.json{,c,.bak*}` (Konsolidierung, nur mit Nutzer-Aktion im Worktree-Host)
- Verwandt: T014105 (KV-Ceiling-Messung), T016419 (Roster-Cleanup), T002298 (exakte Agent-Namen), T004808 (auth.json-Prinzip: keine Secrets in Dateien)
