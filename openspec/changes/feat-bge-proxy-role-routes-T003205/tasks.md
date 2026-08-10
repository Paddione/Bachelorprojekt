---
title: "feat-bge-proxy-role-routes-T003205 — Implementation Plan"
ticket_id: T003205
domains: [bachelorprojekt-infra, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# feat-bge-proxy-role-routes-T003205 — Implementation Plan

_Ticket: T003205_

## File Structure

```
scripts/llm-proxy/bge-routes.mjs                        (neu)  Rollenauflösung + Failover-Kette
scripts/llm-proxy/server.mjs                            (geändert) zwei Routen anschließen
scripts/llm/loadouts.json                               (geändert) Top-Level-Schlüssel `roles`
scripts/bge-mcp/bge-mcp.service                         (geändert) Upstreams + Startbedingung
scripts/openspec-embed-local.sh                         (geändert) Default-URL + Fehlertext
scripts/llm-proxy/bge-routes.test.mjs                   (neu)  Failover gegen Stub-Upstreams
tests/spec/local-llm-proxy/bge-role-routes.bats         (neu)  RED-Phase, Routen am Proxy
tests/spec/local-llm-proxy/gateway-consumer-lint.bats   (geändert) bge-Flächen aufnehmen
Taskfile.yml                                            (geändert) neue .test.mjs registrieren
.github/workflows/ci.yml                                (geändert) neue .test.mjs registrieren
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-bge-routes-module.md | impl | scripts/llm-proxy/bge-routes.mjs | |
| P2 | tasks.d/p2-proxy-wiring.md | impl | scripts/llm-proxy/server.mjs, scripts/llm/loadouts.json | P1 |
| P3 | tasks.d/p3-consumers.md | impl | scripts/bge-mcp/bge-mcp.service, scripts/openspec-embed-local.sh | P2 |
| P4 | tasks.d/p4-tests.md | tests | scripts/llm-proxy/bge-routes.test.mjs, tests/spec/local-llm-proxy/bge-role-routes.bats, tests/spec/local-llm-proxy/gateway-consumer-lint.bats, Taskfile.yml, .github/workflows/ci.yml | P1 |

## S1-Budgets

Wirksame Schwelle = Limit aus `docs/code-quality/gates.yaml` (keine der Dateien steht in
`docs/code-quality/baseline.json`, es gilt also das Limit, nicht ein Baseline-Wert).

| Datei | ist | Budget |
|---|---|---|
| `scripts/llm-proxy/server.mjs` | 617 | 183 |
| `scripts/openspec-embed-local.sh` | 132 | 668 |

`scripts/llm/loadouts.json`, `scripts/bge-mcp/bge-mcp.service`, die `.bats`-Dateien sowie
`Taskfile.yml` und `.github/workflows/ci.yml` tragen Endungen ohne S1-Limit — für sie ist keine
Budgetangabe sinnvoll. `scripts/llm-proxy/bge-routes.mjs` ist neu; das `.mjs`-Limit von 800 ist
der Rahmen, in dem es entstehen muss.

Der Zuschnitt hält `server.mjs` bewusst klein: die Rollenauflösung und die gesamte Failover-Logik
liegen in `bge-routes.mjs`, `server.mjs` bekommt nur die beiden Weiterleitungen. Damit bleibt der
Zuwachs dort im niedrigen zweistelligen Bereich und weit innerhalb der 183 Zeilen Reserve.

## Reihenfolge

P4 schreibt zuerst den roten Test (er hängt nur an P1s Modulpfad, nicht an dessen Inhalt), dann
laufen P1 → P2 → P3. Erst mit P2 wird der Test grün, weil vorher keine Route am Proxy hängt.

## Verify (RED → GREEN)

Der Failing-Test-Step liegt in `tasks.d/p4-tests.md` (Rolle `tests`) — dort steht der rote Lauf
mit Testrunner-Aufruf.

- [x] **Final Verification.** Die drei verpflichtenden Gates laufen lassen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Erfolgskriterien am laufenden System prüfen** (nicht CI-fähig, deshalb hier als
- [ ] **Erfolgskriterien am laufenden System prüfen** (nicht CI-fähig, deshalb hier als
      Abnahme-Schritt und nicht als Test) — **offen, gehört NACH den Merge.**

      Teilweise vorab belegt (2026-08-10, ohne Eingriff in die laufenden Dienste): eine
      zweite Proxy-Instanz aus diesem Worktree auf Port 18299 beantwortete
      `POST /v1/embeddings` und `POST /v1/rerank` jeweils mit **200**, und `/v1/models`
      blieb bge-frei. Das belegt die Verdrahtung in `server.mjs` (Kriterien 1, 2, 6).
      Offen bleiben die Kriterien, die den installierten Systemdienst betreffen (3, 4, 5):
      Sie verlangen, dass der Code unter `/home/patrick/Bachelorprojekt` liegt und
      `llm-proxy.service` / `bge-mcp.service` neu gestartet werden — beides erst nach dem
      Merge sinnvoll. Bis dahin skippen die beiden BATS-Routen-Tests mit dem Hinweis
      „laufende Proxy-Instanz kennt … nicht (HTTP 501)".

```bash
# Forwards absichtlich anhalten, damit der lokale Pfad allein trägt
systemctl --user stop bge-forward-embed.service bge-forward-rerank.service

curl -s -o /dev/null -w '%{http_code} %header{x-llm-proxy-bge-upstream}\n' \
  -X POST http://127.0.0.1:18235/v1/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-m3","input":["test"]}'
# erwartet: 200 bge-embed-cpu

curl -s -o /dev/null -w '%{http_code} %header{x-llm-proxy-bge-upstream}\n' \
  -X POST http://127.0.0.1:18235/v1/rerank \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-reranker-v2-m3","query":"a","documents":["b","c"]}'
# erwartet: 200 bge-rerank-cpu

systemctl --user restart bge-mcp.service && systemctl --user is-active bge-mcp.service
# erwartet: active — der Shim startet ohne Cluster-Verbindung

systemctl --user start bge-forward-embed.service bge-forward-rerank.service
```
