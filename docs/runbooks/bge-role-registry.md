# Runbook: bge-Rollen ueber die Backend-Registry (bge-role-registry-routing)

Dieses Runbook dokumentiert die Verwaltung der Upstream-Ketten fuer die
Retrieval-Routen des LLM-Proxys (Port 18235): `/v1/embeddings`,
`/v1/rerank`, `/v1/lfm/embeddings`, `/v1/colbert/embeddings` und
`/v1/colbert/rerank`.

## Architektur & Prinzipien

1. **Rollenbasierte Routen:**
   - `/v1/embeddings` -> Rolle `embed` (bge-m3, 1024 Dimensionen)
   - `/v1/rerank` -> Rolle `rerank` (bge Cross-Encoder, unveraendert)
   - `/v1/lfm/embeddings` -> Rolle `lfm-embed` (LFM2.5-Embedding, eigener Raum)
   - `/v1/colbert/embeddings` -> Rolle `colbert-embed` (LFM2.5-ColBERT,
     Late-Interaction auf Token-Ebene)
   - `/v1/colbert/rerank` -> Rolle `colbert-rerank` (MaxSim als eigener
     Cluster-Dienst `llm-gateway-colbert-maxsim`, dient den kanonischen Pfad
     nativ, kompatibel weiter `/v1/rerank`)
   - Alle fuenf Routen sind strikt von der Chat-Modellaufloesung
     (`/v1/models`) getrennt. Die Rolle kommt aus dem PFAD, nie aus dem
     Modellfeld (`scripts/llm-proxy/bge-routes.mjs`, `roleForPath`).
   - Upstream-nativer Pfad: Der kanonische Pfad waehlt nur die Rolle;
     upstream geht der native Pfad raus (`forwardPathForRole`):
     Embedding-Rollen -> `/v1/embeddings`, `colbert-rerank` ->
     `/v1/colbert/rerank`. Unveraendertes Durchreichen antwortete an
     llama.cpp-Upstreams mit 404 (belegt 2026-10-26).
   - Kein Quer-Fallback zwischen Vektorraeumen: ist eine Kette erschoepft,
     antwortet der Proxy 503 (`bge_chain_exhausted`) mit Grund je Glied.

2. **Registry-gesteuerte Ketten (SSOT):**
   - Die Kettenmitglieder und ihre Reihenfolge stehen in
     `dev-local/components/llm-services/deployment.yaml` als
     `LLM_PROXY_BACKENDS_JSON` (Env-Bypass; die fruehere Tabelle
     `tickets.llm_proxy_backends` existiert seit 2026-10-14 nicht mehr).
   - Eine Zeile gehoert zu einer Rolle, wenn `roles` den Rollennamen enthaelt.
   - Die Reihenfolge innerhalb der Kette wird ausschliesslich ueber
     `priority` (aufsteigend) bestimmt.
   - `enabled = false` schliesst ein Backend aus der Kette aus.
   - Der Proxy pollt die Registry alle 30 Sekunden automatisch oder via
     `POST /admin/reload`.

3. **Kettenreihenfolge (Topologie E2):**
   - `embed`: Tablet (`llm-gateway-tablet:8081`, Prioritaet 5) vor Cluster
     (`llm-gateway-embed`, Prioritaet 10). Kein `lmstudio`-Glied mehr
     (entfernt in `5fe38fbbb`, siehe E5-Protokoll unten).
   - `rerank`: Tablet (`llm-gateway-tablet:8080`, Prioritaet 5) vor Cluster
     (`llm-gateway-rerank`, Prioritaet 10), unveraendert.
   - `lfm-embed`: nur Cluster (`llm-gateway-lfm-embed:8081`, Prioritaet 10).
     Das Tablet traegt nur bge und entfaellt hier.
   - `colbert-embed`: nur Cluster (`llm-gateway-lfm-colbert:8081`,
     Prioritaet 10).
   - `colbert-rerank`: nur Cluster (`llm-gateway-colbert-maxsim:8081`,
     Prioritaet 10).

4. **Anfragegetriebenes Failover (E1):**
   - Die Registry liefert nur Mitgliedschaft und Reihenfolge.
   - Die Auswahl erfolgt rein anfragegetrieben beim Weiterleiten
     (Timeout/Verbindungsfehler/5xx -> naechstes Glied, 60 s je Glied).
     Es findet kein Health-Probing via `discovery.mjs` statt.

5. **Notfall-Rueckfall (E3):**
   - Ist die Registry leer oder nicht auswertbar, faellt der Proxy
     transparent auf den `roles`-Block in `scripts/llm/loadouts.json`
     zurueck und loggt genau eine Warnung. Der Block spiegelt die
     Registry-Ziele (Tablet- und Cluster-Adressen, keine Desktop-Loopbacks);
     Format-Guard: `task llm:loadouts:check`.

---

## Aufnahmebedingung: Aequivalenz-Gate (E5)

Vor der Aufnahme eines neuen Backends in eine Kette **muss** das
Aequivalenz-Gate gegen das Referenzglied der Rolle ausgefuehrt werden:

```bash
OLD_EMBED_URL=http://127.0.0.1:8081/v1/embeddings \
NEW_EMBED_URL=http://127.0.0.1:8085/v1/embeddings \
node scripts/llm/measure-embedding-equivalence.mjs
```

- **Kriterium:** Exit 0 (Kosinus-Aehnlichkeit ueber alle Testtexte >= 0,99
  und Dimension 1024 fuer den bge-m3-Raum).
