# Proposal: local-llm-proxy

## Why

T002015 hat die Provider-**Entscheidung** in die DB-SSOT konsolidiert — der **Datenpfad** bleibt
fragmentiert: Der Fixup-Proxy `:18235` (patcht den `role:"system"`-Mid-Array-Bug des
Bonsai-Servers) läuft ad-hoc außerhalb des Repos; DB-Zeilen driften bereits wieder
(`factory-implement`/`-review` + zwei `factory_model_slots` zeigen direkt auf `:8093/v1` und
umgehen den Patch); `route-provider.sh` trägt noch den `qwythos-9b-v2`@`:1234`-Hardcode. Model-IDs
stehen statisch in der DB — fällt ein Backend aus oder wechselt das geladene Modell, laufen
Requests gegen stale IDs in Fehler statt auf verfügbare Modelle auszuweichen. Für den Datenpfad
gibt es keine GUI: weder zeigt der Steuerung-Tab, welche Backends/Modelle jetzt erreichbar sind,
noch hat das Sidekick-Submenü einen LLM-Proxy-Eintrag.

## What

- **Repo-verwalteter Proxy** `scripts/llm-proxy/` (Node, Port 18235 — ersetzt den Ad-hoc-Proxy
  in-place): alleiniges Gateway für llama.cpp (`:8093`), LM Studio Windows (`:1234`), DeepSeek
  API und Opencode Go (opencode-zen). Backend-Registry in neuer Tabelle
  `tickets.llm_proxy_backends`; Fixups (inkl. Bonsai-System-Role-Patch) als benannte
  Transformationen; `task llm:proxy:start|stop|status|logs`.
- **Dynamische Modell-Discovery**: 30s-`/v1/models`-Probe je Backend, aggregiertes
  `GET /v1/models`, Routing exakte ID → Alias → **Verfügbarkeits-Fallback** auf das erste Modell
  des höchstprioren gesunden Backends (Substitution sichtbar via `x-llm-proxy-*`-Header).
- **GUI**: `LlmProxyPanel.svelte` im Steuerung-Tab (`/admin/pipeline?tab=control`,
  control-extras) + neuer Sidekick-Submenü-Eintrag `llm-proxy` mit `LlmProxyView.svelte`;
  Website-API `/api/admin/llm-proxy/*` (CRUD + offline-toleranter Status-Proxy) nach dem
  `/api/admin/ki/providers`-Muster.
- **Konsolidierung**: Migration biegt Drift-Zeilen (`provider_config`, `factory_model_slots`)
  und `route-provider.sh`-Hardcodes auf `:18235`; Direktzugriff auf `:8093`/`:1234` ist danach
  nur noch proxy-intern.

Design-Detail: `openspec/changes/local-llm-proxy/design.md`

_Ticket: T002081 (Vorgänger T002069/T002015)_
