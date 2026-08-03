# p4 — Tests

**Rolle:** tests
**depends_on:** p1, p2, p3
**target_files:** `website/src/lib/rerank.test.ts`, `website/src/lib/embeddings.test.ts`,
`tests/spec/llm-pipeline.bats`

| Datei | Ist | Budget |
| --- | --- | --- |
| `website/src/lib/rerank.test.ts` | 58 | 542 |
| `website/src/lib/embeddings.test.ts` | 153 | 447 |

`tests/spec/llm-pipeline.bats` unterliegt keinem S1-Extension-Limit.

Alle drei Dateien existieren bereits und werden **erweitert**, nicht ersetzt — neue Testdateien
werden nicht angelegt.

## Task 4.1 — Failing-Test-Step (RED)

Zuerst werden die Assertions geschrieben, die den Zielzustand beschreiben, und **vor** der
Implementierung ausgeführt. Sie müssen rot sein.

In `tests/spec/llm-pipeline.bats` ergänzen:

- Kein `environments/*.yaml` enthält noch `llm-gateway-lmstudio`, `llm-gateway-tei-embed` oder
  `llm-gateway-tei-rerank`.
- Kein `environments/*.yaml` und kein `environments/schema.yaml` enthält noch `LLM_LMSTUDIO_URL`,
  `LLM_ROUTER_URL`, `LLM_CHAT_MODEL`, `LLM_CODING_MODEL` oder `LLM_EMBED_MODEL_NOMIC`.
- `k3d/llm-gpu.yaml` definiert Service **und** Endpoints für `llm-gateway-embed` (Port 8095) und
  `llm-gateway-rerank` (Port 8096).
- `scripts/llm/start-embed-server.ps1` existiert und enthält `--pooling cls` sowie `--embedding`.
- `scripts/llm/start-rerank-server.ps1` existiert, enthält `--reranking` und enthält **kein**
  `--embedding`.
- `scripts/llm/start-bonsai-server.ps1` existiert, enthält `-np 4`, und der `-c`-Wert geteilt
  durch 4 ist mindestens 32768.
- `scripts/llm/register-scheduled-tasks.ps1` existiert.

In `website/src/lib/rerank.test.ts` ergänzen:

- Der gemockte `fetch` wird mit einem Pfad aufgerufen, der auf `/v1/rerank` endet.
- Der Request-Body enthält den Schlüssel `documents` und **nicht** `texts`.
- Eine Antwort der Form `{results:[{index, relevance_score}]}` wird korrekt absteigend nach
  `relevance_score` sortiert auf `{doc, score}` abgebildet.
- Bei einem Fehlerstatus wird `logger.warn` aufgerufen **und** `score: 0` zurückgegeben.
- Bei `LLM_RERANK_ENABLED=false` wird `logger.warn` **nicht** aufgerufen.

**Step:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline.bats
npx vitest run website/src/lib/rerank.test.ts
# expected: FAIL — Startskripte, Services und der llama.cpp-Dialekt existieren noch nicht
```

Beide Läufe müssen an dieser Stelle rot sein. Erst danach werden p1 bis p3 umgesetzt.

## Task 4.2 — Bestehende Tests an den neuen Dialekt anpassen

Die vorhandenen Tests in `website/src/lib/rerank.test.ts` prüfen den TEI-Dialekt und werden
mitgezogen:

| Bestehender Test | Anpassung |
| --- | --- |
| `returns docs sorted descending by score on happy path` | Mock-Antwort auf `{results:[{index, relevance_score}]}` umstellen |
| `returns input docs with score=0 when LLM_RERANK_ENABLED=false` | unverändert, zusätzlich: keine Warnung |
| `on router 503 returns input docs with score=0 (graceful)` | zusätzlich: Warnung wird geloggt |
| `empty docs returns empty array without calling fetch` | unverändert |

Außerdem wird in beiden Testdateien das Setzen von `LLM_ROUTER_URL` entfernt: Die Variable wird in
`rerank.test.ts:6,12,18` und `embeddings.test.ts:50` gesetzt, aber von keinem getesteten Codepfad
gelesen — die Tests konfigurieren ins Leere. An ihre Stelle treten `LLM_RERANKER_URL`
beziehungsweise `LLM_EMBED_URL`, also die Variablen, die der Code tatsächlich ausliest.

In `website/src/lib/embeddings.test.ts` wird zusätzlich geprüft, dass der Default von `embedUrl()`
auf den neuen Embedding-Service zeigt und nicht mehr auf `llm-gateway-lmstudio`.

## Task 4.3 — Grün stellen und Inventar regenerieren

Nach Umsetzung von p1 bis p3 müssen beide Läufe grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline.bats
npx vitest run website/src/lib/rerank.test.ts website/src/lib/embeddings.test.ts
```

Danach das Test-Inventar regenerieren und mitcommitten — CI vergleicht es gegen den Stand im
Repository:

```bash
task test:inventory
```

`website/src/data/test-inventory.json` gehört in denselben Commit wie die Teständerungen.
