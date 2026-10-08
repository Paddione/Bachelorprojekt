"""Native migration of tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats."""

import json
import subprocess
from types import SimpleNamespace

EXTRACT_JS = r"""
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
"""

CHECK_JS = r"""
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
  // T003277: Ein Pfad, der auf '/' endet, ist ein PRAEFIX — der Adapter haengt
  // zur Laufzeit eine id an. Dahinter steht eine dynamische Astro-Route '[…].ts'.
  const isDynamicPrefix = routePath.endsWith('/');
  const bare = isDynamicPrefix ? routePath.slice(0, -1) : routePath;
  let base;
  if (bare.startsWith('/sdlc/')) {
    base = repo + '/' + bare.replace('/sdlc/', 'components/website/src/pages/sdlc/');
  } else if (bare.startsWith('/api/')) {
    base = repo + '/' + bare.replace('/api/', 'components/website/src/pages/api/');
  } else {
    errors.push('Unbekannter Pfad-Praefix: ' + e.key + ' -> ' + routePath);
    continue;
  }

  if (isDynamicPrefix) {
    // Das Verzeichnis muss existieren UND mindestens eine dynamische Route enthalten.
    const dynamic = fs.existsSync(base) && fs.statSync(base).isDirectory()
      ? fs.readdirSync(base).filter(f => /^\[.+\]\.ts$/.test(f))
      : [];
    if (dynamic.length === 0) {
      errors.push('KEINE DYNAMISCHE ROUTE: ' + e.key + ' -> ' + routePath
        + ' (gesucht: ' + base.replace(repo + '/', '') + '/[…].ts)');
    }
    continue;
  }

  const filePath = base + '.ts';
  if (!fs.existsSync(filePath)) {
    errors.push('KEINE ROUTENDATEI: ' + e.key + ' -> ' + routePath + ' (gesucht: ' + filePath.replace(repo + '/', '') + ')');
  }
}

if (errors.length > 0) {
  console.log(errors.join('\n'));
  process.exit(1);
}
console.log('OK: ' + entries.length + ' Pfade haben Routendateien');
"""


def _node(script_path, args, stdin_text=None):
    proc = subprocess.run(
        ["node", str(script_path), *args],
        input=stdin_text, capture_output=True, text=True, timeout=60,
    )
    out = proc.stdout
    if proc.stderr:
        out = f"{proc.stdout}\n{proc.stderr}".strip()
    return SimpleNamespace(returncode=proc.returncode, stdout=proc.stdout, output=out.strip())


def _extract(repo_root, tmp_path):
    script = tmp_path / "extract-paths.cjs"
    script.write_text(EXTRACT_JS, encoding="utf-8")
    return _node(script, [str(repo_root / ".lavish/kit/adapter.js")])


def _check(repo_root, tmp_path, entries_json):
    script = tmp_path / "check-paths.cjs"
    script.write_text(CHECK_JS, encoding="utf-8")
    return _node(script, [str(repo_root)], stdin_text=entries_json)


def test_mindestens_ein_website_true_eintrag_positiv_anker(repo_root, tmp_path):
    result = _extract(repo_root, tmp_path)
    assert result.returncode == 0, result.output
    assert len(json.loads(result.stdout)) > 0


def test_jeder_website_true_pfad_hat_eine_routendatei_unter_components_website_src_pages(repo_root, tmp_path):
    extracted = _extract(repo_root, tmp_path)
    result = _check(repo_root, tmp_path, extracted.stdout)
    assert result.returncode == 0, result.output


def test_kein_website_true_pfad_beginnt_mit_api_admin_cockpit(repo_root, tmp_path):
    extracted = _extract(repo_root, tmp_path)
    entries = json.loads(extracted.stdout)
    bad = [f"{e['key']} -> {e['path']}" for e in entries if e["path"].startswith("/api/admin/cockpit/")]
    assert bad == []
