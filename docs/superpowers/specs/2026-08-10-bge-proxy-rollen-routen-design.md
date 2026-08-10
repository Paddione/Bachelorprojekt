# bge hinter dem llm-proxy: rollenbasierte Routen mit anfrage-getriebenem Failover

**Datum:** 2026-08-10
**Vorgang:** 3 von 3 der LLM-Stack-Konsolidierung (Vorgang 1 = T003203, Vorgang 2 = T003204)
**Status:** Design freigegeben, Plan ausstehend

## Zweck

Der lokale LLM-Proxy (`:18235`) ist laut `openspec/specs/local-llm-proxy.md` das alleinige Tor,
über das lokale Harnesses mit den llama.cpp-Backends sprechen. Für **bge** (Embedding und
Reranking) gilt das heute nicht: die lokalen Konsumenten sprechen Backends direkt an, und der
Proxy verwaltet zwar zwei bge-Loadouts, routet aber keinen einzigen Request an sie.

Dieses Design schließt die Lücke. Es bedient vier Ziele, die der Operator gleichrangig gesetzt
hat: Cluster-Unabhängigkeit der lokalen Arbeit, ein Tor statt drei Pfade, Entschärfung der
Port-Kollisionsklasse, und Verkehr für die heute toten bge-Loadouts.

## Ausgangslage (erhoben 2026-08-10)

Drei lokale bge-Pfade nebeneinander, keiner über den Proxy:

| Konsument | Embed | Rerank |
|---|---|---|
| `bge-mcp`-Shim (`:13005`) | `LLM_EMBED_URL=127.0.0.1:8081` → Port-Forward in den Cluster | `LLM_RERANKER_URL=127.0.0.1:8093` → Port-Forward in den Cluster |
| `openspec-embed-local.sh` (Pre-Commit) | `:8081`, derselbe Forward | — |
| Loadouts `bge-embed-cpu` (`:8095`), `bge-rerank-cpu` (`:8096`) | vom Proxy verwaltet | von niemandem geroutet |

Die `notes` in `scripts/llm/loadouts.json` widersprechen sich dabei selbst: `bge-rerank-cpu` heißt
dort „der reguläre lokale Weg", `bge-embed-cpu` ehrlicher „der lokale Ersatzweg" — tatsächlich
läuft beides über den Cluster-Forward. Das ist das Muster einer nie getroffenen Entscheidung.

### Belegte Auslöser

1. **Port-Kollision `:8093`** (T003203): `brain-ingest` schickte Chat-Completions an den
   bge-Reranker, weil zwei Subsysteme denselben Host-Port beanspruchten. Der Ticket-Text nennt es
   den dritten Fall derselben Fehlerklasse.
2. **Pre-Commit rot ohne Cluster**: `openspec-embed-local.sh` bricht ab, wenn der `:8081`-Forward
   nicht steht — also bei jedem Commit ohne Cluster-Verbindung.
3. **Toter Forward, stummer Shim**: Die Forward-Units pinnen `--context fleet`. Bricht der Forward
   weg, antwortet `bge-mcp` nicht mehr; ein Rückfall auf die lokalen CPU-Loadouts existiert nicht.

### Prior Art (Schritt 0.7)

- `openspec/specs/local-llm-proxy.md:17` — „Proxy as sole LLM gateway", samt Lint gegen direkte
  Backend-Ports. Der Lint verfolgt `.opencode/agent-models.jsonc`, `provider-register-local.sh`,
  `route-provider.sh`, `pipeline.mjs` — **nicht** die bge-Flächen. Die bge-Pfade sind nie unter
  diese Regel gefallen; dieses Design zieht sie darunter, es kehrt keine Entscheidung um.
- `openspec/specs/local-llm-proxy.md:252` — „Auto-start and queue for conflict-free loadouts".
  Die bge-CPU-Loadouts sind konfliktfrei, die Maschinerie ist also bereits vorhanden.
