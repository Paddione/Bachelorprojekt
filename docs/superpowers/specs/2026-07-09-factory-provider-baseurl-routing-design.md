---
title: Factory-Pipeline Provider-Routing verwirft baseUrl bei agentischen Phasen
ticket_id: T001681
plan_ref: openspec/changes/factory-provider-baseurl-routing/tasks.md
status: draft
---

# Root-Cause

`scripts/factory/pipeline.js` und `scripts/factory/build-loop.cjs` rufen für
`factory-scout`/`factory-plan`/`factory-implement`/`factory-review` die
harness-injizierte `agent()`-Primitive auf (`globalThis.agent`, siehe
Workflow-Tool-Kontrakt: `opts.model` ist auf das Enum `sonnet|opus|haiku|fable`
beschränkt). `routeProviderSync()` liefert bei einem `provider_config`-Treffer
mit `provider='local-qwen35'` jedoch einen beliebigen `modelId`-String
(`qwen3.5-9b@iq4_xs`) plus `baseUrl` zurück — beides wird unverändert als
`{ model: route.modelId }` an `agent()` durchgereicht (`pipeline.js:151,303,419,495,543`,
`build-loop.cjs:66`). Die `agent()`-Primitive kennt kein `baseUrl`-Feld und
akzeptiert nur die vier festen Modell-Tiers; ein Custom-String bricht die
Tool-Call-Validierung oder wird schlicht ignoriert — in jedem Fall geht das
lokale Routing verloren, ohne dass dies sichtbar geloggt wird.

Im Gegensatz dazu ruft `website/src/lib/ticket-triage.ts` **keine** agentische
Multi-Step-Primitive auf, sondern instanziiert einen eigenen Anthropic-SDK-Client
mit `baseURL: cfg.baseUrl` für eine einzelne Klassifikations-Completion — dort
funktioniert `base_url`-Routing bereits produktiv (T001680-Folge).

`lavish-artifact` hat keinen einzigen Laufzeit-Aufruf von
`getProviderConfig(SOURCE.lavishArtifact, ...)` im Code — nur einen
Katalog-Eintrag in `website/src/lib/ki-services.ts:41` für die Admin-UI.

# Warum "echtes" lokales Routing für factory-scout/factory-plan nicht sinnvoll ist

`factory-scout` und `factory-plan` sind **agentische** Phasen: sie brauchen
Tool-Use (Datei-Reads, Codebase-Suche, mehrstufige Reasoning-Loops), die die
`agent()`-Primitive des Workflow-Harness bereitstellt. Ein Ersatz durch einen
rohen HTTP-Chat-Completion-Client (analog `ticket-triage.ts`) würde die
gesamte Tool-Use-Fähigkeit für diese Phasen verlieren, sofern das lokale
Modell keinen äquivalenten Function-Calling-Loop unterstützt — das wäre eine
komplette Neu-Implementierung eines Agent-Loops außerhalb des Harness, nicht
ein Wiring-Fix. Das steht außer Verhältnis zur Ticket-Priorität (niedrig).

# Fix-Ansatz (Ticket-Option 3 + Sicherheitsnetz)

1. **Scope-Korrektur der Migration** (`scripts/migrations/2026-07-03-local-qwen35-seed.sql`):
   `factory-scout`, `factory-plan`, `lavish-artifact` aus den geseedeten Sources
   entfernen. `ticket-triage` bleibt (funktioniert nachweislich). Die
   Prioritäts-Demotion-Query filtert entsprechend nur noch auf `ticket-triage`.
2. **Defensiver Guard in `pipeline.js`**: neue Helper-Funktion
   `resolveAgentModel(route, fallbackTier)`, die `route.modelId` nur
   durchreicht, wenn es eines der vier harness-gültigen Tiers ist
   (`sonnet|opus|haiku|fable`); andernfalls wird `fallbackTier` verwendet und
   `log(...)` eine explizite Warnung ausgibt ("baseUrl/custom model dropped —
   harness agent() only supports fixed tiers"). Ersetzt alle fünf
   `model: X.modelId`-Stellen in `pipeline.js` (Zeilen 151, 303, 419, 495, 543)
   und die eine Stelle in `build-loop.cjs:66`.
3. Damit ist der bisher stille Silent-Fallback (aktuell: unklares Crash/Ignore-
   Verhalten) durch ein **sichtbares, geloggtes** Fallback-Verhalten ersetzt —
   und die DB enthält keine Provider-Config-Rows mehr, die für agentische
   Phasen wirkungslos vorgaukeln, lokales Routing zu greifen.

# Edge Cases

- `ANTHROPIC_MODEL`-Env-Override-Pfad (`pipeline.js:32-34`, `anthropic-compat`)
  liefert ebenfalls einen beliebigen Modell-String + `baseUrl` — derselbe Guard
  greift hier identisch (Environment-Override ist kein Sonderfall).
- `routeProviderSync` liefert bei `tier==='opus'` immer `baseUrl:null` +
  festen `modelId` → Guard ist ein No-Op (Tier ist bereits gültig).
- Guard muss die *Route*, nicht das Roh-`prov`-Objekt aus `build-loop.cjs`
  prüfen (dort wird `prov.modelId || prov.model` verwendet — beide Felder
  müssen durch den Guard laufen).
