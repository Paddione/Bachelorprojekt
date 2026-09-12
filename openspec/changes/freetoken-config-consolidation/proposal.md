# Proposal: freetoken-config-consolidation

## Why

T900163 hat FreeToken nur auf der Agent-Routing-Ebene entfernt (`.opencode/agent-models.jsonc`
re-routet, `.opencode/plugin/freetoken-active.ts` gelöscht) und den OpenSpec-Change
`ssot-consolidation-stale-cleanup` dabei selbst unvollständig gelassen (steht weiter auf
`plan_staged`, 0/15 Tasks). Drei weitere Ebenen zeigen FreeToken (Windows-nativ, Port 1919)
weiterhin als aktiv oder default, obwohl der Prozess laut Betreiber nicht mehr läuft:

1. **Projekt-Default** (`.opencode/opencode.jsonc`): `"model": "freetoken-local/active"`,
   begründet mit einem inzwischen falschen Kommentar ("der alte llama.cpp-Stack (:18235) ist
   stillgelegt") — tatsächlich bedient `:18235` (llm-proxy) bereits alle re-routeten Agenten aus
   `agent-models.jsonc`.
2. **Factory-Proxy-Default** (`scripts/llm/loadouts.json`): `factory.model = "freetoken-local"`,
   plus ein eigener `freetoken-local`-Loadout-Eintrag (Port 1919, `managed: external`).
   `scripts/factory/route-provider.sh` und `scripts/llm/routing-check.sh` verdrahten denselben
   `:1919`-Endpoint als Fallback/Probe.
3. **OpenSpec-Backlog**: `openspec/specs/llm-local-dev.md` enthält weiterhin aktive Requirements,
   die die Existenz von `freetoken-active.ts` voraussetzen (bereits gelöscht — SSOT lügt).
   `openspec/changes/freetoken-local-backend/` liegt unarchiviert im Backlog, obwohl das Feature
   komplett entfernt wurde.

Sichtbares Symptom: das SDLC-Dashboard (`/admin/state`) zeigt "FreeToken aktiv", weil es
`loadouts.json` liest — der Teil, den T900163 nicht angefasst hat.

## What

- Projekt-Default und Factory-Default auf `llamacpp-local/qwen38-220k` (Port 18235, `enabled:true`
  in `loadouts.json`) umstellen — denselben Zielzustand, den T900163 für die Agent-Routing-Ebene
  bereits gewählt hat.
- `freetoken-local`-Loadout-Eintrag, `:1919`-Fallback in `route-provider.sh`, `:1919`-Probe in
  `routing-check.sh` und den toten Pfad-Verweis in `measure-factory-context.mjs` entfernen.
- `docs/agent-guide/registry/agents.yaml` (Mirror von `agent-models.jsonc`) nachziehen.
- `openspec/specs/llm-local-dev.md`: REMOVED-Delta für die `freetoken-active.ts`-Requirements.
- `openspec/changes/freetoken-local-backend/` archivieren (Feature entfernt, nicht implementiert).
- Tests, die den FreeToken-Default als korrekt fixieren (`qwen38-default-backend.bats`,
  `freetoken-local-backend/routing.bats`), auf den neuen Zielzustand umstellen bzw. entfernen.

_Ticket: T900164_
