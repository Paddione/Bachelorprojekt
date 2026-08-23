---
title: "decommission-orphaned-loadouts-T014339 — Implementation Plan"
ticket_id: T004339
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# decommission-orphaned-loadouts-T014339 — Implementation Plan

_Ticket: T004339_

## File Structure

```
scripts/llm/loadouts.json                                  (edit)  P1, P3
tests/spec/local-llm-proxy/loadout-model-files-exist.bats  (edit)  P2
scripts/brain-ingest.sh                                    (edit)  P3
scripts/brain-ingest-swap.sh                               (edit)  P3
openspec/changes/decommission-orphaned-loadouts-T014339/specs/local-llm-proxy.md  (new)
```

Kein Partial berührt mehr als ~50 LOC pro Datei; alle im S1-Budget.

## Kontext fuer den Implementierer

- Die Runtime respektiert top-level `enabled:false` bereits: `isLoadoutEnabled`
  in `scripts/llm-proxy/loadouts.mjs:353-364` → `return loadout?.enabled !== false`.
  Die Korrektur ist ausschliesslich im Guard-Test, der diese Eigenschaft ignoriert.
- `fit.enabled` ≠ `enabled`: erstere schaltet llama.cpp `--fit` um und verlangt
  `args.ctx` + `args.ngl` (loadouts.mjs:168); letztere deaktiviert das Loadout
  vollständig. `gemma12-vision` und `brain-ingest` tragen nur `fit.enabled:false`
  — das ist ein anderer Schalter und darf nicht mit dem Loadout-Deaktivierungs-Flag
  verwechselt werden.
- `brain-ingest` (P3) ist KEIN orphonialer Agent-Loadout: `brain-ingest.sh` +
  `brain-ingest-swap.sh` (T013593) bilden eine aktivierbare Pipeline gegen Port 8100.
  Da deren GGUF (`gemma-4-12B-qat`) fehlt, MUSS brain-ingest auf die
  FreeToken-native Engine (:1919) migriert werden, bevor das Loadout
  `enabled:false` markiert wird — sonst geht das letzte fehlende Gewicht unbemerkt
  und der Guard bleibt rot. `brain-ingest-swap.sh` ist kein Cron-/Taskfile-Aufruf
  mehr (nur der `brain-ingest`-Skill), also kein Parallel-Invocation-Risiko.

## Partials (Ausführungsreihenfolge)

```
        P2 (bats)      ─┐
P1 (loadouts.json) ──────┼──► P3 (brain-ingest migration, discovery-gated)
```

- **P1** (impl): `scripts/llm/loadouts.json` — 4 orphane Agent-Loadouts
  (`gemma26-factory`, `gemma4`, `gemma26-throughput`, `gemma12-vision`)
  `enabled:false` + Migrationsnotiz (FreeToken T014105). Disjunkt zu P2 (parallel).
- **P2** (test): `tests/spec/local-llm-proxy/loadout-model-files-exist.bats` —
  in `_resolve_all` (`l.managed === 'external'` →
  `l.managed === 'external' || l.enabled === false`); Positiv-Anker
  `gptoss-context OK` → `qwen38-220k OK`. Disjunkt zu P1 (parallel).
- **P3** (impl, discovery-gated): brain-ingest-Migration.
  1. `curl -s http://127.0.0.1:1919/v1/models` — Discovern, welcher Checkpoint von
     FreeToken als Textmodell ausgeliefert wird.
  2. `LM_STUDIO_URL=http://127.0.0.1:1919 LM_MODEL=<ckpt> bash
     scripts/brain-ingest-transform.sh <sample>` — Guard: rc=0 + gültiges
     Frontmatter (T012905-Spike-Format: genau eine `source::-Zeile`).
  3. Wenn grün: `brain-ingest.sh` defaults `LM_STUDIO_URL→:1919`,
     `LM_MODEL→<ckpt>`; `brain-ingest-swap.sh` Loadout-Pin auf `brain-ingest`
     entfernen und als veraltet kennzeichnen; brain-ingest-Loadout `enabled:false`
     + Migrationsnotiz.
  4. Wenn rot: Escalate → Folgeticket (12B-GGUF wiederherstellen).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Bevor P1/P2: der *bestehende* Guard ist rot —
      er meldet deaktivierte/orphane Loadouts als MISSING und der Positiv-Anker
      `gptoss-context OK` schlägt fehl (gguf fehlt).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/loadout-model-files-exist.bats
# expected: FAIL — MISSING-Meldungen für gptoss-context/gemma26-factory/etc.
```

- [ ] **Fix-Step (GREEN).** Nach P1+P2 (+ P3): derselbe Befehl ist `expected: PASS`;
      nur aktive Loadouts mit vorhandener GGUF werden aufgelöst,
      `qwen38-220k OK` ist der Positiv-Anker.

- [ ] **Final Verification.** Die drei CI-Gates:

```bash
task test:changed
task freshness:check
bash scripts/openspec.sh validate
```
