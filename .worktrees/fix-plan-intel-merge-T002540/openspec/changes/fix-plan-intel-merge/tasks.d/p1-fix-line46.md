# Partial p1 — Zeile 46: EXISTING_INTEL aus --out lesen

## Scope
Fix in `scripts/plan-intel.sh` Zeile 46: `EXISTING_INTEL` aus `$OUT_PATH` ableiten statt aus `$CHANGE_DIR`.

## Task List

- [ ] **1.1** Zeile 46 ändern: wenn `--out` vom Default (`$CHANGE_DIR/intel.json`) abweicht, `$OUT_PATH` als `EXISTING_INTEL` verwenden; sonst Fallback `$CHANGE_DIR/intel.json`
- [ ] **1.2** Manuell testen: `plan-intel.sh test-slug --out /tmp/merge-out/intel.json` — mit und ohne existierende `intel.json` im `--out`-Verzeichnis

## Verification
```bash
bash -n scripts/plan-intel.sh   # Syntax-Check
bash scripts/plan-intel.sh test-slug --target-files scripts/plan-intel.sh --out /tmp/test-out.json
# Prüft: intel.json wird aus /tmp gelesen, nicht aus openspec/changes/test-slug/
```
