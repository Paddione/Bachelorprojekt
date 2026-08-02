# Design: plan-intel.sh --out Merge-Fix

## Problem

`scripts/plan-intel.sh` Zeilen 46–54 und 183 lesen den Merge-Bestand aus `$CHANGE_DIR` (`openspec/changes/<slug>/`), auch wenn `--out` auf ein anderes Verzeichnis zeigt. Dadurch wird der falsche `intel.json`-Stand (mit `api_contracts`, `external_types`, `risks`) in den Merge übernommen.

## Fix

### Zeile 46: EXISTING_INTEL

```bash
# Vorher:
EXISTING_INTEL="$CHANGE_DIR/intel.json"

# Nachher:
if [[ -n "${OUT_PATH:-}" && "$OUT_PATH" != "$CHANGE_DIR/intel.json" ]]; then
  EXISTING_INTEL="${OUT_PATH}"
else
  EXISTING_INTEL="$CHANGE_DIR/intel.json"
fi
```

**Begründung:** Wenn `--out` gesetzt ist und vom Default abweicht, ist das die Merge-Quelle. Der `--out`-Pfad ist bereits die vollständige Ausgabedatei; die existierende `intel.json` liegt im selben Verzeichnis (der Merge schreibt dorthin, also ist dort auch der vorherige Stand). Fallback auf `$CHANGE_DIR/intel.json` erhält das bestehende Verhalten ohne `--out`.

### Zeile 183: .ticket

```bash
# Vorher:
TICKET_ID="$(cat "$CHANGE_DIR/.ticket" 2>/dev/null || echo "")"

# Nachher:
TICKET_FILE=""
if [[ -n "${OUT_PATH:-}" && "$OUT_PATH" != "$CHANGE_DIR/intel.json" ]]; then
  TICKET_FILE="$(dirname "$OUT_PATH")/.ticket"
  [[ -f "$TICKET_FILE" ]] || TICKET_FILE=""
fi
TICKET_ID="$(cat "${TICKET_FILE:-$CHANGE_DIR/.ticket}" 2>/dev/null || echo "")"
```

**Begründung:** Analog zu Zeile 46: aus dem `--out`-Verzeichnis lesen, Fallback auf `$CHANGE_DIR`.

## Test-Ergänzung

In `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats`:

1. Neuer Test: `--out`-Merge-Integration — legt `intel.json` mit bekanntem `api_contracts`-Wert im `--out`-Verzeichnis an, führt `plan-intel.sh` mit `--out` aus, prüft dass der Wert übernommen wurde
2. Neuer Test: `--out` mit `.ticket` — legt `.ticket` im `--out`-Verzeichnis an, prüft dass die Ticket-ID korrekt gelesen wird

## Keine Regression

- Ohne `--out` verhält sich das Skript identisch (Fallback auf `$CHANGE_DIR`)
- Die `OUT_PATH`-Default-Logik (Zeile 43) bleibt unverändert
- Aufrufer (`openspec-archive-change`, `dev-flow-execute`, BATS) verwenden `--out` bereits — sie profitieren sofort vom Fix