- LFM- und ColBERT-Raeume haben eigene Masse und duerfen nie gegen bge
  gemessen werden (Quer-Eintrag wuerde so auffallen, R6).
- Erst nach erfolgreicher Messung darf das Backend in der Registry auf
  `enabled = true` gesetzt werden.

### E5-Protokoll (Stand 2026-10-26)

- `lmstudio` (PK-Desktop, `llm-gateway-host:1234`) steht seit
  `5fe38fbbb` (`chore(infra): lmstudio aus der embed-Kette nehmen`,
  #6912) mit leerer `roles`-Liste in der Registry und ist damit kein
  Glied der Kette `embed` mehr. Eine Dim-Pruefung ist gegenstandslos:
  Es gibt nichts mehr zu bestaetigen oder zu entfernen. Weder die
  Registry (`embed`: Tablet, Cluster) noch der E3-Rueckfall enthalten
  ein lmstudio-Glied.
- Gemessene Dimensionen (Cluster, 2026-10-26, `POST /embedding`
  `{"content": "hello world test"}` gegen `[{index, embedding}]`):
  bge-m3 1024 (1 Token), LFM2.5-Embedding 1024 (1 Token),
  LFM2.5-ColBERT 128 je Token (4 Token). Bestaetigt durch die
  Desktop-Unit-Texte (`serve-colbert-reranker`: 128 dim/tok,
  `serve-qwen3-embedding`: 1024 dim).

---

## Desktop-Rueckbau: Consumer-Erhebung (Stand 2026-10-26)

Zielbild: Alle Consumer sprechen den Proxy (`:18235` mit Rollenpfad) statt
`127.0.0.1:8093`/`:8095`/`:8097`. Der Rueckbau selbst laeuft als eigener
Chore im Dotfiles-Repo (dort liegen Units und Skripte); dieser Abschnitt
haelt nur die Befehlsliste und die Erhebung fest.

Live-Consumer in diesem Repo (umzustellen auf Proxy-Rollenpfade):

| Fundstelle | Heute | Ziel |
|---|---|---|
| `scripts/mcp/cbm-embed-client.py`, `cbm-embed-sync.py`, `cbm-embed-store.py` | `127.0.0.1:8095/v1/embeddings` (Default) | `:18235/v1/lfm/embeddings` (LFM-Raum) bzw. `:18235/v1/embeddings` (bge-Raum) |
| `scripts/cbm-refresh-cron.sh` | `127.0.0.1:8095/v1/embeddings` | wie oben |
| `components/website/src/lib/sdlc/codesearch-db.ts` | `localhost:8095`-Fallback | Proxy-Rollenpfad |
| `tests/local/NFA-11.sh` | `:8095/health` via SSH | Cluster-`/health` des ersetzenden Dienstes |
| `scripts/llm/start-gptoss-server.ps1` | `:8097/health`-Probe | entfaellt mit dem Forward |
| `scripts/index-repo.test.ts`, `sdlc/llm-proxy-db.test.ts` | Test-Fixtures mit `:8095`/`:8093` | Fixtures auf Proxy-Pfade ziehen |

Live-Consumer im Dotfiles-Repo (`~`, Units aktiv 2026-10-26):

| Fundstelle | Heute |
|---|---|
| `scripts/morning-health-brief.py`, `scripts/mcp-service-watchdog.sh` | Health-Proben `:8095`/`:8093`/`:8097` |
| `scripts/agents-overview.py` | `127.0.0.1:8095/v1/models`-Abfrage |
| `scripts/colbert_rerank.py` (`COLBERT_SERVER_URL`, Default-Port 8093) | Upstream `127.0.0.1:8097`, API `:8093` |
| `.config/systemd/user/cbm-refresh.service` | `LLM_EMBED_URL=http://127.0.0.1:8095/v1/embeddings` |
| `mcp-servers/devflow/lib/backends.mjs` | `:8095/health`-Probe + `:8095/v1/embeddings`-Fallback |

Ausfuehrbereite Befehlsliste (Dotfiles-Repo, erst wenn der MaxSim-Dienst
aus `k3d/llm-retrieval-maxsim.yaml` live und stabil dient — aktuell nur
als Manifest committet, noch nicht ausgerollt):

```bash
# 1. MaxSim-Desktop-API stoppen und deaktivieren (ersetzt durch
#    llm-gateway-colbert-maxsim:8081, Rolle colbert-rerank):
systemctl --user stop serve-colbert-api.service
systemctl --user disable serve-colbert-api.service
# 2. Cluster-Forwards entfernen (LFM-Dienste leben im Cluster):
systemctl --user stop devmesh-lfm-embed-forward.service
systemctl --user disable devmesh-lfm-embed-forward.service
systemctl --user stop devmesh-lfm-colbert-forward.service
systemctl --user disable devmesh-lfm-colbert-forward.service
# 3. Bis dahin unangetastet: serve-qwen3-embedding (bereits inactive/dead),
#    serve-colbert-reranker (derzeit activating/auto-restart).
```

`allow-llm-tablet-egress` (Netzwerkrichtlinie `app=llm-services` Richtung
`100.94.91.65/32` auf `:8080`/`:8081`) bleibt bestehen und wird nicht
angefasst (D6, Verifikation per `kubectl -n workspace get networkpolicy
allow-llm-tablet-egress`; vorhanden am 2026-10-26).
