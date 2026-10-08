"""Native migration of tests/spec/sdlc-cockpit/action-inventory.bats."""

import pytest

PARSE_JS = r"""
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
      headerFound = true;
      headerCount++;
      continue;
    }
    if (headerCount === 1 && line.includes('---')) {
      headerCount++;
      continue;
    }
    headerCount++;
    rows.push(line);
  } else if (headerFound && headerCount >= 2) {
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
    routeFile = repo + '/' + httpPath.replace('/sdlc/', 'components/website/src/pages/sdlc/') + '.ts';
  } else if (httpPath.startsWith('/api/')) {
    routeFile = repo + '/' + httpPath.replace('/api/', 'components/website/src/pages/api/') + '.ts';
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
"""


def _parse(repo_root, run_cmd, tmp_path):
    script = tmp_path / "parse-inventory.cjs"
    script.write_text(PARSE_JS, encoding="utf-8")
    return run_cmd(["node", str(script), str(repo_root), str(repo_root / "docs/sdlc/cockpit-action-inventory.md")])


def test_aktionen_tabelle_hat_mindestens_eine_zeile_positiv_anker(repo_root, run_cmd, tmp_path):
    result = _parse(repo_root, run_cmd, tmp_path)
    assert result.returncode == 0, result.output
    assert any(line.startswith("OK:") for line in result.output.splitlines())


def test_jede_inventur_zeile_traegt_eine_umkehrbarkeitsklasse_und_die_routendatei_existiert(repo_root, run_cmd, tmp_path):
    result = _parse(repo_root, run_cmd, tmp_path)
    assert result.returncode == 0, result.output
    assert any(line.startswith("OK:") for line in result.output.splitlines())
