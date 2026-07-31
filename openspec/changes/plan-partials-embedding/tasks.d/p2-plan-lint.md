# Partial p2 — Größen-Gate in plan-lint.sh

**Ticket:** T002453
**Rolle:** `plan-lint`
**Ziel-Dateien:** `scripts/plan-lint.sh`
**Abhängigkeiten:** keine

## Ziel

plan-lint.sh erhält einen Check, der fehlschlägt, wenn ein Partial > 7000 Token hat.

## Implementierung

In `scripts/plan-lint.sh`, nach bestehenden Checks, einen neuen Block für das Größen-Gate:

```bash
# [T002453-C] Größen-Gate: Partial > 7000 Token → FAIL
PARTIALS_DIR="${PLAN_DIR}/tasks.d"
if [[ -d "$PARTIALS_DIR" ]]; then
  for partial_file in "$PARTIALS_DIR"/*.md; do
    [[ -f "$partial_file" ]] || continue
    # Token-Schätzung: ceil(Zeichen / 4)
    chars=$(wc -c < "$partial_file")
    tokens=$(( (chars + 3) / 4 ))
    if [[ $tokens -gt 7000 ]]; then
      echo "FAIL [T002453]: $(basename "$partial_file") hat ~${tokens} Token (>7000). Slot zu gross — verkleinern oder aufteilen." >&2
      exit 1
    fi
  done
fi
```

## Abnahmekriterien

1. Ein Partial mit >7000 Token lässt plan-lint mit Exit 1 fehlschlagen
2. Ein Partial mit 6999 Token läuft durch (Exit 0)
3. Ein Plan ohne tasks.d/ wird vom neuen Check nicht berührt
