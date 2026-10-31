---
title: "retrieval-chains-split — Implementation Plan"
domains: [infra, llm, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# retrieval-chains-split — Implementation Plan

Getrennte Retrieval-Ketten je Vektorraum im llm-proxy des devmesh: `embed` (bge-m3,
Tablet zuerst), `rerank` (bge, unverändert), neu `lfm-embed`, `colbert-embed` und
`colbert-rerank` (MaxSim als eigener Cluster-Service). Kein Quer-Fallback zwischen
Räumen: ist eine Kette erschöpft, antwortet der Proxy 503 mit Grund je Glied.
Danach PK-Desktop-Rückbau (`:8093`, `:8095`/`:8097`-Forwards, Consumer-Migration).

## Ausgangslage (belegt 2026-10-26)

- Proxy-Code: `scripts/llm-proxy/bge-routes.mjs` kennt nur `/v1/embeddings` und
  `/v1/rerank`; die Rolle kommt aus dem Pfad (`server.mjs`, Weiterleitung mit
  `roleForPath`). RED-Beleg auf `main`: `roleForPath('/v1/lfm/embeddings')`,
  `roleForPath('/v1/colbert/embeddings')` und `roleForPath('/v1/colbert/rerank')`
  liefern `null`; solche Pfade fallen heute ins Chat-Fallback `proxyV1`
  (exakt die Fehlerklasse aus T003203).
- Registry live: Kette `embed` ist Cluster (Priorität 10), Tablet (15), lmstudio
  (20); Kette `rerank` ist Tablet (5), Cluster (10). Quelle:
  `dev-local/components/llm-services/deployment.yaml` (`LLM_PROXY_BACKENDS_JSON`).
- E3-Rückfall `scripts/llm/loadouts.json` (Top-Level `roles`) enthält noch die
  alte Desktop-Topologie (`:8085`, `:8081`, `:1234`, `:8093`).
- `allow-llm-tablet-egress` existiert (Netzwerkrichtlinie für `app=llm-services`
  Richtung `100.94.91.65/32` auf `:8080`/`:8081`); ebenso Service und
  Endpunktscheibe `llm-gateway-tablet` sowie die Cluster-Dienste
  `llm-gateway-lfm-embed` und `llm-gateway-lfm-colbert`. Kein Plan-Bedarf dort,
  nur Verifikation.
- MaxSim läuft heute auf PK-Desktop (`scripts/colbert_rerank.py`, Dienst
  `serve-colbert-api` auf `:8093`, Upstream `:8097`). Der Kopf von
  `k3d/llm-retrieval-gpu.yaml` hält fest, dass `:8093` lokal bleibt; diese
  Entscheidung wird mit diesem Plan ersetzt.

## Entscheidungen

- D1: Eine Rolle je Familie (`embed`, `rerank`, `lfm-embed`, `colbert-embed`,
  `colbert-rerank`). Kettenmitglieder nur innerhalb desselben Vektorraums.
  Kette erschöpft: 503 mit Grund je Glied (vorhandene `routeRequest`-Semantik).
- D2: Die Rolle kommt weiter aus dem Pfad, nie aus dem Modellfeld. Neue Pfade:
  `/v1/lfm/embeddings`, `/v1/colbert/embeddings`, `/v1/colbert/rerank`.
- D3: Registry-Reihenfolge `embed`: Tablet (Priorität 5), Cluster (10). Neu:
  `cluster-lfm-embed` und `cluster-lfm-colbert` (Priorität 10, Rollen
  `lfm-embed`/`colbert-embed`) sowie `cluster-colbert-maxsim` (Priorität 10,
  Rolle `colbert-rerank`). Der `lmstudio`-Eintrag in Kette `embed` wird per
  Dim-Prüfung (Runbook-Gate E5) bestätigt oder aus der Rolle entfernt.
- D4: Der `roles`-Block in `scripts/llm/loadouts.json` (E3-Rückfall) spiegelt
  die neuen Ketten mit Tablet- und Cluster-Adressen; Desktop-Loopbacks
  entfallen dort.
- D5: MaxSim zieht als eigener Cluster-Dienst (`llm-gateway-colbert-maxsim`,
  CPU, ruft `llm-gateway-lfm-colbert` auf) nach dem Muster von `lfm-colbert`
  in den Cluster. Der Dienst antwortet kanonisch auf `/v1/colbert/rerank`
  (kompatibel weiter auf `/v1/rerank`); der Proxy reicht den kanonischen Pfad
  unverändert durch.
- D6: Kein Health-Gate; Failover bleibt anfragegetrieben (Timeout je Glied
  60 s, begründet in T002838). Lange Wartezeiten bei Vollausfall sind bekannt
  und akzeptiert.

## File Structure

| Datei | Ist | Rest |
|---|---|---|
| `scripts/llm-proxy/bge-routes.mjs` | 227 | 573 |
| `scripts/llm-proxy/server.mjs` | 336 | 464 |
| `scripts/llm-proxy/bge-routes.test.mjs` | 210 | 590 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py` | 58 | 742 |
| `scripts/llm/loadouts.json` | n/a | n/a (JSON, S1-ungated) |
| `dev-local/components/llm-services/deployment.yaml` | n/a | n/a (YAML, S1-ungated) |
| `k3d/kustomization.yaml` | n/a | n/a (YAML, S1-ungated) |
| `k3d/llm-retrieval-gpu.yaml` | n/a | n/a (YAML, S1-ungated) |
| `docs/runbooks/bge-role-registry.md` | n/a | n/a (MD, S1-ungated) |
| `k3d/llm-retrieval-maxsim.yaml` | neu | n/a (neu, YAML) |

Verantwortung: `bge-routes.mjs` löst Rollen aus Pfaden und arbeitet Ketten ab;
`server.mjs` verdrahtet nur Pfade weiter. `deployment.yaml` trägt die
Backend-Registry; `loadouts.json` den E3-Rückfall. `llm-retrieval-maxsim.yaml`
ist der neue MaxSim-Dienst; `llm-retrieval-gpu.yaml` verliert den
`:8093-bleibt-lokal`-Kommentar. Das Runbook dokumentiert Topologie und Gates.
Die beiden Testdateien sichern Pfade, Ketten und 503-Gründe.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-proxy-routen.md | impl | `scripts/llm-proxy/bge-routes.mjs`, `scripts/llm-proxy/server.mjs` |  |
| p2 | tasks.d/p2-registry-loadouts.md | impl | `dev-local/components/llm-services/deployment.yaml`, `scripts/llm/loadouts.json` | p3 |
| p3 | tasks.d/p3-colbert-maxsim.md | impl | `k3d/llm-retrieval-maxsim.yaml`, `k3d/kustomization.yaml`, `k3d/llm-retrieval-gpu.yaml` |  |
| p4 | tasks.d/p4-runbook-cleanup.md | impl | `docs/runbooks/bge-role-registry.md` | p1, p2, p3 |
| p5 | tasks.d/p5-tests.md | tests | `scripts/llm-proxy/bge-routes.test.mjs`, `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py` | p1, p2, p3, p4 |

## Risiken und Offenes

- R1: `gpu-metal` ist voll belegt (vier Karten, kein Platz für bge). Beide
  bge-Pods laufen als CPU-Rückfall auf dem Einzelknoten `gpu-cluster2` ohne
  Redundanz. Keine Plan-Aktion; dokumentiert als bekannte Schieflage.
- R2: Anfragegetriebenes Failover bei 60 s Timeout je Glied kann bei Vollausfall
  einer Kette zu langen Wartezeiten führen (D6 akzeptiert das bewusst).
- R3: Die Consumer-Liste für `127.0.0.1:8093`/`:8095`/`:8097` ist unvollständig
  erhoben. Bekannt sind `scripts/morning-health-brief.py`,
  `scripts/mcp-service-watchdog.sh`, `scripts/agents-overview.py`,
  `scripts/colbert_rerank.py`, `cbm-refresh.service` (Dotfiles-Repo) sowie
  `components/website/src/lib/bge-router.ts`, e2e- und FA-Spezifikationen,
  `taskfiles/Taskfile.llm.yml` und `k3d/knowledge-ingest-cronjob.yaml`
  (dieses Repo). Vollständige Erhebung ist Task in p4.
- R4: `lmstudio` steht heute in Kette `embed`; Zugehörigkeit zum
  bge-m3-Vektorraum wird in p2 geprüft, sonst Entfernung aus der Rolle.
- R5: `tablet-embed` auf Priorität 5 macht ein Einzelgerät ohne Redundanz zum
  Erstglied; bei Ausfall greift die Kette auf den Cluster durch (per
  Konstruktion, kein Extra-Schritt).
- R6: LFM- und ColBERT-Dimensionen werden im Plan-Smoke protokolliert, damit
  ein späterer Quer-Eintrag auffällt.
- Ausgeklammert (eigene Chores, nicht dieser Plan): ungesicherter
  Docker-Port 2375 per Tailscale-Bereitstellung und fehlender Autostart für
  LM Studio auf PK-Desktop.

## Tasks

- [ ] **0. Rotphase (liegt vor, main@837304a):** `node --input-type=module -e
  "import { roleForPath } from './scripts/llm-proxy/bge-routes.mjs';
  console.log(roleForPath('/v1/lfm/embeddings'))"` -> `null`
  (expected: FAIL — kein Pfad, keine Rolle, keine Kette). Server-Seite:
  unbekannte `/v1/*`-Pfade fallen an `proxyV1` (Chat-Routing), belegt durch
  `scripts/llm-proxy/server.mjs`. Reproduktion in jedem `main`-Checkout möglich.
- [ ] **p1–p5** ausführen (Reihenfolge laut Partials-Tabelle), je Partial ein
  Commit, kein PR (Staging per Push).
- [ ] **Finaler Verifikations-Task:** `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`; dazu
  `task workspace:validate` (Manifest-Änderungen) und `task test:inventory`
  (Testdateien geändert). Erst bei grünem Lauf ist der Plan ausführbereit.
