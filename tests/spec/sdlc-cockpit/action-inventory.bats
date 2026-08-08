#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/action-inventory.bats
# Prueft die Aktions-Inventur aus docs/sdlc/cockpit-action-inventory.md:
# 1. Positiv-Anker: die Aktionen-Tabelle hat mind. eine Zeile.
# 2. Jede Inventur-Zeile traegt eine Umkehrbarkeitsklasse
#    (reversible | irreversible | repeatable).
# 3. Fuer jede Zeile existiert die Routendatei zur angegebenen
#    HTTP-Pfad-Spalte.
#
# SSOT: openspec/changes/cockpit-realtime-push/specs/sdlc-cockpit.md
# (Reachability of exposed actions is demonstrated, not asserted)
#
# Pruefmodus: Datei-/Struktur-Verifikation — die Aussage "dokumentierte Aktion
# ist erreichbar" manifestiert sich im Astro-Routing (URL → Dateipfad).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  INVENTORY_FILE="$REPO/docs/sdlc/cockpit-action-inventory.md"
  PARSE_JS="$BATS_TEST_TMPDIR/parse-inventory.cjs"

  cat > "$PARSE_JS" <<'EOF'
const fs = require('node:fs');
const repo = process.argv[2];
const invFile = process.argv[3];
const src = fs.readFileSync(invFile, 'utf8');

// Finde die Aktionen-Tabelle (unter "## Aktionen")
const tableStart = src.indexOf('## Aktionen');
if (tableStart === -1) {
  console.log('ERROR: ## Aktionen section not found');
  process.exit(1);
}

// Finde die erste Tabellenzeile nach "## Aktionen" (| Aktion | ...)
const afterHeading = src.slice(tableStart);
const headerMatch = afterHeading.match(/\| Aktion \|/);
if (!headerMatch) {
  console.log('ERROR: action table header not found');
  process.exit(1);
}

// Extrahiere den Tabellenblock: ab Header-Zeile bis zur naechsten nicht-Tabellen-Zeile
const tableBlockStart = tableStart + headerMatch.index;
const rest = src.slice(tableBlockStart);
const lines = rest.split('\n');

let rows = [];
let inTable = false;
let headerFound = false;
let headerCount = 0;

for (const line of lines) {
  if (line.startsWith('|')) {
    if (!headerFound) {
      // erste Zeile ist die Header-Zeile
      headerFound = true;
      headerCount++;
      continue;
    }
    if (headerCount === 1 && line.includes('---')) {
      // Separator-Zeile, ueberspringen
      headerCount++;
      continue;
    }
    // Datenzeile
    headerCount++;
    rows.push(line);
  } else if (headerFound && headerCount >= 2) {
    // Tabelle endet, wenn nach Header+Separator eine Leerzeile kommt
    break;
  } else if (line.trim() === '' && headerCount >= 2) {
    break;
  }
}

if (rows.length === 0) {
  console.log('POSITIV-ANKER FEHLER: Keine Datenzeilen in der Aktionen-Tabelle');
  process.exit(1);
}

let errors = [];

for (let i = 0; i < rows.length; i++) {
  const cols = rows[i].split('|').map(c => c.trim()).filter(c => c !== '');
  if (cols.length < 5) {
    errors.push('Zeile ' + (i + 1) + ': Weniger als 5 Spalten (brauche: Aktion, Pfad, Methode, Klasse, Audit)');
    continue;
  }

  const action = cols[0].replace(/`/g, '');
  const httpPath = cols[1].replace(/`/g, '');
  const method = cols[2].replace(/`/g, '');
  const reversibility = cols[3].replace(/`/g, '');
  const audit = cols[4].replace(/`/g, '');

  // Pruefung 1: Umkehrbarkeitsklasse muss vorhanden sein
  const validClasses = ['reversible', 'irreversible', 'repeatable'];
  if (!validClasses.includes(reversibility)) {
    errors.push(action + ': fehlende oder unbekannte Umkehrbarkeitsklasse "' + reversibility + '"');
  }

  // Pruefung 2: Routendatei existiert
  let routeFile;
  if (httpPath.startsWith('/sdlc/')) {
    routeFile = repo + '/' + httpPath.replace('/sdlc/', 'website/src/pages/sdlc/') + '.ts';
  } else if (httpPath.startsWith('/api/')) {
    routeFile = repo + '/' + httpPath.replace('/api/', 'website/src/pages/api/') + '.ts';
  } else {
    errors.push(action + ': Unbekannter Pfad-Praefix: ' + httpPath);
    continue;
  }
  if (!fs.existsSync(routeFile)) {
    errors.push(action + ': KEINE ROUTENDATEI: ' + routeFile.replace(repo + '/', ''));
  }
}

if (errors.length > 0) {
  console.log(errors.join('\n'));
  process.exit(1);
}

console.log('OK: ' + rows.length + ' Aktionen, alle Routendateien vorhanden, alle Klassen gesetzt');
EOF
}

@test "Aktionen-Tabelle hat mindestens eine Zeile — Positiv-Anker" {
  run node "$PARSE_JS" "$REPO" "$INVENTORY_FILE"
  echo "$output" | grep -v 'POSITIV-ANKER FEHLER' > /dev/null
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '^OK:'
}

@test "jede Inventur-Zeile traegt eine Umkehrbarkeitsklasse und die Routendatei existiert" {
  run node "$PARSE_JS" "$REPO" "$INVENTORY_FILE"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '^OK:'
}
