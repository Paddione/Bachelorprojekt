# p4 — Spec-Lebenszyklus (RED → GREEN)

`target_files`: `tests/py/spec/test_llm_proxy_embed_mitte.py`

## 1. RED — Spec anlegen und Rot nachweisen (failing test)

`tests/py/spec/test_llm_proxy_embed_mitte.py` neu anlegen (Standard seit
T901392 — BATS ist deinstalliert; `repo_root`-Fixture aus
`tests/py/conftest.py`, Fälle als Datei-Assertions, kein Cluster nötig;
`LLM_MITTE_TEST_ROOT`-Override für den RED-Beleg gegen Vor-Change-Dateien):

1. Für jede Datei in `environments/*.yaml` gilt: `LLM_EMBED_URL` und
   `LLM_RERANKER_URL` teilen denselben Basis-Host (eine Mitte).
2. `scripts/mcp-gateway/probe.sh` enthält `18235`.
3. `scripts/mcp-gateway/watchdog-check.sh` erwähnt `18235`.

Runner (jetzt rot — failing test, Spec existiert noch nicht bzw. alle drei
Fälle scheitern am Ist-Stand mit `llm-gateway-embed` vs. `llm-gateway-rerank`
und fehlendem `18235`-Raster):

```bash
# RED-Beleg: Vor-Change-Dateien aus origin/main nach /tmp/red-mitte legen
# (environments/*.yaml + probe.sh + watchdog-check.sh), dann:
LLM_MITTE_TEST_ROOT=/tmp/red-mitte bash scripts/pytest-run.sh tests/py/spec/test_llm_proxy_embed_mitte.py -q
# expected: FAIL — 2 rote Faelle (Split-Hosts, kein 18235-Raster; Fall 3 war
# bereits vorher gruen, weil watchdog-check.sh 18235 im Kommentar nennt)
```

## 2. GREEN — nach p1+p2 grün laufen lassen

```bash
bash scripts/pytest-run.sh tests/py/spec/test_llm_proxy_embed_mitte.py -q
# expected: PASS — alle 3 Faelle gruen (Mitte vereint, 18235 im Raster)
node scripts/llm-proxy/bge-routes.test.mjs
# expected: PASS — Failover-Semantik unveraendert (12 pass / 0 fail)
```

Danach `task test:inventory` (Spec registrieren). Erst dann ist p4 fertig.
