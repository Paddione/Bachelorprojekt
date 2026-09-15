---
title: "qwen-tensor-split — Implementation Plan"
ticket_id: T900172
domains: [llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# qwen-tensor-split — Implementation Plan

_Ticket: T900172_

## File Structure

```
scripts/llm/start-qwen-server.ps1                 # -TensorSplit-Default 85,15, Kommentar korrigieren
scripts/llm/loadouts.json                         # qwen38-220k: extraArgs -ts 85,15, Notiz nachziehen
tests/spec/llm-local-dev/qwen-tensor-split.bats   # Guard (bereits RED committed)
openspec/changes/qwen-tensor-split/               # proposal, delta spec, tasks
```

## Tasks

- [x] **Task 1: Failing-Test bestaetigen (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/qwen-tensor-split.bats
# expected: FAIL (TensorSplit-Default leer, Loadout ohne -ts)
```

- [x] **Task 2: Skript (GREEN, Teil 1).** In `scripts/llm/start-qwen-server.ps1` `[string]$TensorSplit = ""` auf `"85,15"` setzen. `.PARAMETER TensorSplit` und den Kommentarblock `FALLSTRICK -ngl NEBEN -fit on` an die Messung anpassen: `-ts` und `-ngl` brechen nur die Layer-Platzierung ab, die Kontextanpassung an `-fitt` laeuft weiter. Messtabelle aus proposal.md uebernehmen. Datei bleibt ASCII ohne BOM, Parser-Check:

```bash
powershell.exe -NoProfile -Command "$e=$null; [System.Management.Automation.Language.Parser]::ParseFile('<WT-UNC>\scripts\llm\start-qwen-server.ps1',[ref]$null,[ref]$e) | Out-Null; $e.Count"
```

- [x] **Task 3: Loadout (GREEN, Teil 2).** In `scripts/llm/loadouts.json` beim Slug `qwen38-220k` `"-ts", "85,15"` an `extraArgs` anhaengen und die Notiz um die Split-Messung ergaenzen. Format pruefen:

```bash
node scripts/llm/loadouts-format.mjs --check scripts/llm/loadouts.json
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/ tests/spec/local-llm-proxy/
```

- [x] **Task 4: Live-Messung.** Skript ohne Parameter starten und pruefen: `-ts 85,15` in der Kommandozeile, `n_ctx_slot` 205.056, 3060 Ti mindestens 1500 MiB frei, Decode um 38 t/s.

```bash
grep -ao 'n_ctx_slot = [0-9]*' /mnt/c/Users/PatrickKorczewski/llama-b10881-13.3/qwen38-err.log
nvidia-smi --query-gpu=name,memory.free --format=csv,noheader
```

- [ ] **Task 5: Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
