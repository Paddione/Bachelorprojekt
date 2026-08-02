# Partial p2 — Zeile 183: .ticket aus --out lesen + BATS-Test

## Scope
Fix in `scripts/plan-intel.sh` Zeile 183 + BATS-Test in `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats`.

## Task List

- [ ] **2.1** Zeile 183 ändern: `.ticket` aus `$(dirname "$OUT_PATH")/.ticket` lesen wenn `--out` gesetzt und vom Default abweicht; Fallback `$CHANGE_DIR/.ticket`
- [ ] **2.2** BATS-Test: `--out`-Merge-Integration — legt `intel.json` mit bekanntem `api_contracts`-Wert im `--out`-Verzeichnis an, führt `plan-intel.sh` mit `--out` aus, prüft Übernahme
- [ ] **2.3** BATS-Test: `--out` mit `.ticket` — legt `.ticket` im `--out`-Verzeichnis an, prüft korrekte Ticket-ID

## Verification
```bash
task test:changed
bash tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats
```
