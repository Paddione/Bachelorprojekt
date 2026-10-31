# p5 — Tests für Pfade und Ketten

## Task 1: RED-Beleg fortschreiben und Testfälle erweitern

**Files:** `bge-routes.test.mjs`, `test_bge_chain_order.py`

In `scripts/llm-proxy/bge-routes.test.mjs` ergänzen: `roleForPath` für
die drei neuen Pfade (Beleg: `null` auf `main`, expected: FAIL vor p1),
Weiterleitung je Rolle an das richtige Erstglied (Stub-Upstreams),
kein Quer-Fallback (ColBERT-Stub antwortet nie auf bge-Anfragen und
umgekehrt) sowie 503 mit Grund je Glied bei erschöpfter Kette. In
`tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py`
die Kettenbehauptungen auf die neue Topologie umstellen (Tablet vor
Cluster in `embed`, fünf Rollen aus `loadouts.json`).

RED-Lauf (auf `main` reproduzierbar, Beleg aus der Planung):
`node --test scripts/llm-proxy/bge-routes.test.mjs` -> expected: FAIL
(neue Pfade liefern `null`, Server reicht an `proxyV1` durch);
`python3 -m pytest -q tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py`
-> expected: FAIL (alte Desktop-Ketten widerlegt).

## Task 2: GREEN und Suiten

**Files:** `bge-routes.test.mjs`, `test_bge_chain_order.py`

Beide Dateien gegen den p1–p4-Stand grün fahren:
`node --test scripts/llm-proxy/bge-routes.test.mjs` und
`python3 -m pytest -q tests/py/spec/native_ported/spec/local-llm-proxy/`.
Danach die registrierte Suite `task test:llm-proxy` vollständig grün
(`node --test`-Liste plus `vitest`-Lauf für `mcp-bridge.test.mjs`).

Verify: beide Läufe Exit 0; `task test:inventory` nach Teständerung
ausgeführt (generiertes Inventar aktuell).

Commit: `test(scripts): Ketten-Tests für getrennte Retrieval-Rollen`
