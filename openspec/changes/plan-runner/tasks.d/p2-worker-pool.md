---
title: "p2 — Worker-Pool: opencode-Prozesse und Slot-Verwaltung"
ticket_id: T900504
domains: [llm-local-dev]
status: active
---

# p2 — Worker-Pool: opencode-Prozesse und Slot-Verwaltung

Files: `scripts/llm/plan-runner/workers.mjs` (neu; disjunkt zu p1, p3–p5).

## Task 2.1: Prozessstart

`runWorker({ agent, prompt, worktree, timeoutMs })` startet per `child_process.spawn`
`<bin> run --agent <agent> --dir <worktree> <prompt>`; `<bin>` ist `process.env.PLAN_RUNNER_OPENCODE`
oder `opencode`. Rueckgabe ist ein Promise auf `{ code, tail, ok, summary, ms }`:
`tail` = letzte 4.000 Zeichen von stdout+stderr, `ok`/`summary` aus `parseResult` (p1).
Beim Timeout wird der Prozess mit `SIGTERM` beendet und `{ ok: false, summary: 'timeout' }` geliefert.

## Task 2.2: Slot-Verwaltung

Klasse `WorkerPool({ slots4b, worktree, timeoutMs })`:

- `free4b()` = `slots4b - laufende 4B-Jobs`.
- `start4b(partialId, prompt)`: wirft, wenn `free4b() === 0`; sonst `runWorker({ agent: 'qwen35-mtp', … })`,
  merkt den Job, liefert sofort die Job-ID.
- `runSelf(partialId, prompt)`: `runWorker({ agent: 'local', … })`; hoechstens ein Selbstaufruf
  gleichzeitig (zweiter Aufruf wirft).
- `nextEvent()`: Promise auf das naechste beendete 4B-Ergebnis `{ partialId, ok, summary, tail }`;
  bereits beendete, noch nicht abgeholte Ergebnisse werden in Reihenfolge des Endes geliefert.
- `slots4b` kommt aus der CLI (`--4b-slots`) mit dem in p4 gemessenen Default.

Akzeptanz: `node --check scripts/llm/plan-runner/workers.mjs`; p5 treibt den Pool ueber
`PLAN_RUNNER_OPENCODE` mit einem Stub.
