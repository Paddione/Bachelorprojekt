#!/usr/bin/env bats
# tests/spec/website-schema/fk-targets-unique.bats
# Foreign Keys auf bachelorprojekt.features brauchen eine eindeutige Zielspalte [T901103].
#
# Prüfmodus: statische Analyse des Ensure-SQL in der ConfigMap (Querschnittstest auf
# Konfiguration). CI hat kein Postgres. Der Defekt: software_events referenzierte
# features(pr_number) ohne UNIQUE, Postgres lehnte den FK ab, und alles danach im
# Skript (software_events, v_software_*, bachelorprojekt.components) wurde auf Prod
# und Staging nie angelegt.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCHEMA="$REPO_ROOT/k3d/website-schema.yaml"
}

# Gibt den Rumpf eines Skript-Schlüssels der ConfigMap aus.
_script_block() {
  awk -v key="  $1: |" '
    $0 == key {f=1; next}
    f && /^  [A-Za-z0-9_.-]+: [|]/ {exit}
    f {print}
  ' "$SCHEMA"
}

@test "ensure-bachelorprojekt-schema: jede FK-Zielspalte auf features ist id oder UNIQUE" {
  block="$(_script_block ensure-bachelorprojekt-schema.sh)"
  [ -n "$block" ] || { echo "Skript-Schluessel nicht gefunden in $SCHEMA"; return 1; }

  cols="$(printf '%s\n' "$block" | grep -oE 'REFERENCES bachelorprojekt\.features\([a-z_]+\)' | sed -E 's/.*\(([a-z_]+)\)/\1/' | sort -u)"
  # Positiv-Anker: ohne gefundene Referenz wäre der Test vakuos grün.
  [ -n "$cols" ] || { echo "keine REFERENCES bachelorprojekt.features(...) gefunden"; return 1; }

  for col in $cols; do
    [ "$col" = "id" ] && continue
    printf '%s\n' "$block" | grep -qE "bachelorprojekt\.features ADD CONSTRAINT [a-z_]+ UNIQUE \($col\)" \
      || { echo "features($col) wird referenziert, hat aber keinen UNIQUE-Constraint"; return 1; }
  done
}
