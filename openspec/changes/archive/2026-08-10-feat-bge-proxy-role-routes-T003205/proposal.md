# Proposal: feat-bge-proxy-role-routes-T003205

## Why

Der Proxy auf `:18235` ist laut `openspec/specs/local-llm-proxy.md` das alleinige Tor, über das
lokale Harnesses mit den llama.cpp-Backends sprechen. Für **bge** gilt das nicht: drei lokale
Pfade laufen nebeneinander, keiner über den Proxy.

| Konsument | Embed | Rerank |
|---|---|---|
| `bge-mcp`-Shim (`:13005`) | `127.0.0.1:8081` → Port-Forward in den Cluster | `127.0.0.1:8093` → Port-Forward in den Cluster |
| `openspec-embed-local.sh` (Pre-Commit) | `:8081`, derselbe Forward | — |
| Loadouts `bge-embed-cpu` (`:8095`), `bge-rerank-cpu` (`:8096`) | vom Proxy verwaltet | von niemandem geroutet |

Die beiden Loadouts sind damit tote Konfiguration: der Proxy startet und stoppt sie, aber kein
Request erreicht sie je. Die `notes` in `scripts/llm/loadouts.json` widersprechen sich dabei
selbst — `bge-rerank-cpu` heißt dort „der reguläre lokale Weg", `bge-embed-cpu` „der lokale
Ersatzweg", während tatsächlich beides über den Cluster-Forward läuft. Das ist das Muster einer
nie getroffenen Entscheidung, nicht einer getroffenen.

Drei Auslöser, alle vom Operator als real erlebt bestätigt:

1. **Port-Kollision `:8093`** (T003203) — `brain-ingest` schickte Chat-Completions an den
   bge-Reranker, weil zwei Subsysteme denselben Host-Port beanspruchten. Laut Ticket der dritte
   Fall derselben Fehlerklasse. Wurzel: bge-Ports liegen frei im Hostraum statt hinter einem Tor.
2. **Pre-Commit rot ohne Cluster** — `openspec-embed-local.sh` bricht ab, wenn der
   `:8081`-Forward nicht steht, also bei jedem Commit ohne Cluster-Verbindung.
3. **Toter Forward, stummer Shim** — die Forward-Units pinnen `--context fleet`. Bricht der
   Forward weg, antwortet `bge-mcp` nicht mehr; ein Rückfall auf die lokalen CPU-Loadouts
   existiert nicht.

### Prior Art — es wird keine Entscheidung umgekehrt

