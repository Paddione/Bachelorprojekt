# Proposal: agent-model-slots

## Why

Qwythos (`qwythos`, `qwythos-hq`) wird in der opencode-Agent-Config für
Implementation/Planning-Subagenten verwendet, obwohl es laut
`subagent-provisioning.md` §5 eine feste Identitäts-Direktive in jede
System-Message injiziert und nur für Brainstorming/Kreativtext geeignet ist —
nicht für Tool-Calling-lastige Arbeit. Gleichzeitig ist die
Phase→Modell-Zuordnung der Software Factory (`scripts/factory/pipeline.js`,
`route-provider.sh`) nur im Skript hardcodiert, ohne Persistenz oder UI, und
die opencode-Agent-Config selbst liegt unversioniert im User-Home
(`~/.config/opencode/opencode.jsonc`).

## What

- Qwythos vollständig aus der opencode-Agent-Config entfernen.
- Neuer Single-Session-Slot `Qwen3-14B` (`lmstudio-community/Qwen3-14B-GGUF`,
  `Q4_K_M`) für Implementation/Planning-Subagenten; das bestehende
  Multiagent-Modell (`qwen35-iq4`) bleibt unverändert.
- Neue versionierte Repo-Vorlage `.opencode/agent-models.jsonc` als Source of
  Truth für den `agent`-Block + Sync-Script auf den opencode-Host.
- Interaktiver Modell-Picker fürs opencode-TUI (`scripts/agent-model-select.sh`).
- Postgres-Tabelle für pro-Phase Factory-Modell-Slots
  (scout/plan/implement/verify/deploy) + `route-provider.sh` liest daraus.
- Neue Factory-Floor-UI-Komponente (Kore-Design) zur Slot-Auswahl.

Details: `docs/superpowers/specs/2026-07-09-agent-model-slots-design.md`.

_Ticket: T001733_
