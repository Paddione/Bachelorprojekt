# p2 — Proxy-Mitte (URLs + Registry)

`target_files`: `environments/dev.yaml`,
`environments/fleet-mentolder.yaml`, `environments/mentolder.yaml`,
`environments/staging.yaml`, `environments/korczewski.yaml`,
`environments/fleet-korczewski.yaml`,
`scripts/knowledge/kalibrierung-retrieval.mjs`,
`scripts/p0min-embed-run.py`, `scripts/mcp/cbm-embed-sync.py`,
`scripts/mcp/cbm-hybrid.py`, `docs/agent-guide/registry/mcp.yaml`

Voraussetzung: p1 (Gateway gesund, `:18235` und `:13005` antworten).

## 1. Service-Namen verifizieren (kein Raten)

```bash
kubectl --context devmesh -n workspace get svc | grep -i "llm-proxy\|llm-gateway"
kubectl --context fleet -n workspace get svc | grep -i "llm-proxy\|llm-gateway"
```

Nur mit belegten Namen weiter. In-Cluster-Ziele sind die Proxy-Services
(beide Rollen über **denselben** Host, Pfad unterscheidet die Rolle —
`bge-routes.mjs:30-33`); lokale Ziele bleiben `http://127.0.0.1:18235`.

## 2. Umstellen

- `environments/*.yaml` (6 Dateien, je 2 Zeilen): `LLM_EMBED_URL` und
  `LLM_RERANKER_URL` auf den verifizierten Proxy-Host. `LLM_RERANK_ENABLED`
  unverändert lassen.
- `kalibrierung-retrieval.mjs:38-39`: Defaults auf
  `http://127.0.0.1:18235` (beide Rollen, Pfad trennt).
- `p0min-embed-run.py:26`: Default auf `http://127.0.0.1:18235`.
- `cbm-embed-sync.py:502-506`: Default auf den Proxy; `LLM_EMBED_URLS`
  (Komma-Fan-out) bleibt funktional — Proxy als erstes Glied.
- `cbm-hybrid.py:306`: Default auf den Proxy.
- `mcp.yaml`: `failover_note` von bge-mcp um einen Satz ergänzen
  (Upstream = llm-proxy-Rollen-Ketten).

Nicht anfassen: `bge-router.ts` (Vertrag unverändert),
`server.mjs` (kein Code-Change; Env-Pins der `llm-services`-Komponente
prüfen und hier vermerken, falls sie `LLM_EMBED_URL` direkt setzen).

## 3. Verifizieren

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-proxy-embed-mitte.bats
# expected: PASS — alle 3 Faelle gruen
node scripts/llm-proxy/bge-routes.test.mjs
# expected: PASS — Failover-Semantik unveraendert
curl -s -m 10 -X POST http://127.0.0.1:18235/v1/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-m3","input":["proxy-mitte-probe"]}' | head -c 300
curl -s -m 30 -X POST http://127.0.0.1:13005/mcp \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $BGE_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bge_embed","arguments":{"texts":["proxy-mitte-probe"]}}}'
```

Beide Proben müssen Vektoren liefern (MCP-Pfad läuft über den Shim auf
denselben Proxy — Fassade belegt). Belege als Ticket-Kommentar an T901560.
