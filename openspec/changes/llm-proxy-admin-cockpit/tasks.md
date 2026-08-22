---
title: "llm-proxy-admin-cockpit — Implementation Plan"
ticket_id: T013909
domains: [factory, website, infra]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-proxy-admin-cockpit — Implementation Plan

_Ticket: T013909 · Proposal: `openspec/changes/llm-proxy-admin-cockpit/proposal.md` · Partial-Modus (T002074)_

Die Proxy-Administration zieht vollständig ins SDLC-Cockpit. Dafür bekommt der Proxy einen zweiten,
token-geschützten Listener auf der k3d-Bridge-IP, das Cockpit erreicht ihn über einen Service mit
manuellen Endpoints, die fehlenden Loadout-Routen kommen dazu, und die proxy-eigene `/admin`-Seite
entfällt. Der `catch`-Zweig des Statusendpunkts unterscheidet künftig einen nicht laufenden von
einem nicht adressierbaren Proxy.

## Partials

| id | file | role | target_files |
|----|------|------|--------------|
| p1-listener | tasks.d/p1-listener.md | impl | scripts/llm-proxy/listeners.mjs, scripts/llm-proxy/server.mjs, scripts/llm-proxy/llm-proxy.service, scripts/llm-proxy/ui/index.html, taskfiles/Taskfile.llm.yml |
| p2-manifests | tasks.d/p2-manifests.md | impl | k3d/sdlc-stack/llm-proxy-host.yaml, k3d/sdlc-stack/sdlc-console.yaml, k3d/sdlc-stack/kustomization.yaml, k3d/secrets.yaml |
| p3-routes | tasks.d/p3-routes.md | impl | components/website/src/lib/sdlc/llm-proxy-client.ts, components/website/src/pages/sdlc/api/llm-proxy/status.ts, components/website/src/pages/sdlc/api/llm-proxy/loadouts.ts, components/website/src/pages/sdlc/api/llm-proxy/loadouts/status.ts, components/website/src/pages/sdlc/api/llm-proxy/loadouts/pin.ts, components/website/src/pages/sdlc/api/llm-proxy/loadouts/[slug]/[action].ts, components/website/src/pages/sdlc/api/llm-proxy/models.ts, components/website/src/lib/sdlc/llm-proxy-factory.ts, components/website/src/lib/sdlc/model-catalog.ts |
| p4-ui | tasks.d/p4-ui.md | impl | components/website/src/components/sdlc/factory/LlmProxyPanel.svelte, components/website/src/components/sdlc/factory/LlmLoadoutPanel.svelte |
| p5-tests | tasks.d/p5-tests.md | tests | scripts/llm-proxy/listeners.test.mjs, tests/spec/local-llm-proxy/host-listener-auth.bats, tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats, components/website/src/lib/sdlc/__tests__/llm-proxy-client.test.ts, components/website/src/data/test-inventory.json |

## File Structure

```
scripts/llm-proxy/listeners.mjs                                          (neu — Bridge-Discovery, Bearer-Guard, Listener-Start)
scripts/llm-proxy/listeners.test.mjs                                     (neu — node:test für Discovery + Guard)
scripts/llm-proxy/server.mjs                                             (mod — Handler extrahieren, startListeners, /admin/state-Identität, /admin ohne UI)
scripts/llm-proxy/llm-proxy.service                                      (mod — LLM_PROXY_ADMIN_TOKEN dokumentieren)
scripts/llm-proxy/ui/index.html                                          (weg — proxy-eigene Admin-Seite entfällt)
taskfiles/Taskfile.llm.yml                                               (mod — Statusausgabe nennt beide Listener)
k3d/sdlc-stack/llm-proxy-host.yaml                                       (neu — Service + Endpoints auf die Host-Bridge-IP)
k3d/sdlc-stack/sdlc-console.yaml                                         (mod — LLM_PROXY_URL + LLM_PROXY_ADMIN_TOKEN)
k3d/sdlc-stack/kustomization.yaml                                        (mod — neue Ressource referenzieren)
k3d/secrets.yaml                                                         (mod — Dev-Wert für LLM_PROXY_ADMIN_TOKEN)
components/website/src/lib/sdlc/llm-proxy-client.ts                       (neu — Basis-URL, Token-Header, Fehlerklassifikation)
components/website/src/lib/sdlc/__tests__/llm-proxy-client.test.ts        (neu — Vitest für die Klassifikation)
components/website/src/pages/sdlc/api/llm-proxy/status.ts                 (mod — unreachable von stopped trennen)
components/website/src/pages/sdlc/api/llm-proxy/loadouts.ts               (neu — GET/PUT Loadout-Dokument)
components/website/src/pages/sdlc/api/llm-proxy/loadouts/status.ts        (neu — GET Loadout-Status)
components/website/src/pages/sdlc/api/llm-proxy/loadouts/pin.ts           (neu — Pin lesen und setzen)
components/website/src/pages/sdlc/api/llm-proxy/loadouts/[slug]/[action].ts (neu — POST start|stop)
components/website/src/pages/sdlc/api/llm-proxy/models.ts                 (neu — GET Modellkatalog des Proxy)
components/website/src/lib/sdlc/llm-proxy-factory.ts                      (mod — auf den gemeinsamen Client umstellen)
components/website/src/lib/sdlc/model-catalog.ts                          (mod — auf den gemeinsamen Client umstellen)
components/website/src/components/sdlc/factory/LlmProxyPanel.svelte       (mod — Zustände trennen, Identität anzeigen)
components/website/src/components/sdlc/factory/LlmLoadoutPanel.svelte     (neu — Loadout-Verwaltung)
tests/spec/local-llm-proxy/host-listener-auth.bats                        (neu — Listener + Token-Verhalten)
tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats                 (neu — Zustandsunterscheidung)
components/website/src/data/test-inventory.json                           (mod — regeneriert)
```

## S1-Budgets (wirksame Schwelle, alle Dateien nicht-baselined)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/llm-proxy/server.mjs` | 742 | 58 |
| `components/website/src/pages/sdlc/api/llm-proxy/status.ts` | 40 | 860 |
| `components/website/src/lib/sdlc/llm-proxy-factory.ts` | 101 | 799 |
| `components/website/src/lib/sdlc/model-catalog.ts` | 180 | 720 |
| `components/website/src/components/sdlc/factory/LlmProxyPanel.svelte` | 168 | 932 |

`server.mjs` ist der enge Fall: 58 Zeilen bei 742 von 800. Deshalb wird die gesamte Listener- und
Auth-Logik nach `listeners.mjs` **extrahiert** statt in `server.mjs` ergänzt — ein echter Split, kein
Zusammenziehen. Der Nettozuwachs in `server.mjs` bleibt damit im einstelligen Bereich, weil der
Wegfall des `readFileSync` für die Admin-Seite Zeilen zurückgibt. `.yaml`, `.bats` und `.service`
sind ungated.

Die `any`-Zählung in `components/website/src` steht bei 0 und darf nicht steigen; jede neue
Route und jede Client-Funktion wird typisiert.

## Reihenfolge und Abhängigkeiten

`p1` und `p2` sind unabhängig voneinander, müssen aber beide fertig sein, bevor `p3` gegen einen
erreichbaren Proxy geprüft werden kann. `p4` setzt die Routen aus `p3` voraus. `p5` schreibt die
Tests und läuft zuletzt; der rote Test aus Schritt 1 von `p5` entsteht jedoch **vor** der
Implementierung — siehe dort.

## Abschluss

- [ ] **Verifikation** — der abschließende Gate-Lauf, ausgeführt als letzter Task von
      `tasks.d/p5-tests.md`:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
