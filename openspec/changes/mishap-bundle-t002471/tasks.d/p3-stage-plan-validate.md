# Partial p3 — stage-plan plan_ref validation

**Ticket:** T002471
**Rolle:** `stage-plan`
**Ziel-Dateien:** `scripts/ticket.sh`
**Mishap:** M6 (stage-plan akzeptiert plan_ref auf nicht-existente Datei)

## Mishap 6

`scripts/ticket.sh stage-plan` setzt status=plan_staged mit einem plan_ref auf eine Datei,
die im Git-Tree des Branches nicht existiert (nur im Staging-Bereich).

## Fix

In der stage-plan Funktion, NACH dem Schreiben des plan_ref und VOR dem Status-Update,
einen Guard einbauen, der prüft, ob die referenzierte Plan-Datei wirklich existiert:

```bash
# === T002471-M6: plan_ref validation ===
if [[ -n "${plan_file:-}" ]]; then
  if ! git ls-tree -r --name-only HEAD 2>/dev/null | grep -qxF "$plan_file"; then
    echo "ERROR: plan_file '$plan_file' existiert nicht im Git-Tree von HEAD" >&2
    echo "  Die Datei muss committed sein, bevor stage-plan sie referenzieren kann." >&2
    exit 4
  fi
fi
# === Ende T002471-M6 ===
```

Finde in scripts/ticket.sh die `cmd_stage_plan` Funktion und füge den Guard ein.