- `openspec/specs/local-llm-proxy.md:913` — bge-CPU-Loadouts bewusst ohne `exclusiveGroup`, weil
  sie kein VRAM belegen; sie dürfen parallel laufen.
- `openspec/specs/llm-pipeline.md:1054` — bge läuft zusätzlich als K8s-Deployment mit ClusterIP
  `llm-gateway-rerank:8081` für die Brand-Konsumenten. Dieser Pfad bleibt unberührt.

## Architektur

Ein neues Modul `scripts/llm-proxy/bge-routes.mjs`, **getrennt** von der Chat-Modellauflösung:

```
POST :18235/v1/embeddings  ──► Rolle "embed"   ──► [ loadout:bge-embed-cpu (:8095), http://127.0.0.1:8081 ]
POST :18235/v1/rerank      ──► Rolle "rerank"  ──► [ loadout:bge-rerank-cpu (:8096), http://127.0.0.1:8093 ]
```

Die Rolle wird aus dem **Pfad** abgeleitet, nicht aus dem `model`-Feld des Requests. Folgen:

- `/v1/models` bleibt unverändert — kein Embedding-Modell gerät in die Chat-Modellauflösung.
  Ein Client, der sich das erste Modell aus der Liste greift, kann nicht versehentlich `bge-m3`
  eine Chat-Completion schicken. Das ist dieselbe Fehlerklasse, die T003203 gerade behebt.
- Die Chat-Seite des Proxys wird nicht angefasst.

Beide Upstream-Arten sprechen nachweislich dieselbe API: `scripts/bge-mcp/server.mjs` ruft heute
`/v1/embeddings` (Z. 151) und `/v1/rerank` (Z. 169) gegen den Cluster-Endpunkt, und die lokalen
Loadouts spiegeln laut ihren `notes` die Cluster-Args aus `k3d/llm-gpu.yaml`.

Das erste Kettenglied ist eine **Loadout-Referenz** (`loadout:<slug>`), keine URL. Damit greift die
vorhandene Auto-start-Maschinerie: läuft das Loadout nicht, startet der Proxy es selbst.

### Konfigurationsort

Die Ketten stehen in `scripts/llm/loadouts.json` unter einem neuen Top-Level-Schlüssel `roles`:

```jsonc
"roles": {
  "embed":  { "chain": ["loadout:bge-embed-cpu",  "http://127.0.0.1:8081"] },
  "rerank": { "chain": ["loadout:bge-rerank-cpu", "http://127.0.0.1:8093"] }
}
```

Begründung: die Kette referenziert Loadout-Slugs, und `loadouts.json` ist bereits die Konfigdatei
des Proxys — mit Schema-Guard (`tests/spec/local-llm-proxy/loadouts-format.bats`) und Bearbeitung
über die Web-UI (`GET/PUT /admin/loadouts`). Keine DB-Migration nötig.

**Reihenfolge: lokal zuerst, Cluster als Rückfall.** Vom Operator so entschieden, weil der
Cluster-Ausfall der real erlebte Fall ist. Kosten: die Loadouts fahren mit `-t 4` auf einem
6-Kern-Host; zwei Kerne bleiben laut `notes` (T002587) für das Dataloading eines parallel
laufenden Finetunings frei.

## Failover-Semantik

Die Umschaltung ist **anfrage-getrieben mit Zeitschranke**, nicht Health-Probe-getrieben.

Begründung liegt im Repo vor — `scripts/bge-mcp/server.mjs:105-111` (T002838):

> „Am 2026-08-09 hing `bge_embed` so über 60s am Cluster-Endpoint, während dessen `/health`
> weiter 200 lieferte: der MCP-Client sah ein blockiertes Werkzeug statt einer Fehlermeldung."

Ein Health-Endpunkt beantwortet „lebt der Prozess?", nicht „kann er meine Anfrage bedienen?". Bei
einem gesättigten Queue-Server fallen beide auseinander. Die Anfrage selbst ist die einzige
ehrliche Probe.

