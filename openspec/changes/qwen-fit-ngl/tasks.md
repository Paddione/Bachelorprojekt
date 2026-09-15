---
title: "qwen-fit-ngl — Implementation Plan"
ticket_id: T900171
domains: [llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# qwen-fit-ngl — Implementation Plan

_Ticket: T900171_

## File Structure

```
scripts/llm/start-qwen-server.ps1                     # -ngl 999 nur bei -fit off; Messtabelle korrigieren
tests/spec/llm-local-dev/fit-ngl-conflict.bats        # Guard (bereits RED committed)
openspec/changes/qwen-fit-ngl/                        # proposal, delta spec, tasks
```

## Tasks

- [x] **Task 1: Failing-Test bestaetigen (RED).** Der Guard liegt schon im Branch.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/fit-ngl-conflict.bats
# expected: FAIL (start-qwen-server.ps1 listet "-ngl", "999" im unbedingten $Params-Block)
```

- [x] **Task 2: Fix (GREEN).** In `scripts/llm/start-qwen-server.ps1` die Zeile `"-ngl", "999",` aus dem `$Params = @( ... )`-Block entfernen und im `-Ctx`-Zweig ergaenzen:

```powershell
if ($Ctx -gt 0) {
  $Params += @("-c", "$Ctx", "-fit", "off", "-ngl", "999")
} else {
  $Params += @("-fit", "on", "-fitt", "$FitMarginMib", "-fitc", "$MinCtx")
}
```

  Die Datei bleibt ASCII ohne BOM (scripts/llm/CLAUDE.md). Parser-Check:

```bash
powershell.exe -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('\\wsl.localhost\k3d-dev<WT>\scripts\llm\start-qwen-server.ps1',[ref]\$null,[ref]\$e) | Out-Null; \$e.Count"
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/fit-ngl-conflict.bats
```

- [x] **Task 3: Kommentar im Skriptkopf korrigieren.** Die Messtabelle entstand mit abgebrochenem `-fit`. Einen Hinweis mit der neuen Messung ergaenzen (205.056 ctx, frei 1752/2782 MiB, ~31 t/s, 2026-09-15) und die `-ngl`-Falle mit der Log-Zeile benennen.

- [x] **Task 4: Live-Messung.** Skript ohne Parameter starten, Log und VRAM pruefen:

```bash
grep -a 'common_fit_params' /mnt/c/Users/PatrickKorczewski/llama-b10881-13.3/qwen38-err.log   # erwartet: kein Treffer
nvidia-smi --query-gpu=index,name,memory.free --format=csv,noheader                           # 3060 Ti >= 1500 MiB frei
```

- [ ] **Task 5: Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
