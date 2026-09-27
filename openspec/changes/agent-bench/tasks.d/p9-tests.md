---
title: "p9 — Tests (BATS, ohne GPU)"
ticket_id: T900561
domains: [llm-local-dev]
status: active
---

# p9 — Tests (BATS, ohne GPU)

Files: `tests/spec/agent-bench/` (neu: `scoring.bats`, `recorder.bats`, `loadouts.bats`,
`matrix-cli.bats`, `report-corpus.bats`, `fixtures/`), `components/website/src/data/test-inventory.json`
(regeneriert). Tests prüfen Ausgaben und Exit-Codes, nicht den Quelltext (`tests/CLAUDE.md`).

## Task 9.1: Failing Tests zuerst (RED)

Tests für jedes Szenario aus `openspec/changes/agent-bench/specs/agent-bench.md` anlegen, bevor die
Implementierung aus p1–p6 vorliegt. Fixtures:
- `fixtures/fake-openai.mjs`: OpenAI-kompatibler Fake-Server mit skriptbaren Antworten (Tool-Calls, Streaming, Bild-Echo).
- `fixtures/fake-opencode.sh`: Muster `tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh`.
- `fixtures/fake-bin/{nvidia-smi,systemctl,gpu-lock.sh}`: protokollieren Aufrufe in eine Datei, Werte per Env steuerbar.
- `fixtures/cases/`: zwei Mini-Fälle (`split: eval` und `split: train`), ein Fall ohne `source.md`.
- `fixtures/runs/`: vorgefertigte Laufverzeichnisse mit `score.json`/`trace.jsonl` für Report-, Gate- und Export-Tests.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-bench/
```
expected: FAIL (Module unter `scripts/llm/agent-bench/lib/` fehlen noch)

## Task 9.2: Szenario-Abdeckung

| BATS-Datei | Szenarien |
|---|---|
| `scoring.bats` | Same trace yields same score · Detour lowers the score · Ambiguous variant requires a clarification · False pass weighs more than false fail · Case without source event is rejected · New case needs no code change |
| `recorder.bats` | Secret is redacted in the trace · Image is stored by content hash · Recorder attributes requests to its role |
| `loadouts.bats` | Marlin fallback is refused · Production orchestrator is restored after an abort (SIGINT an laufenden `bench.mjs`, danach Fake-`systemctl`-Protokoll enthält `start qwen38-gsq-iq2s.service` und Fake-`gpu-lock.sh` `release`) · Spill wird als Infra-Fehler gemeldet |
| `matrix-cli.bats` | Only selected roles are measured · Unknown role is refused · Worker is measured on the reference partial · Chained mode passes the real plan · Plans are reused across executors · Vision role skips models without vision · Resume skips completed stages |
| `report-corpus.bats` | Infrastructure error is not blamed on the model · Mixed combination is highlighted · Regression fails the gate · Mismatched scoring version is refused · Eval cases never reach the corpus · Trajectory with a detour is not exported as ideal |

`vllm-kernel-check.py` wird mit einem Fake-Serverlog getestet; fehlt `torch` in CI, prüft der Test
nur den Log-Pfad über `--log-only` (Flag in p3 vorsehen) und überspringt den Geräte-Check mit
`skip "torch not installed"`.

## Task 9.3: GREEN und Inventar

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-bench/
task test:inventory
```
Erwartet: alle Tests grün; `components/website/src/data/test-inventory.json` mitcommitten.
