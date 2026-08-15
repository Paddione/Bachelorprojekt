#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats
# SSOT: openspec/specs/sdlc-cockpit.md — E3-Leitstand-Shell [T007957], Kontrakt A
# (purpose-Registry: Shape `{ zweck, datenquelle, aktionen[] }`, Key-Ableitung
# PascalCase→kebab-case des Datei-Basenamens, `leitstand-`-Praefix-Strip NUR fuer
# Dateien direkt unter components/leitstand/).
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): OUTPUT-Verifikation — die Datei
# importiert leitstand-purpose-registry.ts per `node --experimental-strip-types` und
# wertet die REALEN Rueckgabewerte aus (kein grep auf den p1-Quelltext).

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cat > "$BATS_TEST_TMPDIR/check-registry.mjs" <<'EOF'
import { readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
const [, , registryPath, componentsDir] = process.argv;
const { leitstandPurposes } = await import(registryPath);
const entries = Object.entries(leitstandPurposes ?? {});
if (entries.length === 0) { console.log('FAIL empty-registry'); process.exit(1); }
console.log('OK registry-nonempty ' + entries.length);

const zwecke = entries.map(([, v]) => v.zweck);
const dupes = zwecke.filter((z, i) => zwecke.indexOf(z) !== i);
if (dupes.length > 0) { console.log('FAIL zweck-duplicate ' + dupes.join(',')); process.exit(1); }
console.log('OK zweck-unique ' + zwecke.length);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc); else if (ent.name.endsWith('.svelte')) acc.push(p);
  }
  return acc;
}
function toKey(rel) {
  const base = rel.split('/').pop().replace(/\.svelte$/, '');
  const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return (!rel.includes('/') && kebab.startsWith('leitstand-')) ? kebab.slice(10) : kebab;
}
const files = walk(componentsDir).map((f) => relative(componentsDir, f));
if (files.length === 0) { console.log('FAIL no-components-found ' + componentsDir); process.exit(1); }
console.log('OK components-found ' + files.length);
const missing = files.filter((f) => !(toKey(f) in leitstandPurposes));
if (missing.length > 0) { console.log('FAIL missing-entries ' + missing.map(toKey).join(',')); process.exit(1); }
console.log('OK all-components-covered ' + files.length);
EOF
}

# T1 — Registry ist nicht leer, `zweck` ist einzigartig, jede reale
# components/leitstand/**/*.svelte hat einen Eintrag (Positiv-Anker: alle drei OK-Zeilen).
@test "T1 purpose-Registry: nicht leer, zweck eindeutig, alle Leitstand-Komponenten abgedeckt" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  node -e 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
    || skip "node < 22 — kein TypeScript-Stripping"

  run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-registry.mjs" \
    "$REPO/components/website/src/lib/sdlc/leitstand-purpose-registry.ts" \
    "$REPO/components/website/src/components/leitstand"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '^OK registry-nonempty [1-9][0-9]*'
  echo "$output" | grep -qE '^OK zweck-unique [1-9][0-9]*'
  echo "$output" | grep -qE '^OK all-components-covered [1-9][0-9]*'
}

# T2 — Guard schlaegt an, wenn eine Komponente ohne Eintrag eingeschleust wird
# [Negativtest + Positiv-Anker, T002356-M1: gueltiger Fixture-Fall zuerst im selben Test].
@test "T2 Guard faengt eine Komponente ohne Registry-Eintrag" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  node -e 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
    || skip "node < 22 — kein TypeScript-Stripping"

  fx="$BATS_TEST_TMPDIR/fixture-components"
  mkdir -p "$fx/decks"
  : > "$fx/Kontextzone.svelte"
  : > "$fx/decks/DeckWissen.svelte"
  cat > "$BATS_TEST_TMPDIR/fixture-registry.mjs" <<'EOF'
export const leitstandPurposes = {
  kontextzone: { zweck: 'Tiefe/Aktion folgt Selektion', datenquelle: 'floorStore', aktionen: [] },
};
EOF
  # Positiv-Fall: Fixture mit vollstaendiger Registry laeuft durch.
  cat > "$BATS_TEST_TMPDIR/fixture-registry-complete.mjs" <<'EOF'
export const leitstandPurposes = {
  kontextzone: { zweck: 'Tiefe/Aktion folgt Selektion', datenquelle: 'floorStore', aktionen: [] },
  'deck-wissen': { zweck: 'API-Katalog + OpenSpec-Suche', datenquelle: 'api-inventory', aktionen: [] },
};
EOF
  run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-registry.mjs" \
    "$BATS_TEST_TMPDIR/fixture-registry-complete.mjs" "$fx"
  [ "$status" -eq 0 ]
  # Negativ: unvollstaendige Fixture-Registry faellt benannt durch.
  run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-registry.mjs" \
    "$BATS_TEST_TMPDIR/fixture-registry.mjs" "$fx"
  [ "$status" -eq 1 ]
  echo "$output" | grep -qF 'FAIL missing-entries deck-wissen'
}
