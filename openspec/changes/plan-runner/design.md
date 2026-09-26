---
ticket_id: T900504
plan_ref: openspec/changes/plan-runner/tasks.md
status: active
date: 2026-09-26
---

# Design: plan-runner

_Ticket: T900504_

## Entscheidungen (Brainstorming 2026-09-26)

| ID | Frage | Entscheidung |
|---|---|---|
| D1 | Wo lebt der Scheduler? | Node-Skript `scripts/llm/plan-runner.mjs`; Worker laufen als `opencode run --agent <agent> --dir <worktree>` und behalten so ihre Tools. |
| D2 | Planformat | OpenSpec-Partials: `## Partials`-Tabelle in `tasks.md` + `tasks.d/pX-*.md`. |
| D3 | 5070-Ti-Modus | 1 Slot, `-c 196608`, MTP n-max 4, `-cram 12288` (Unit `qwen38-gsq-iq2s.service`). |
| D4 | 4B-Worker | Nur RTX 3060 Ti (`:1920`); Slot-Zahl wird in p4 gemessen und als Default gesetzt. |

## Messgrundlage

`scripts/llm/measurements/2026-09-26-qwen38-gsq-iq2s-mtp.md` (Branch `chore/llm-bench-orchestration-T900480`):

- Solo-Optimum 196k/1 Slot: 71-102 t/s Decode, 1.305 t/s Prefill, 15.439 MiB.
- `--cache-ram`: verdrängter 51k-Orchestrator-Slot kehrt in 2,9 s zurück (26 Token neu), kalt 48 s.
- Slot-Save/Restore: 0,65 s / 0,31 s, danach trotzdem volles Neu-Prefill (Hybridmodell) → nicht verwendet.
- Orchestrierung (Benchmark): IQ2_S 13/15, IQ3_XXS 15/15.

## Ablauf

```
plan-runner.mjs <change-dir>
  ├─ plan.mjs: Manifest parsen → Partials + depends_on → state.json laden/anlegen
  ├─ Orchestrator-Loop (:1919, Tools):
  │    plan_status()                → offene/laufende/fertige Partials, freie 4B-Slots
  │    dispatch_4b(id, prompt)      → Slot frei: async starten → STARTED | sonst BUSY
  │    execute_self(id, prompt, plan_notes)
  │                                 → nur wenn 0 freie 4B-Slots; state.json speichern,
  │                                   `opencode run --agent local` starten, Loop blockiert
  │                                   (Orchestrator-KV liegt per --cache-ram im RAM)
  │    wait_event()                 → blockiert bis ein 4B-Job endet, liefert Ergebnis
  │    mark(id, done|failed|open, note)
  │    finish(summary)
  └─ Idle-Dispatch: solange execute_self läuft, bekommt jeder frei werdende 4B-Slot die nächste
     bereite Partial mit dem Standard-Prompt (buildWorkerPrompt). Ergebnisse werden beim Aufwachen
     als Ereignisse an den Orchestrator geliefert.
```

## Zustand (`openspec/changes/<slug>/.plan-runner/state.json`)

```json
{ "slug": "…", "partials": { "p1": { "status": "open|running|done|failed", "owner": "4b|self|null",
  "attempts": 0, "result": "…" } }, "orchestrator": { "notes": "…", "frozen_at": null } }
```

Geschrieben wird atomar (Temp-Datei + `rename`). Ein Neustart setzt `running`-Partials auf `open` zurück
und macht dort weiter (Resume).

## Worker-Vertrag

- Prompt enthält den vollständigen Inhalt der Partial-Datei, den Worktree-Pfad und die Regel, nur die
  `target_files` der Partial zu ändern.
- Letzte Zeile der Worker-Ausgabe: `PLAN-RUNNER-RESULT: success|failure <Kurzfassung>`. Fehlt sie, gilt
  der Lauf als `failure`.
- Partials haben disjunkte `target_files` (plan-lint D1), deshalb dürfen 4B-Worker und Selbstaufruf
  parallel im selben Worktree arbeiten.
- Testbarkeit: `PLAN_RUNNER_OPENCODE` ersetzt das `opencode`-Binary, `PLAN_RUNNER_ORCH_URL` den Orchestrator.

## Risiken

- R1: Das WSL-Limit (24 GB) muss den `--cache-ram`-Inhalt (~21,5 KB/Token) und die opencode-Prozesse
  tragen; `-cram 12288` begrenzt den Cache.
- R2: Der 4B besteht Orchestrierungsaufgaben nicht zuverlässig allein; deshalb prüft der Orchestrator
  jedes Worker-Ergebnis (`mark`), bevor eine Partial `done` wird.
- R3: Mehr 4B-Slots verkleinern den Kontext je Slot; p4 misst das, bevor der Default steigt.