- `openspec/specs/local-llm-proxy.md:17` („Proxy as sole LLM gateway") verfolgt per Lint
  `.opencode/agent-models.jsonc`, `provider-register-local.sh`, `route-provider.sh`,
  `pipeline.mjs` — die bge-Flächen sind **nie** unter diese Regel gefallen. Dieser Change zieht
  sie darunter; er kehrt nichts um.
- `local-llm-proxy.md:252` („Auto-start and queue for conflict-free loadouts") — die Maschinerie
  für bedarfsgesteuerten Loadout-Start existiert bereits.
- `local-llm-proxy.md:913` — die bge-CPU-Loadouts sind bewusst ohne `exclusiveGroup`, weil sie
  kein VRAM belegen; sie dürfen parallel laufen.
- `llm-pipeline.md:1054` — bge läuft zusätzlich als K8s-Deployment für die Brand-Konsumenten.
  Dieser Pfad bleibt unberührt.

## What

Ein neues Modul `scripts/llm-proxy/bge-routes.mjs`, **getrennt** von der Chat-Modellauflösung:

```
POST :18235/v1/embeddings ─► Rolle "embed"  ─► [loadout:bge-embed-cpu(:8095),  http://127.0.0.1:8081]
POST :18235/v1/rerank     ─► Rolle "rerank" ─► [loadout:bge-rerank-cpu(:8096), http://127.0.0.1:8093]
```

Die Rolle kommt aus dem **Pfad**, nicht aus dem `model`-Feld. Damit bleibt `/v1/models`
unverändert und kein Embedding-Modell gerät in die Chat-Auflösung — sonst könnte ein Client, der
sich das erste Modell der Liste greift, `bge-m3` eine Chat-Completion schicken: exakt die
Fehlerklasse, die T003203 gerade behebt.

Beide Upstream-Arten sprechen nachweislich dieselbe API: `scripts/bge-mcp/server.mjs` ruft
`/v1/embeddings` (Z. 151) und `/v1/rerank` (Z. 169); die lokalen Loadouts spiegeln laut ihren
`notes` die Cluster-Args aus `k3d/llm-gpu.yaml`.

**Konfigurationsort:** `scripts/llm/loadouts.json`, neuer Top-Level-Schlüssel `roles`. Die Kette
referenziert Loadout-Slugs, und `loadouts.json` ist bereits die Proxy-Konfigdatei mit Schema-Guard
und Web-UI-Bearbeitung. Keine DB-Migration nötig.

**Reihenfolge:** lokal zuerst, Cluster als Rückfall — vom Operator entschieden, weil der
Cluster-Ausfall der real erlebte Fall ist.

### Failover: anfrage-getrieben, nicht über `/health`

Der naheliegende Weg — Upstream per Health-Probe wählen — ist im Repo bereits widerlegt.
`scripts/bge-mcp/server.mjs:105-111` (T002838): *„Am 2026-08-09 hing `bge_embed` so über 60s am
Cluster-Endpoint, während dessen `/health` weiter 200 lieferte."* Ein Health-Endpunkt beantwortet
„lebt der Prozess?", nicht „kann er meine Anfrage bedienen?". Bei einem gesättigten Queue-Server
fallen beide auseinander.

| Ereignis am Upstream | Verhalten |
|---|---|
| Verbindungsfehler | nächstes Glied |
| Timeout (30000 ms) | nächstes Glied |
| `5xx` | nächstes Glied |
| `4xx` | **kein** Failover, durchreichen |
| alle Glieder erschöpft | `503`, Body listet je Glied den Grund |

Der 4xx-Sonderfall ist nicht kosmetisch: ohne ihn wird aus einem fehlerhaften Client-Request eine
Hängepartie über die ganze Kette — die Verschlimmerung genau des Symptoms aus T002838. Der
Default-Timeout entspricht `BGE_MCP_UPSTREAM_TIMEOUT_MS` (30000 ms) im Shim, damit die beiden
Zeitschranken nicht gegeneinander laufen.

**Auto-start:** Läuft ein Loadout-Glied nicht, startet der Proxy es und wartet höchstens
20000 ms. So bleiben Start plus Cluster-Rückfall zusammen unter der 30-s-Schranke des Shims.
Scheitert der Start, rückt die Kette weiter — ein nicht startendes Loadout darf den Request nicht
verschlucken.

**Beobachtbarkeit:** Jede Antwort trägt `x-llm-proxy-bge-upstream: <name>`. Tests hängen an dieser
Tatsache statt an einer Fehlerformulierung (T002716: Semantik statt Darstellung).

### Konsumenten

| Datei | heute | nachher |
|---|---|---|
| `scripts/bge-mcp/bge-mcp.service` | `LLM_RERANKER_URL=…:8093`, `LLM_EMBED_URL=…:8081` | beide `http://127.0.0.1:18235` |
| dieselbe Unit, `ExecStart` | wartet auf `:8081` **und** `:8093` | wartet auf `:18235` |
| `scripts/openspec-embed-local.sh:50` | Default `:8081` | Default `:18235` |
| dasselbe Skript, Z. 53–60 | rät zu `kubectl port-forward` | verweist auf den Proxy |
| `bge-forward-*.service` | harte Vorbedingung für `bge-mcp` | bleiben, nur noch zweites Kettenglied |

**Unangetastet:** `environments/*.yaml`, `k3d/website.yaml`, `k3d/knowledge-ingest-cronjob.yaml` —
In-Cluster-Konsumenten, für die ein Proxy auf dem WSL-Host nicht erreichbar ist.

### Tests gegen Stubs, nicht gegen echtes bge

CI hat weder Cluster noch GPU noch die bge-Modelldateien. Ein Test gegen echtes bge misst dort die
Ausstattung des Runners statt den Zustand des Codes (T002716). Der T002838-Fall („nimmt an,
antwortet nie") ist mit echtem bge kaum reproduzierbar, mit einem Stub trivial. Das Muster
existiert im Verzeichnis bereits (`server.test.mjs`, `exclusive-conflict.test.mjs`,
`local-only.test.mjs`).

## Abgrenzung

Nicht Teil: Chat-Routing und `/v1/models`-Inhalt; die Cluster-Deployments `bge-embed`/`bge-rerank`
und die Brand-Konsumenten; T003203 (Port-8093-Kollision, parallel in Arbeit); T003204 (Messreihe
GPU-Loadouts). `llamacpp-bonsai` bleibt `enabled=false`.

**Offen, bewusst nicht aufgenommen:** `scripts/factory/provider-register-gptoss.sh` zeigt auf
`:8097`, während `gptoss-context` auf `:8098` läuft — vierter Fall derselben Fehlerklasse,
dokumentiert und ungefixt. Der erweiterte Lint ist die Stelle, an der er künftig auffiele.

_Ticket: T003205_