| Ereignis am Upstream | Verhalten |
|---|---|
| Verbindungsfehler | nächstes Kettenglied |
| Timeout (Default 30000 ms, überschreibbar) | nächstes Kettenglied |
| Antwort `5xx` | nächstes Kettenglied |
| Antwort `4xx` | **kein** Failover — durchreichen |
| alle Glieder erschöpft | `503`, Body listet **je Glied** den Grund |

Der 4xx-Sonderfall ist nicht kosmetisch: ohne ihn macht ein einziger fehlerhafter Client-Request
aus einem sofortigen Fehler eine Hängepartie über die ganze Kette — die Verschlimmerung genau des
Symptoms aus T002838.

Der Default-Timeout entspricht `BGE_MCP_UPSTREAM_TIMEOUT_MS` (30000 ms) im Shim, damit die beiden
Zeitschranken nicht gegeneinander laufen.

**Auto-start:** Ist das erste Glied eine Loadout-Referenz und das Loadout läuft nicht, startet der
Proxy es und wartet **höchstens 20000 ms** auf Bereitschaft. Scheitert Start oder Wartezeit, gilt
das Glied als gescheitert und die Kette rückt weiter — ein nicht startendes Loadout darf den
Request nicht verschlucken. Die 20 s sind so gewählt, dass Start plus Rückfall auf den Cluster
zusammen unter der 30-s-Zeitschranke des Shims bleiben; andernfalls bräche der Aufrufer ab,
während der Proxy noch beim Rückfall wäre.

**Beobachtbarkeit:** Jede Antwort trägt `x-llm-proxy-bge-upstream: <name>`. Damit ist von außen
prüfbar, wer geantwortet hat; Tests hängen an dieser Tatsache statt an einer Fehlerformulierung
(T002716: Semantik statt Darstellung).

## Konsumenten

| Datei | heute | nachher |
|---|---|---|
| `scripts/bge-mcp/bge-mcp.service` | `LLM_RERANKER_URL=http://127.0.0.1:8093`, `LLM_EMBED_URL=…:8081` | beide `http://127.0.0.1:18235` |
| dieselbe Unit, `ExecStart` | wartet per `/dev/tcp` auf `:8081` **und** `:8093` | wartet auf `:18235` |
| `scripts/openspec-embed-local.sh:50` | Default `http://127.0.0.1:8081` | Default `http://127.0.0.1:18235` |
| dasselbe Skript, Z. 53–60 | Fehlertext rät zu `kubectl port-forward` | verweist auf den Proxy — der alte Rat wäre falsch |
| `bge-forward-embed.service`, `bge-forward-rerank.service` | harte Vorbedingung für `bge-mcp` | bleiben, aber nur als zweites Kettenglied |

**Unangetastet:** `environments/*.yaml`, `k3d/website.yaml`, `k3d/knowledge-ingest-cronjob.yaml`.
Das sind In-Cluster-Konsumenten; ein Proxy auf dem WSL-Host ist für sie nicht erreichbar. Die
Trennung „lokale Harnesses über den Proxy, Cluster-Workloads über ClusterIP" bleibt bestehen.

Nebeneffekt, der Auslöser 3 direkt schließt: `bge-mcp` startet dann auch ohne Cluster, weil seine
Startbedingung nicht mehr an einem `kubectl port-forward` hängt.

## Tests

