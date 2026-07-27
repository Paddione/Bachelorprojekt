#!/usr/bin/env bats
# flux-render-runtime-vars.bats — T002306
#
# scripts/flux-render-artifact.sh baut seine envsubst-Allowlist dynamisch aus
# dem gerenderten Manifest: jede ${VAR}-Referenz landet automatisch darin.
# Der Regex sah dabei durch ein vorangestelltes $$ hindurch — eine bewusst als
# $${VAR} geschriebene LAUFZEIT-Variable nahm sich also selbst in ihre eigene
# Ersetzungsliste auf. envsubst machte aus der nicht gesetzten Variable "" und
# uebrig blieb das erste Dollarzeichen.
#
# Live-Folge am 2026-07-27: aus
#   ALTER USER nextcloud WITH PASSWORD '$${NEXTCLOUD_DB_PASSWORD}';
# wurde  ... PASSWORD '$';  — nextcloud, vaultwarden, videovault und pocket_id
# waren aus ihrer eigenen Datenbank ausgesperrt, SSO plattformweit down.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
RENDERER="$PROJECT_DIR/scripts/flux-render-artifact.sh"

@test "T002306: renderer filters \$\${VAR} out of the envsubst allowlist" {
  run grep -c 'runtime_vars' "$RENDERER"
  [[ "$output" -ge 3 ]]
}

@test "T002306: fail-closed check exempts declared runtime vars" {
  # Der Check darf ${VAR} nicht mehr pauschal als Fehler werten — sonst
  # scheitert jeder Build, der eine Laufzeit-Variable enthaelt.
  run grep -c 'leftover' "$RENDERER"
  [[ "$output" -ge 4 ]]
}

@test "T002306: \$\${VAR} survives rendering, \${VAR} is still substituted" {
  # Bildet die Render-Pipeline exakt nach: Allowlist-Extraktion, Filter,
  # envsubst, Unwrapping.
  local rendered='a: "$${ARCH}"
b: "${SUBSTITUTE_ME}"
c: "$$BIN"'
  export SUBSTITUTE_ME="ersetzt"

  local vars runtime_vars rv ev out
  vars="$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$rendered" | tr -d '${}' | sort -u | tr '\n' ' ')"
  runtime_vars="$(grep -oE '\$\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$rendered" | sed -E 's/^\$\$\{//; s/\}$//' | sort -u | tr '\n' ' ')"
  for rv in $runtime_vars; do
    vars="$(tr ' ' '\n' <<<"$vars" | sed "/^${rv}\$/d;/^\$/d" | tr '\n' ' ')"
  done
  ev=""; for rv in $vars; do ev="${ev}\$${rv} "; done
  out="$(envsubst "$ev" <<<"$rendered" | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g')"

  # Laufzeit-Variable ueberlebt als ${ARCH} — NICHT als "$" oder leer.
  [[ "$out" == *'a: "${ARCH}"'* ]]
  # Build-Zeit-Substitution funktioniert weiterhin.
  [[ "$out" == *'b: "ersetzt"'* ]]
  # Klammerlose Form war nie betroffen und bleibt korrekt.
  [[ "$out" == *'c: "$BIN"'* ]]
}

@test "T002306: shared-db keeps its runtime password placeholders" {
  # Regressionsschutz fuer die Stelle, die den Ausfall ausgeloest hat.
  run grep -c 'PASSWORD .\$\${[A-Z_]*_DB_PASSWORD}' "$PROJECT_DIR/k3d/shared-db.yaml"
  [[ "$output" -ge 4 ]]
}
