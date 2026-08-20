# Plan: branch-reaper Netzausfall-Handling [T012967]

## File Structure

```
scripts/branch-reaper.sh                          # FIX: Exit-Code-Auswertung
tests/spec/branch-reaper-netzausfall.bats          # TEST: failing + passing
```

## Tasks

### 1. Failing Test schreiben
- [x] `tests/spec/branch-reaper-netzausfall.bats` anlegen
- [x] Test 1: `git ls-remote` mit rc=1 → Reaper muss rc != 0
- [x] Test 2: `git ls-remote` mit rc=0 + leer → Reaper darf rc=0

### 2. Fix in branch-reaper.sh
- [ ] `git ls-remote` Exit-Code in Variable speichern
- [ ] Bei rc != 0: Fehlermeldung + `exit 1`
- [ ] stderr sichtbar lassen (kein `2>/dev/null` auf ls-remote)

### 3. Verifikation
- [ ] `bats tests/spec/branch-reaper-netzausfall.bats` — alle Tests gruen
- [ ] `bash -n scripts/branch-reaper.sh` — Syntax ok
