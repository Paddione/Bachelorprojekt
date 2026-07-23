# p3 — Konfiguration, K8s-Services und tote Pfade

**Rolle:** impl
**depends_on:** p1 (die Service-Ports werden erst durch die Startskripte festgeschrieben)
**target_files:** `environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`,
`environments/korczewski.yaml`, `environments/staging.yaml`, `environments/fleet-mentolder.yaml`,
`environments/fleet-korczewski.yaml`, `k3d/llm-gpu.yaml`, `scripts/openspec-embed-local.sh`

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/openspec-embed-local.sh` | 91 | 409 |

Die YAML-Dateien unterliegen keinem S1-Extension-Limit.

> **Reihenfolge:** Dieses Partial wird erst ausgeführt, wenn das Äquivalenz-Gate aus Task 1.4
> bestanden ist. Bis dahin bleiben alle Env-Vars auf den TEI-Werten.

## Task 3.1 — Neue Services in `k3d/llm-gpu.yaml`

`k3d/llm-gpu.yaml` beschreibt heute drei Service/Endpoints-Paare, von denen keines mehr ein
lebendes Backend hat: `llm-gateway-lmstudio` (Port 1234, LM Studio ist weg),
`llm-gateway-tei-embed` (8081) und `llm-gateway-tei-rerank` (8083).

Alle drei werden entfernt und durch zwei neue Paare ersetzt:

| Service | Port | Backend |
| --- | --- | --- |
| `llm-gateway-embed` | `8095` | `${LLM_HOST_IP}:8095` |
| `llm-gateway-rerank` | `8096` | `${LLM_HOST_IP}:8096` |

Der Kopfkommentar der Datei beschreibt aktuell die LM-Studio-Modellliste und das TEI-Fallback-Setup
und wird auf die neue Topologie umgeschrieben: zwei llama.cpp-Server auf dem Windows-Host, direkt
über wg-gpu erreichbar, kein socat, kein Proxy.

`${LLM_HOST_IP}` bleibt der Platzhalter — keine Brand-Domain und keine feste IP im Manifest.

## Task 3.2 — `environments/schema.yaml` bereinigen

Zu entfernen sind vier Variablen, die **nachweislich keinen Consumer** im Code haben (per
`grep` über `website/src`, `scripts`, `tests` und `.github` verifiziert):

| Variable | Grund |
| --- | --- |
| `LLM_LMSTUDIO_URL` | kein Consumer; LM Studio abgeschaltet |
| `LLM_CHAT_MODEL` | kein Consumer |
| `LLM_CODING_MODEL` | kein Consumer |
| `LLM_EMBED_MODEL_NOMIC` | kein Consumer; `nomic-embed-text-v1.5` hat kein GGUF im Bestand |

`LLM_ROUTER_URL` wird ebenfalls entfernt: Kein Produktionscode liest die Variable — sie wird
ausschließlich in `website/src/lib/rerank.test.ts` und `website/src/lib/embeddings.test.ts`
gesetzt, ohne dass der getestete Code sie jemals ausliest. Die Bereinigung dieser Testdateien
gehört zu p4.

Zu behalten und anzupassen:

| Variable | Änderung |
| --- | --- |
| `LLM_EMBED_URL` | Beschreibung auf den llama.cpp-Embedding-Server; hat echte Consumer |
| `LLM_RERANKER_URL` | Beschreibung auf den llama.cpp-Rerank-Server statt „TEI reranker on port 8083" |
| `LLM_EMBED_MODEL` | bleibt — echte Consumer in `codesearch-db.ts`, `embeddings.ts`, `index-repo.ts` |
| `LLM_HOST_IP` | Beschreibung erwähnt „TEI embed + LM Studio" und wird auf die llama.cpp-Server umgeschrieben |
| `LLM_ENABLED` | Beschreibung verweist auf `llm-gateway-embed` (TEI) und LM Studio; entsprechend anpassen |

## Task 3.3 — Env-Dateien umhängen

Betroffen sind **sieben** Dateien — neben den offensichtlichen auch die beiden
`fleet-*`-Varianten, die dieselben toten Endpunkte tragen:

| Datei | Änderung |
| --- | --- |
| `environments/dev.yaml` | `LLM_EMBED_URL` → `llm-gateway-embed…:8095`, `LLM_RERANKER_URL` → `llm-gateway-rerank…:8096`, `LLM_ROUTER_URL` / `LLM_CHAT_MODEL` / `LLM_CODING_MODEL` / `LLM_EMBED_MODEL_NOMIC` entfernen |
| `environments/mentolder.yaml` | dito; `LLM_RERANK_ENABLED` bleibt `true` — der Reranker existiert nach diesem Change erstmals wieder wirklich |
| `environments/korczewski.yaml` | Namespace `workspace-korczewski`; `LLM_RERANKER_URL` ergänzen, da bislang nicht gesetzt |
| `environments/staging.yaml` | `LLM_ENABLED` bleibt `false`, die URLs werden trotzdem korrigiert, damit ein späteres Aktivieren nicht ins Leere greift |
| `environments/fleet-mentolder.yaml` | dito zu `mentolder.yaml` |
| `environments/fleet-korczewski.yaml` | dito zu `korczewski.yaml` |

Der Wert von `LLM_EMBED_MODEL` wird von `text-embedding-bge-m3` (eine LM-Studio-Modell-ID) auf
`bge-m3` gesetzt. `llama-server` ignoriert das Feld im Single-Model-Betrieb, aber ein Wert, der auf
ein abgeschaltetes System verweist, ist irreführend.

Namespace-Zuordnung beachten: `workspace` für mentolder, `workspace-korczewski` für korczewski,
`workspace-staging` für staging.

## Task 3.4 — `scripts/openspec-embed-local.sh` auf den neuen Endpunkt

`scripts/openspec-embed-local.sh` — Ist 91, Budget 409.

Das Skript probt heute das TEI-Backend vorab und bricht mit Remediation-Hinweis ab, statt still zu
skippen (dieses Fail-visible-Verhalten wird beibehalten). Umzustellen sind die Probe-URL auf den
neuen Embedding-Server und der Remediation-Text, der derzeit auf `systemctl start tei-embed`
verweist — künftig auf das PS1-Startskript beziehungsweise den Scheduled Task aus p1.

## Task 3.5 — Cutover-Verifikation

Nach den Konfigurationsänderungen, aber **vor** dem Abschalten des TEI (Task 1.7):

```bash
task workspace:validate
```

Anschließend gegen den Dev-Cluster prüfen, dass ein Pod den neuen Service erreicht:

```bash
kubectl --context k3d-mentolder-dev -n website exec deploy/website -- \
  wget -qO- --post-data '{"model":"bge-m3","input":["test"]}' \
  --header 'Content-Type: application/json' \
  http://llm-gateway-embed.workspace.svc.cluster.local:8095/v1/embeddings
```

Schlägt das fehl, ist der Rollback ein reiner Env-Rücksprung auf die TEI-Werte — der TEI-Container
läuft zu diesem Zeitpunkt noch.