Geprüft wird gegen **Stub-Upstreams**, nicht gegen echtes bge. CI hat weder Cluster noch GPU noch
die bge-Modelldateien; ein Test gegen echtes bge misst dort die Ausstattung des Runners statt den
Zustand des Codes (T002716, und der Rotphasen-Guard aus `dev-flow-plan`). Er wäre dauerhaft rot
oder dauerhaft geskippt — beides ohne Aussage. Die Failover-Semantik ist gegen Stubs ohnehin
schärfer prüfbar: der T002838-Fall („nimmt an, antwortet nie") ist mit echtem bge kaum
reproduzierbar, mit einem Stub trivial. Das Muster existiert im Verzeichnis bereits
(`server.test.mjs`, `exclusive-conflict.test.mjs`, `local-only.test.mjs`).

1. **Rotphase** — `tests/spec/local-llm-proxy/bge-role-routes.bats`: `POST :18235/v1/embeddings`
   liefert `200` und einen `x-llm-proxy-bge-upstream`-Header. Heute rot, weil die Route fehlt.
   **Positiv-Anker im selben Test** (T002356-M1): ein bekannter Chat-Request belegt, dass der
   Proxy überhaupt antwortet — sonst bestünde der Test vakuos, wenn der Proxy schlicht tot ist.
   Erreichbarkeits-Guard: ist `:18235` nicht besetzt, `skip` statt Fehlschlag.
2. **Failover-Einheiten** — `scripts/llm-proxy/bge-routes.test.mjs` gegen Stubs:
   totes erstes Glied → zweites antwortet; schweigendes erstes Glied → Timeout, dann zweites;
   `4xx` → kein Durchfallen; alle Glieder tot → `503` mit je Glied einem Grund.
3. **Konsumenten-Lint erweitern** — `tests/spec/local-llm-proxy/gateway-consumer-lint.bats` um
   `scripts/bge-mcp/bge-mcp.service` und `scripts/openspec-embed-local.sh` ergänzen, verbotene
   Literale um `:8081`, `:8095`, `:8096`. Kommentarzeilen bleiben ausgenommen, wie beim
   bestehenden Lint. Damit fällt diese Fläche künftig unter „sole gateway".
   **`scripts/llm/loadouts.json` ist vom Lint ausgenommen** — dort stehen die Backend-Adressen
   bestimmungsgemäß, genau wie die bestehende Ausnahme für die Registry-Seeds. Ohne diese
   Ausnahme verböte der Lint die Konfigdatei, die dieses Design gerade einführt.
4. **Registrierung** — die neue Datei in einem Runner eintragen, sonst schlägt
   `tests/spec/local-llm-proxy/proxy-tests-registered.bats` zu. Lokal beide Formen prüfen:
   `tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*`.

## Abgrenzung

Nicht Teil dieses Vorgangs:

- Chat-Routing und der Inhalt von `/v1/models`
- die Cluster-Deployments `bge-embed`/`bge-rerank` und die Brand-Konsumenten
- T003203 (Port-8093-Kollision, parallel in Arbeit) und T003204 (Messreihe GPU-Loadouts)
- `llamacpp-bonsai` bleibt `enabled=false`

**Offen, bewusst nicht aufgenommen:** `scripts/factory/provider-register-gptoss.sh` zeigt auf
`:8097`, während `gptoss-context` auf `:8098` läuft — vierter Fall derselben Fehlerklasse,
dokumentiert und ungefixt. Der erweiterte Lint aus Punkt 3 ist die Stelle, an der er künftig
auffiele, sobald jemand diese Fläche in den verfolgten Satz aufnimmt.

## Erfolgskriterien

1. `curl -s -X POST :18235/v1/embeddings -d '{"model":"bge-m3","input":["test"]}'` liefert `200`
   und einen Vektor, **ohne** dass ein `kubectl port-forward` läuft.
2. Dasselbe für `/v1/rerank`.
3. `bge-mcp` startet und beantwortet `bge_embed`/`bge_rerank` ohne Cluster-Verbindung.
4. `openspec-embed-local.sh` läuft ohne Cluster-Verbindung durch.
5. Fällt das lokale Loadout aus, antwortet der Cluster-Rückfall — nachweisbar am
   `x-llm-proxy-bge-upstream`-Header.
6. Keine tracked Konsumenten-Datei nennt noch einen bge-Backend-Port außerhalb von Kommentaren.
