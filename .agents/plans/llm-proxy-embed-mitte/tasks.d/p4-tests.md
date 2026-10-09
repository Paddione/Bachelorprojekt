# p4 — Spec-Lebenszyklus (RED → GREEN)

`target_files`: `tests/spec/llm-proxy-embed-mitte.bats`

## 1. RED — Spec anlegen und Rot nachweisen (failing test)

`tests/spec/llm-proxy-embed-mitte.bats` neu anlegen (Harness-Muster aus
`tests/spec/cbm-refresh-cron-A4.bats`: `setup()` mit `REPO_ROOT`). Fälle —
alle als Datei-Assertions, kein Cluster nötig:

1. Für jede Datei in `environments/*.yaml` gilt: `LLM_EMBED_URL` und
   `LLM_RERANKER_URL` teilen denselben Basis-Host (eine Mitte).
2. `scripts/mcp-gateway/probe.sh` enthält `18235`.
3. `scripts/mcp-gateway/watchdog-check.sh` erwähnt `18235`.

Runner (jetzt rot — failing test, Spec existiert noch nicht bzw. alle drei
Fälle scheitern am Ist-Stand mit `llm-gateway-embed` vs. `llm-gateway-rerank`
und fehlendem `18235`-Raster):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-proxy-embed-mitte.bats
# expected: FAIL — 3 rote Faelle (Split-Hosts, kein 18235-Raster)
```

## 2. GREEN — nach p1+p2 grün laufen lassen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-proxy-embed-mitte.bats
# expected: PASS — alle 3 Faelle gruen (Mitte vereint, 18235 im Raster)
node scripts/llm-proxy/bge-routes.test.mjs
# expected: PASS — Failover-Semantik unveraendert
```

Danach `task test:inventory` (Spec registrieren). Erst dann ist p4 fertig.
