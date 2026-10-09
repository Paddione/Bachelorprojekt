#!/usr/bin/env bash
# Fail-closed Lizenz-Policy-Checker für T901032.
# Prüft Manifest-Schema, exakte Versionen, AGPL/GPL-Denylist,
# NOTICE-Abdeckung und Policy-Anker. Erfolg: `license-check: PASS` auf stdout.
# Eingabepfade sind per Env überstimmbar (MANIFEST, NOTICE, POLICY) —
# die Negativprobe der Spec-Guards nutzt das für ein vergiftetes Manifest.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="${MANIFEST:-$ROOT/docs/legal/third-party-manifest.json}"
NOTICE="${NOTICE:-$ROOT/docs/legal/NOTICE.md}"
POLICY="${POLICY:-$ROOT/docs/legal/reuse-policy.md}"

fail() {
  echo "license-check: FAIL: $1" >&2
  exit 1
}

[ -f "$MANIFEST" ] || fail "Manifest fehlt: $MANIFEST"
[ -f "$NOTICE" ] || fail "NOTICE fehlt: $NOTICE"
[ -f "$POLICY" ] || fail "Policy fehlt: $POLICY"
command -v jq >/dev/null 2>&1 || fail "jq ist nicht installiert"

# 1. Manifest parst.
jq empty "$MANIFEST" 2>/dev/null || fail "Manifest parst nicht als JSON"

# 2. Jeder Eintrag hat nicht-leere name, version, source, license.
jq -e '.components | type == "array" and length > 0' "$MANIFEST" >/dev/null \
  || fail "Manifest enthaelt keine .components-Liste"
jq -e '[.components[]
        | select((.name // "") == ""
            or (.version // "") == ""
            or (.source // "") == ""
            or (.license // "") == "")] | length == 0' "$MANIFEST" >/dev/null \
  || fail "Manifest-Eintrag mit leerem name/version/source/license"

# 3. Keine version ist ein Range oder 'latest'.
if jq -r '.components[].version' "$MANIFEST" | grep -E '\^|~|latest' >/dev/null; then
  fail "Manifest enthaelt nicht exakt gepinnte Version (^, ~ oder latest)"
fi

# 4. Denylist: keine Lizenz der AGPL/GPL-Familie im Manifest.
if jq -r '.components[].license' "$MANIFEST" | grep -i -E 'AGPL|GPL' >/dev/null; then
  fail "Manifest enthaelt Lizenz der AGPL/GPL-Familie (Denylist)"
fi

# 5. Jeder Manifest-name kommt in NOTICE vor.
while IFS= read -r name; do
  [ -n "$name" ] || fail "Manifest enthaelt leeren Komponenten-Namen"
  grep -q -F "$name" "$NOTICE" \
    || fail "Komponente '$name' fehlt in NOTICE"
done < <(jq -r '.components[].name' "$MANIFEST")

# 6. Die Policy enthaelt alle Anker RP-1 bis RP-7.
for anchor in RP-1 RP-2 RP-3 RP-4 RP-5 RP-6 RP-7; do
  grep -q -F "$anchor" "$POLICY" \
    || fail "Policy-Anker $anchor fehlt in $POLICY"
done

echo "license-check: PASS"
