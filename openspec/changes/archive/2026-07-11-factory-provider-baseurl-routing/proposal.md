# Proposal: factory-provider-baseurl-routing

## Zusammenfassung

Ticket T001681 (bug, priority niedrig, brand mentolder). `scripts/factory/pipeline.js`
und `scripts/factory/build-loop.cjs` reichen bei lokalem Provider-Routing
(`provider_config.provider='local-qwen35'`) einen beliebigen `modelId`-String plus
`baseUrl` unverändert an die harness-eigene `agent()`-Primitive durch, die aber nur
`model ∈ {sonnet,opus,haiku,fable}` akzeptiert (kein `baseUrl`-Feld). Dadurch geht das
lokale Routing für `factory-scout`/`factory-plan` still und ungeloggt verloren.

Root-Cause-Analyse und Fix-Ansatz: siehe
`docs/superpowers/specs/2026-07-09-factory-provider-baseurl-routing-design.md`.

## Fix (zwei Teile)

1. **Migration-Scope-Korrektur** (`scripts/migrations/2026-07-03-local-qwen35-seed.sql`):
   `factory-scout`, `factory-plan`, `lavish-artifact` aus der Demotion-CTE und dem
   INSERT-Block entfernen — nur `ticket-triage` bleibt (einziger Source mit eigenem
   baseURL-fähigem SDK-Client, siehe `website/src/lib/ticket-triage.ts`).
2. **Defensiver Guard `resolveAgentModel`** in `scripts/factory/build-loop.cjs`, verdrahtet
   an allen 6 Aufrufstellen (`pipeline.js` x5, `build-loop.cjs` x1), die bisher
   `model: X.modelId` ungeprüft an `agent()` durchreichen. Custom-Provider-Strings mit
   `baseUrl` werden sichtbar geloggt und auf einen gültigen Harness-Tier zurückgefallen,
   statt still verworfen zu werden.

Kein neuer Agent-Loop, keine Ersetzung der agentischen `agent()`-Primitive — das wäre
unverhältnismäßig zur Ticket-Priorität (siehe Spec, Abschnitt "Warum echtes lokales
Routing nicht sinnvoll ist").
