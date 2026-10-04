---
id: P4
role: tests
ticket: T901014
depends_on: P1, P2, P3
target_files:
  - tests/spec/llm-local-dev/
---

# P4 – Track-Tests (T901014)

## Ziel

Abdeckung je Track auf den Fixtures plan-runner-fake-*:
P1 (Worker-Track-Trennung), P2 (Maschinen-Format) und P3
(Validierung ohne .md-Reste) sind je durch mindestens einen
Fall in `tests/spec/llm-local-dev/` abgesichert, der gegen
`plan-runner-fake-opencode.sh` und `plan-runner-fake-orch.mjs` laeuft.

## Betroffene Dateien

- `tests/spec/llm-local-dev/plan-runner.bats` (erweitern: je Track ein Fall)
- `tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh` (nutzen, nicht umbauen)
- `tests/spec/llm-local-dev/fixtures/plan-runner-fake-orch.mjs` (nutzen, nicht umbauen)

## Concrete-Steps

1. Failing-Test: neue Track-Faelle auf Alt-Stand (vor P1–P3) ausfuehren, expected FAIL; Runner `bash tests/runner.sh tests/spec/llm-local-dev/plan-runner.bats`, Fallback `bats tests/spec/llm-local-dev/plan-runner.bats`.
2. P1-Fall schreiben: Worker-Track-Trennung per Fake-Worker belegen (Dispatch waehlt Worker-Track, Lifecycle-Verwaltung bleibt unberuehrt).
3. P2-Fall schreiben: Maschinen-Format per Fake-Orch belegen (Manifest-/Prompt-Bau ohne .md-Rest).
4. P3-Fall schreiben: Validierung ohne .md-Reste belegen (Negativfall mit .md-Rest schlaegt fehl).
5. Nach P1–P3 Suite erneut ausfuehren: alle neuen Faelle GREEN.
6. Gegenprobe: neue Faelle zweimal hintereinander gruen (kein Flaky-Test).
7. Gate pruefen: `bash scripts/plan-lint.sh .agents/plans/worker-machine-format/tasks.md` PASS plus Suite gruen.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/worker-machine-format/tasks.md` → PASS
- Suite gruen: `bash tests/runner.sh tests/spec/llm-local-dev/` (Fallback `bats tests/spec/llm-local-dev/`)

## Disjunktheit

P1/P2/P3 fassen keine Tests an; alle Testaenderungen liegen exklusiv
in P4 unter `tests/spec/llm-local-dev/`, und P4 aendert keine
Implementierungsdateien ausserhalb dieses Verzeichnisses.
