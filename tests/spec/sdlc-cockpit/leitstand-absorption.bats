#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/leitstand-absorption.bats
# T008017/E5 — Satelliten-Absorption: /sdlc/repohealth, /sdlc/prompts und
# /sdlc/ki-konfiguration leiten ueber die Redirect-Map auf ihr Deck-Ziel; die
# .astro-Seiten existieren nicht mehr; kein /sdlc/cockpit-Ziel der Map traegt
# ein ?tab=-Query (Leitstand-URL-Schema: station/ticket/deck).
#
# SSOT: openspec/specs/sdlc-cockpit.md — "Satellite Absorption Redirects" (E5).
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): Querschnittstest
# (Ausnahme zu T002448-M4) — die Redirect-Semantik ist als Literal in der Map
# manifestiert (die Middleware antwortet 301 aus REDIRECT_MAP; der
# Laufzeit-Nachweis 301+Location gegen den Live-Cluster gehoert dem
# scripts/sdlc-cockpit-smoke.mjs). T1 parst die Map aus der TS-Quelle wie
# navigation-no-dead-links.bats und haengt an den geparsten WERTEN (Exit-Codes),
# T2 prueft das Dateisystem — beide ohne Format-Anker.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cat > "$BATS_TEST_TMPDIR/check-map.mjs" <<'EOF'
import { readFileSync } from 'node:fs';
const [, , mapFile] = process.argv;
const src = readFileSync(mapFile, 'utf8');
const block = src.match(/export const REDIRECT_MAP[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!block) { console.log('FAIL map-block'); process.exit(2); }
const map = {};
const re = /'([^']+)'\s*:\s*'([^']+)'/g;
let m;
while ((m = re.exec(block[1])) !== null) map[m[1]] = m[2];
if (Object.keys(map).length === 0) { console.log('FAIL map-empty'); process.exit(2); }

// 1) Positiv-Anker: die drei Absorptionsziele stehen zeichengenau in der Map.
const expect = {
  '/sdlc/repohealth': '/sdlc/cockpit?deck=qualitaet',
  '/sdlc/prompts': '/sdlc/cockpit?deck=wissen',
  '/sdlc/ki-konfiguration': '/sdlc/cockpit?deck=ki',
};
let bad = 0;
for (const [k, v] of Object.entries(expect)) {
  const ok = map[k] === v;
  console.log((ok ? 'OK ' : 'FAIL ') + 'absorption ' + k + ' -> ' + (map[k] ?? '(fehlt)'));
  if (!ok) bad++;
}

// 2) Negativ (mit Anker): kein Cockpit-Ziel traegt tab=. Eingegrenzt auf die
//    ZIEL-Werte, die auf /sdlc/cockpit zeigen — die /admin/inhalte?tab=...-
//    Ziele sind kein Gegenstand der Pruefung. Leere Kandidatenliste failt
//    ueber den Anker no-cockpit-targets (T002356-M1).
const cockpitTargets = Object.values(map).filter((v) => v.startsWith('/sdlc/cockpit'));
if (cockpitTargets.length === 0) { console.log('FAIL no-cockpit-targets'); process.exit(2); }
for (const v of cockpitTargets) {
  const ok = !v.includes('tab=');
  console.log((ok ? 'OK ' : 'FAIL ') + 'no-tab ' + v);
  if (!ok) bad++;
}

console.log('CHECKED');
process.exit(bad > 0 ? 1 : 0);
EOF
}

# T1 — Absorptionsziele + tab=-Freiheit der Cockpit-Ziele (Positiv-Anker:
# die drei OK-Zeilen; leerer Map-Parse bricht ueber map-block/map-empty).
@test "T1 E5 absorption: drei Absorptionsziele in der Map, kein tab= auf Cockpit-Zielen" {
  run node "$BATS_TEST_TMPDIR/check-map.mjs" \
    "$REPO/components/website/src/middleware/redirect-map.ts"

  [ "$status" -eq 0 ]
  grep -qF 'OK absorption /sdlc/repohealth -> /sdlc/cockpit?deck=qualitaet' <<<"$output"
  grep -qF 'OK absorption /sdlc/prompts -> /sdlc/cockpit?deck=wissen' <<<"$output"
  grep -qF 'OK absorption /sdlc/ki-konfiguration -> /sdlc/cockpit?deck=ki' <<<"$output"
  grep -qF 'OK no-tab ' <<<"$output"
}

# T2 — Negativtest je Datei (T002356-M1: gueltiger Anker zuerst im selben
# Test): das Absorptionsziel cockpit.astro existiert weiter, die drei
# Satelliten-Seiten sind entfernt. Jede Datei einzeln geprueft, damit die
# Kandidatenliste nie leer-trivial besteht.
@test "T2 E5 absorption: Satelliten-.astro-Dateien existieren nicht mehr" {
  [ -f "$REPO/components/website/src/pages/sdlc/cockpit.astro" ]
  for page in repohealth prompts ki-konfiguration; do
    if [ -f "$REPO/components/website/src/pages/sdlc/${page}.astro" ]; then
      echo "FAIL: $page.astro existiert noch" >&3
      return 1
    fi
  done
}
