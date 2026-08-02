---
ticket_id: T002570
plan_ref: null
status: active
date: 2026-08-02
---

# bge-embed-routing — Design

Drei zusammenhängende Routing-Bugs im bge-m3-Embedding-Stack, gefunden bei einer
Live-Cluster-Audit am 2026-08-02, werden behoben. Kernentscheidung: `embedAll()` in
`scripts/knowledge/lib-knowledge-pg.mjs` nutzt bge-m3 künftig als **primären** Provider,
Voyage AI nur noch als **Fallback** — bisher war es umgekehrt.

## Problem

### Bug 1 (aktiv, produktionsrelevant): `knowledge-ingest-bugs`/`-prs` CronJobs schlagen wiederholt fehl

`embedAll(texts, model='voyage-multilingual-2', batch=128)` nutzt Voyage AI als Default.
bge-m3 läuft nur, wenn `model==='bge-m3'` explizit übergeben wird — kein Aufrufer
(`ingest-bug-tickets.mjs:39`, `ingest-prs.mjs:38`, `ingest-markdown.mjs:82`) tut das.

Der bestehende bge-Pfad (`callRouter()`/`LLM_ROUTER_URL` → `llm-router.workspace.svc.cluster.local:4000`)
ist zusätzlich strukturell tot: dieser Service existiert im Cluster nicht
(verifiziert per `kubectl get svc -n workspace | grep router` → leer).

Live-Beweis: `kubectl get jobs -n workspace | grep knowledge-ingest` zeigt wiederholt
`Failed` (knowledge-ingest-bugs vor 24d/22d/6d16h, knowledge-ingest-prs vor 43d/22d/6d17h) —
genau dann, wenn neuer Content zum Embedden anstand, weil `VOYAGE_API_KEY` live in den
CronJob-Envs fehlte (separates Drift-Problem, vermutlich verursacht durch eine seit 10 Tagen
hängende Flux-Reconciliation für `flux-mentolder` — das ist NICHT Teil dieses Fixes, siehe
"Nicht-Ziele").

### Bug 2 (latent, aktuell folgenlos): `k3d/website.yaml` fehlt `LLM_RERANKER_URL`

`k3d/website.yaml` wired `LLM_EMBED_URL` und `LLM_RERANK_ENABLED` in den Deployment-env-Block,
aber nicht `LLM_RERANKER_URL` — obwohl alle `environments/*.yaml` (mentolder/korczewski/dev/
staging/fleet-*) die Variable definieren. Live verifiziert per `kubectl exec ... printenv` auf
dem laufenden website-Pod.

Aktuell folgenlos, weil `rerankCandidates()` in `website/src/lib/rerank.ts` sauber via
`rerankEnabled()`-Check vor dem `resolveEndpoint('rerank')`-Aufruf abbricht (graceful
degradation auf `score:0`) — `LLM_RERANK_ENABLED=false` steht live. Wird zur stillen Falle,
sobald Reranking aktiviert wird, ohne dass gleichzeitig diese Zeile ergänzt wird.

### Bug 3 (toter Fallback-Code, aktuell inaktiv): `scripts/index-repo.ts`

`resolveEmbedConfig()` hat drei stale Referenzen auf Port `:8095` (Kommentar + `localUrl`-
Fallback + finaler Cluster-Fallback). Port 8095 war der Host-lokale llama.cpp-Port vor T002551
(Cluster-Migration auf Port 8081) und ist seither vollständig dekommissioniert (heute nochmal
live verifiziert: keine Prozesse, keine systemd-Units). Der primäre Pfad (explizite
`LLM_EMBED_URL` aus `environments/*.yaml`, überall korrekt auf `:8081`) funktioniert
einwandfrei — das Sicherheitsnetz für einen Ausfall würde aber nicht greifen.

## Nicht-Ziele

- **Kein Fix des Flux-GitOps-Stillstands.** `flux-mentolder` reconciled seit 10 Tagen nicht
  (`False`, Dependency-Kette bis `flux-sealed-secrets-mentolder`). Das ist die Ursache, warum
  die live laufenden CronJobs überhaupt eine veraltete Manifest-Fassung fahren (ohne die im Git
  bereits vorhandene `VOYAGE_API_KEY`-Wiring) — ein eigenständiger Incident, nicht Teil dieses
  Code-Fixes. Der Code-Fix muss trotzdem korrekt sein, damit er wirkt, sobald Flux wieder synct.
- **Keine Änderung an `website/src/lib/embeddings.ts`.** Der dortige `embedBatch()`/`embedQuery()`-
  Fallback ist bewusst fail-closed für `bge-m3` (keine Voyage-Ausweiche im Normalfall) — ein
  anderes Trade-off als für die Ingest-Jobs (interaktive Query-Pfade wollen Konsistenz, nicht
  Verfügbarkeit um jeden Preis). Dieses Verhalten bleibt unverändert.
