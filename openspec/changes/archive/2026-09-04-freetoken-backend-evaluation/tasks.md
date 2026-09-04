---
title: "freetoken-backend-evaluation — Implementation Plan"
ticket_id: T900087
domains: [ops, infra, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freetoken-backend-evaluation — Implementation Plan

_Ticket: T900087_

## File Structure

```
scripts/llm/start-gptoss-server.ps1                          (edit) P1  154 LOC, kein S1-Limit
scripts/llm/start-gemma-server.ps1                           (edit) P1  400 LOC, kein S1-Limit
.opencode/plugin/freetoken-active.ts                         (edit) P2  192/900 → 708 frei
scripts/llm/measure-factory-context.mjs                      (new)  P3    0/800 → 800 frei
scripts/llm/bench-engine-ab.sh                               (new)  P4    0/800 → 800 frei
scripts/llm/bench-ifstruct.sh                                (new)  P5    0/800 → 800 frei
scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md (new)  P6  kein S1-Limit
docs/runbooks/freetoken-native.md                            (edit) P6  425 LOC, kein S1-Limit
tests/spec/llm-local-dev/alias-telemetry.bats                (new)  P7
```

**Kein S1-Druck in diesem Change.** Die einzige nennenswerte Bestandsdatei
(`freetoken-active.ts`) hat 708 Zeilen Budget für einen Eingriff von rund 20;
alle übrigen Ziele sind neu oder tragen kein Limit (`docs/code-quality/gates.yaml`
kennt für `.ps1` und `.md` keine Schwelle). Es gibt daher keinen Verkleinerungs-
oder Split-Zwang.

**`scripts/llm/loadouts.json` ist bewusst KEIN Ziel.** Es zu ändern verletzte
`tests/spec/freetoken-local-backend/routing.bats` und kollidierte mit dem offenen
Change `decommission-orphaned-loadouts-T014339`. Gemessen wird mit direkten
`llama-server`-Aufrufen auf Scratch-Ports — Präzedenzfall ist die vorhandene
qwen38-Messung in `loadouts.json` (`llama-server -m … --port 8194 …`).

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| P1 | `tasks.d/p1-server-scripts.md` | infra | `scripts/llm/start-gptoss-server.ps1` `scripts/llm/start-gemma-server.ps1` |  |
| P2 | `tasks.d/p2-alias-telemetry.md` | ops | `.opencode/plugin/freetoken-active.ts` |  |
| P3 | `tasks.d/p3-context-measurement.md` | ops | `scripts/llm/measure-factory-context.mjs` |  |
| P4 | `tasks.d/p4-engine-ab.md` | ops | `scripts/llm/bench-engine-ab.sh` | P1 |
| P5 | `tasks.d/p5-ifstruct.md` | ops | `scripts/llm/bench-ifstruct.sh` |  |
| P6 | `tasks.d/p6-report.md` | ops | `scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md` `docs/runbooks/freetoken-native.md` | P2,P3,P4,P5 |
| P7 | `tasks.d/p7-tests.md` | tests | `tests/spec/llm-local-dev/alias-telemetry.bats` | P2 |

**Abhängigkeiten im Klartext:** P1 blockiert P4 — ohne den GPU-Fix startet kein
Messserver. P2 blockiert P7, weil ein Guard erst prüfen kann, was existiert.
P6 verdichtet die Ergebnisse aus P2–P5 und ist inhaltlich das letzte Stück,
auch wenn P7 formal das letzte Partial ist (Tests-Rolle am Ende).

## Abbruchpunkte

Beides sind **Ergebnisse, keine Fehlschläge**, und werden in P6 als solche berichtet:

1. **Kontextbedarf.** Übersteigt der gemessene Bedarf das Fenster, das ein
   residentes Loadout bietet, entfällt das Hauptargument gegen FreeToken und der
   Modellvergleich in P4/P5 schrumpft entsprechend.

   **Einschränkung, die die Beweislast verschiebt** (Befund aus P3, verifiziert):
   `scripts/factory/eval-context.cjs` baut **nicht** den Dispatch-Prompt. Die
   realen `contextHints` entstehen getrennt davon zur Laufzeit
   (`scripts/factory/provision.js:120`, `pipeline-decompose.cjs:64`) und sind
   ausdrücklich „a COMPACT list of context labels … NEVER a raw dump". Die acht
   Fixtures messen damit nur eine Komponente — eine **Untergrenze**.

   Eine Untergrenze kann nur in **eine** Richtung entscheiden: Übersteigt schon
   sie das Fenster, ist die Sache klar. Sie kann aber nicht belegen, dass der
   Bedarf *klein* ist — und genau das wäre die Aussage, die eine Migration
   trägt. Der Nachweis „die 200.000 Tokens werden nicht gebraucht" kann deshalb
   **nur aus der Live-Telemetrie (P2)** kommen, nicht aus P3. P3 liefert die
   sofort verfügbare Untergrenze und den Fehlerbalken; P2 liefert die Zahl, auf
   der die Entscheidung ruht. P6 muss beide getrennt ausweisen und darf sie
   nicht zu einer Zahl verschmelzen.

2. **Engine-Isolation.** Verliert llama.cpp in P4 schon bei identischen
   Gewichten (`gpt-oss-20b` auf beiden Engines), ist der Modellvergleich
   hinfällig und die ~26 GB Download entfallen.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Der Guard aus P7 prüft die Alias-Telemetrie
      aus P2. Vor deren Implementierung muss er fehlschlagen — läuft er grün,
      prüft er nicht, was er zu prüfen vorgibt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/alias-telemetry.bats
# expected: FAIL (rot — die Telemetrie aus P2 existiert noch nicht)
```

- [x] **Fix-Step (GREEN).** P2 implementieren; der Guard aus P7 läuft danach grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/alias-telemetry.bats
# expected: PASS
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
