---
title: "p5 — BATS-Tests fuer den plan-runner"
ticket_id: T900504
domains: [llm-local-dev]
status: active
---

# p5 — BATS-Tests fuer den plan-runner

Files: `tests/spec/llm-local-dev/plan-runner.bats`,
`tests/spec/llm-local-dev/fixtures/plan-runner-fake-orch.mjs`,
`tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh`,
`components/website/src/data/test-inventory.json` (regeneriert). Konventionen: `tests/CLAUDE.md`
(Output-Verifikation, Positiv-Anker). Vorbild fuer Fake-Server: `tests/spec/llm-local-dev/glimmer-worker-mcp.bats`.

## Task 5.1: Tests zuerst schreiben (RED)

Fixtures:

- `plan-runner-fake-orch.mjs <port> <script.json>`: HTTP-Server fuer `/v1/chat/completions`, der
  nacheinander vorgegebene Assistant-Antworten (Tool-Calls) aus `script.json` liefert und jeden
  Request als JSON-Zeile in eine Logdatei schreibt.
- `plan-runner-fake-opencode.sh`: liest `--agent`, schlaeft `FAKE_SLEEP_4B` (Agent `qwen35-mtp`) bzw. `FAKE_SLEEP_SELF` (Agent `local`) Sekunden, schreibt
  `<agent> <partial-marker>` in eine Logdatei und gibt `PLAN-RUNNER-RESULT: success fake` aus.

Szenarien (je ein `@test`, Namen = Requirement-Szenarien aus `specs/llm-local-dev.md`):

1. Partials run in dependency order — Manifest `p1`, `p2 depends_on p1`; das Fake-Log zeigt `p1` vor `p2`.
2. Progress survives a restart — vorab `state.json` mit `p1 done`, `p2 running`; nach dem Lauf wurde
   `p1` nicht erneut gestartet und `p2` endet `done`.
3. Self-execution is refused while a worker slot is free — Fake-Orchestrator ruft `execute_self` bei
   `--4b-slots 1` und freiem Slot; die naechste Anfrage an den Fake-Orchestrator enthaelt
   `use dispatch_4b`, das Fake-Log enthaelt keinen `local`-Aufruf.
4. Workers keep running while the orchestrator sleeps — `--4b-slots 1`, drei unabhaengige Partials,
   Fake-Orchestrator: `dispatch_4b p1`, dann `execute_self p2`; `FAKE_SLEEP_SELF=3`,
   `FAKE_SLEEP_4B=1`. Das Fake-Log zeigt `qwen35-mtp p3` vor dem Ende von `local p2`, und das
   `execute_self`-Ergebnis im Request-Log nennt `p3`.

Jeder Test prueft Exit-Code UND einen Positiv-Anker (Zeilenzahl des Fake-Logs > 0).

Vor der Implementierung laufen lassen, also bevor p1–p3 ihre Dateien anlegen (der gemeinsame
Stash-Stapel wird dafuer nicht benutzt):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/plan-runner.bats
```

expected: FAIL — `scripts/llm/plan-runner.mjs` existiert noch nicht.

## Task 5.2: GREEN und Inventar

Nach p1–p3 denselben Befehl erneut: alle vier Tests gruen. Danach `task test:inventory` und
`components/website/src/data/test-inventory.json` mitcommitten.
