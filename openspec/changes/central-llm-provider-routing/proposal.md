# Proposal: central-llm-provider-routing

## Why

Eine Repo-weite Bestandsaufnahme zeigt 24 Aufrufstellen für LLM-Provider-Auswahl, verteilt auf
mindestens sechs unabhängige Entscheidungspfade (`provider-config.ts`, `openai-compatible-session-agent.ts`,
`legacy-session-agent.ts`, `suggest-providers.ts`, `route-provider.sh`, `provider-router.js`), plus drei
Stellen, die roh `process.env.ANTHROPIC_API_KEY` lesen, und je eine vierte/fünfte unabhängige Config-
Oberfläche in `pipeline.js` und `scripts/factory/mcp-go/main.go`. `provider-router.js` ist bereits von
`route-provider.sh` abgedriftet (`ternary-bonsai-27b`@`18235` vs. `qwythos-9b-v2`@`1234`) — ein
Live-Beweis, dass parallele Implementierungen derselben Entscheidung nicht synchron bleiben. Der neu
installierte `ternary-bonsai-27b`-Server (nur erreichbar über den Fixup-Proxy `:18235`) soll jetzt der
einzige aktive Provider werden; das an sechs Stellen synchron nachzuziehen ist genau das Problem.

## What

- `tickets.provider_config`/`provider_health` (DB) bleibt SSOT. `website/src/lib/provider-config.ts`
  bleibt die TS-Referenzimplementierung, bekommt eine neue Funktion `getProviderByName(providerName, brand?)`
  für Stellen mit expliziter Nutzerwahl (Coaching, Admin-Cockpit) neben dem bestehenden
  `getProviderConfig(source, tier)` für automatisches Tier-Cascading.
- Alle TS-Call-Sites mit eigener Provider-URL-Logik (`openai-compatible-session-agent.ts`,
  `legacy-session-agent.ts`, `tickets/suggest-providers.ts`, `coaching-classifier.ts`,
  `admin/coaching/sessions/[id]/complete.ts`, `demo/coaching-sim.ts`, `claude-session-agent.ts`)
  delegieren nur noch an eine dieser zwei Funktionen — keine eigenen URL-/Modell-Tabellen, keine
  rohen `process.env.ANTHROPIC_API_KEY`-Fallbacks mehr.
- `scripts/factory/route-provider.sh` bleibt die bash-Parität; Opus-/Emergency-Hardcode wird von
  `qwythos-9b-v2`@`127.0.0.1:1234` auf `ternary-bonsai-27b`@`http://127.0.0.1:18235` korrigiert.
  `pipeline.js`s inline `FACTORY_MODEL`-Const und `auto-triage.sh`s eigene Provider→URL-`case`-Tabelle
  entfallen zugunsten von Laufzeit-Aufrufen gegen `route-provider.sh`.
- `scripts/factory/provider-router.js` + `provider-router.test.mjs` werden gelöscht (dritte,
  abgedriftete, zur Laufzeit tote Implementierung).
- `scripts/factory/mcp-go/main.go`s `factory_ask`-Handler shellt zu `route-provider.sh` statt eigener
  `FACTORY_LLM_*`-Env-Defaults zu nutzen — kein neuer Go-DB-Treiber.
- Neue DB-Seed-Migration setzt `ternary-bonsai-27b` als einzigen `enabled=true`-Provider (alle anderen
  Zeilen `enabled=false`, nicht gelöscht — reversibel ohne Code-Änderung).
- Bewusst außen vor: `.opencode/*` (Dev-Harness-Modellwahl) und `scripts/factory/ci-review.mjs`
  (Cloud-Codereview-Qualität).

Design-Detail: `docs/superpowers/specs/2026-07-21-central-llm-provider-routing-design.md`

_Ticket: T002015_
