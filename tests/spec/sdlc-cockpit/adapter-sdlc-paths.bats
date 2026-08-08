#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats
# Prueft, dass jeder website:true-Eintrag im ENDPOINT_MAP eine entsprechende
# Routendatei unter website/src/pages/ hat und kein Eintrag die
# ehemaligen /api/admin/-Pfade verwendet.
#
# SSOT: openspec/changes/cockpit-realtime-push/specs/sdlc-cockpit.md
# (Cockpit sources resolve against the SDLC build target)
#
# Pruefmodus: Datei-Existenz als Erreichbarkeitsbedingung des Astro-Routings,
# nicht Implementierungsmuster. Astro leitet die URL vom Dateipfad ab.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ADAPTER_FILE="$REPO/.lavish/kit/adapter.js"
  EXTRACT_JS="$BATS_TEST_TMPDIR/extract-paths.cjs"
  CHECK_JS="$BATS_TEST_TMPDIR/check-paths.cjs"

  cat > "$EXTRACT_JS" <<'EOF'
const fs = require('node:fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

const mapMatch = src.match(/ENDPOINT_MAP\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\};/s);
if (!mapMatch) { console.log('[]'); process.exit(0); }

const mapBlock = mapMatch[1];
const entries = [];
const lineRe = /'([^']+)'\s*:\s*\{([^}]+)\}/g;
let m;
while ((m = lineRe.exec(mapBlock)) !== null) {
  const key = m[1];
  const body = m[2];
  if (/website\s*:\s*true/.test(body)) {
    const pathMatch = body.match(/path\s*:\s*'([^']+)'/);
    if (pathMatch) {
      entries.push({ key, path: pathMatch[1] });
    }
  }
}

// Fallback: Zeilen-Scan
if (entries.length === 0) {
  for (const line of mapBlock.split('\n')) {
    if (line.includes('website: true') || line.includes('website:true')) {
      const keyMatch = line.match(/'([^']+)'/);
      const pathMatch = line.match(/path\s*:\s*'([^']+)'/);
      if (keyMatch && pathMatch) {
        entries.push({ key: keyMatch[1], path: pathMatch[1] });
      }
    }
  }
}

console.log(JSON.stringify(entries));
EOF

  cat > "$CHECK_JS" <<'EOF'
const fs = require('node:fs');
const repo = process.argv[2];
const entries = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

if (entries.length === 0) {
  console.log('POSITIV-ANKER FEHLER: keine website:true-Eintraege gefunden');
  process.exit(1);
}

let errors = [];
for (const e of entries) {
  const routePath = e.path;
  let filePath;
  if (routePath.startsWith('/sdlc/')) {
    filePath = repo + '/' + routePath.replace('/sdlc/', 'website/src/pages/sdlc/') + '.ts';
  } else if (routePath.startsWith('/api/')) {
    filePath = repo + '/' + routePath.replace('/api/', 'website/src/pages/api/') + '.ts';
  } else {
    errors.push('Unbekannter Pfad-Praefix: ' + e.key + ' -> ' + routePath);
    continue;
  }
  if (!fs.existsSync(filePath)) {
    errors.push('KEINE ROUTENDATEI: ' + e.key + ' -> ' + routePath + ' (gesucht: ' + filePath.replace(repo + '/', '') + ')');
  }
}

if (errors.length > 0) {
  console.log(errors.join('\n'));
  process.exit(1);
}
console.log('OK: ' + entries.length + ' Pfade haben Routendateien');
EOF
}

@test "mindestens ein website:true-Eintrag — Positiv-Anker" {
  run node "$EXTRACT_JS" "$ADAPTER_FILE"
  [ "$status" -eq 0 ]
  count=$(echo "$output" | node -e "process.stdout.write('' + JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).length)")
  [ "$count" -gt 0 ]
}

@test "jeder website:true-Pfad hat eine Routendatei unter website/src/pages" {
  entries=$(node "$EXTRACT_JS" "$ADAPTER_FILE")
  echo "$entries" | node "$CHECK_JS" "$REPO"
  [ "$?" -eq 0 ]
}

@test "kein website:true-Pfad beginnt mit /api/admin/cockpit/" {
  entries=$(node "$EXTRACT_JS" "$ADAPTER_FILE")
  bad=$(echo "$entries" | node -e "
    const entries = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const bad = entries.filter(e => e.path.startsWith('/api/admin/cockpit/'));
    console.log(bad.map(e => e.key + ' -> ' + e.path).join('\n'));
  ")
  [ -z "$bad" ]
}