- **Kein neuer `LLM_ROUTER_URL`-Ersatz-Service.** Der tote Router-Pfad wird entfernt, nicht durch
  einen neuen Cluster-Service ersetzt — `LLM_EMBED_URL` (bestehende Konvention) ist ausreichend.

## Lösung

### 1. `embedAll()` — bge-primär mit Voyage-Fallback, pro Prozesslauf gemerkt

```js
let bgeDead = false; // Modul-Variable, lebt nur für den aktuellen Prozesslauf

export async function embedAll(texts, batch = 128) {
  const bgeUrl = process.env.LLM_EMBED_URL;
  if (bgeUrl && !bgeDead) {
    try {
      return await embedViaBge(texts, bgeUrl, 64);
    } catch (err) {
      console.warn(`[embedAll] bge-m3 (${bgeUrl}) fehlgeschlagen — falle für den Rest `
        + `dieses Laufs auf Voyage AI zurück: ${err.message}`);
      bgeDead = true;
    }
  }
  return embedViaVoyage(texts, batch);
}
```

- **Erkennung eines bge-Fehlschlags:** jeder Fehler aus `fetch()` (Netzwerk, Timeout) oder eine
  non-2xx-Antwort. Timeout: `AbortSignal.timeout(10_000)` — ausreichend für bge-m3-CPU-Inferenz
  bei Batch-Größe 64, deutlich über dem 2s-Health-Check-Timeout in `index-repo.ts` (das prüft nur
  Erreichbarkeit, keine echte Embedding-Berechnung).
- **Granularität des Fallbacks:** pro Prozesslauf, nicht pro Batch/Dokument (User-Entscheidung
  im Brainstorming). Die Ingest-Skripte rufen `embedAll()` pro Ticket/PR in einer Schleife auf —
  ohne diesen Cache würde bei z.B. 50 Tickets in einem Lauf 50× der Timeout gegen einen toten
  bge-Endpoint anfallen, bevor jedes Mal auf Voyage ausgewichen wird.
- **Dimensions-Kompatibilität geprüft:** `SELECT vector_dims(embedding) FROM knowledge.chunks`
  liefert für alle 18.854 bestehenden Zeilen `1024`. `bge-m3` und `voyage-multilingual-2`
  liefern beide 1024-dim Vektoren — ein Wechsel des Providers mitten im Lauf bricht das
  pgvector-Schema nicht.
- **`callRouter()`/`getRouterUrl()`/`LLM_ROUTER_URL` werden entfernt** (toter Code für einen nie
  existierenden Service) und durch `embedViaBge()` gegen `LLM_EMBED_URL` ersetzt — dieselbe
  Konvention wie `website/src/lib/bge-router.ts`. Endpoint: `POST ${LLM_EMBED_URL}/v1/embeddings`
  mit `{ model: 'bge-m3', input: texts }` (llama.cpp im Single-Modell-Betrieb ignoriert das
  `model`-Feld, siehe bestehender Kommentar in der Datei).
- **Signatur-Vereinfachung:** `embedAll(texts, batch = 128)` — der bisherige `model`-Parameter
  entfällt (er wurde nie mit `'bge-m3'` aufgerufen). Aufrufer (`ingest-bug-tickets.mjs`,
  `ingest-prs.mjs`, `ingest-markdown.mjs`) bleiben unverändert, sie rufen weiterhin
  `embedAll(chunks)` ohne zweites Argument auf.

### 2. `k3d/knowledge-ingest-cronjob.yaml` — `LLM_EMBED_URL` ergänzen

Alle drei CronJob-Container (`knowledge-ingest-bugs`, `knowledge-ingest-prs`,
`knowledge-ingest-markdown`) bekommen zusätzlich zu `PGPASSWORD`/`VOYAGE_API_KEY`/`BRAND`:

```yaml
- name: LLM_EMBED_URL
  value: "http://llm-gateway-embed.workspace.svc.cluster.local:8081"
```

### 3. `k3d/website.yaml` — fehlende `LLM_RERANKER_URL` ergänzen

```yaml
LLM_RERANKER_URL: "${LLM_RERANKER_URL}"
```
direkt neben der bestehenden `LLM_EMBED_URL`-Zeile im selben env-Block.

### 4. `scripts/index-repo.ts` — tote `:8095`-Referenzen korrigieren

`localUrl` (`http://localhost:8095` → `http://localhost:8081`) und der finale Cluster-Fallback
(`` `http://${clusterHost}:8095` `` → `` `http://${clusterHost}:8081` ``) werden korrigiert,
der zugehörige Kommentar aktualisiert (Service läuft seit T002551 auf Port 8081, nicht 8095).

## Testing

Failing Test in `tests/spec/local-llm-proxy/` (Spec `local-llm-proxy`, gleiche Spec wie
`bge-token-ssot.bats`): mockt einen unerreichbaren `LLM_EMBED_URL` und einen validen
`VOYAGE_API_KEY`, ruft `embedAll()` auf und erwartet, dass die Voyage-Route greift statt eines
Fehlers — reproduziert den aktuellen Bug (Fehlschlag mangels Fallback) im RED-Zustand.
