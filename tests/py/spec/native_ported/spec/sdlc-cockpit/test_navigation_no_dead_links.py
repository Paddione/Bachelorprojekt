"""Native migration of tests/spec/sdlc-cockpit/navigation-no-dead-links.bats."""
# (T003737)
# Querschnittstest: navigation targets are collected from source literals, resolved against the real
# REDIRECT_MAP (parsed from redirect-map.ts) and checked against the real page files. The resolver runs
# in node (embedded CJS helper, same as the original).

import re

import pytest

HELPER_CJS = r"""
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.argv[2];
const PAGES = path.join(ROOT, 'components/website/src/pages');
const MAP_FILE = path.join(ROOT, 'components/website/src/middleware/redirect-map.ts');
const SOURCES = [
  path.join(ROOT, 'components/website/src/components/sdlc'),
  path.join(ROOT, 'components/website/src/pages/sdlc'),
  path.join(ROOT, 'components/website/src/components/admin/AdminSidebarNav.astro'),
  path.join(ROOT, 'components/website/src/lib/admin/nav-items.ts'),
];

// --- 1. REDIRECT_MAP aus der TS-Quelle parsen (SSOT, kein Duplikat) ---
const mapSrc = fs.readFileSync(MAP_FILE, 'utf8');
const mapBlock = mapSrc.match(/export const REDIRECT_MAP[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!mapBlock) { console.error('ERROR: REDIRECT_MAP-Block nicht gefunden'); process.exit(2); }
const redirectMap = {};
const entryRe = /'([^']+)'\s*:\s*'([^']+)'/g;
let m;
while ((m = entryRe.exec(mapBlock[1])) !== null) redirectMap[m[1]] = m[2];
if (Object.keys(redirectMap).length < 30) {
  console.error('ERROR: REDIRECT_MAP unerwartet klein (' + Object.keys(redirectMap).length + ' Eintraege)');
  process.exit(2);
}

// --- 2. Ziele aus dem SDLC-Quelltext sammeln ---
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(astro|svelte|ts|tsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}
const files = [...walk(SOURCES[0]), ...walk(SOURCES[1]), SOURCES[2], SOURCES[3]]
  .filter(fs.existsSync);

const hrefRe = /(?:href[:=]\{?|window\.open\(|Astro\.redirect\()["'`]([^"'`]*)/g;
const collected = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    hrefRe.lastIndex = 0;
    let mm;
    while ((mm = hrefRe.exec(line)) !== null) {
      collected.push({ loc: path.relative(ROOT, f) + ':' + (i + 1), target: mm[1] });
    }
  });
}

// --- 3. Aufloesen wie resolveRedirect (middleware.ts) ---
function pageExists(p) {
  const clean = p.replace(/\?.*$/, '').replace(/\/+$/, '');
  if (clean === '') return false;
  if (fs.existsSync(path.join(PAGES, clean + '.astro'))) return true;
  if (fs.existsSync(path.join(PAGES, clean, 'index.astro'))) return true;
  const parent = path.join(PAGES, path.dirname(clean));
  if (fs.existsSync(parent)) {
    for (const e of fs.readdirSync(parent)) {
      if (/^\[[^\]]+\]\.astro$/.test(e)) return true; // dynamische Route [x].astro
    }
  }
  return false;
}

function resolve(target) {
  let p = target.replace(/\$\{Astro\.url\.search\}/g, '').replace(/\$\{[^}]*\}/g, '<param>');
  p = p.replace(/\?.*$/, '').replace(/\/+$/, '');
  if (Object.prototype.hasOwnProperty.call(redirectMap, p)) {
    const v = redirectMap[p];
    const vPath = v.replace(/\?.*$/, '').replace(/\/+$/, '');
    if (Object.prototype.hasOwnProperty.call(redirectMap, vPath)) {
      return { ok: false, why: 'CHAIN ' + p + ' -> ' + v };
    }
    p = vPath;
  }
  return pageExists(p) ? { ok: true } : { ok: false, why: '404 ' + p };
}

// --- 4. Pruefen: gesammelte /admin|sdlc/-Ziele + Map-Werte unter /sdlc/ ---
const checked = [];
for (const { loc, target } of collected) {
  if (!/^\/(admin|sdlc)\//.test(target)) continue;
  const r = resolve(target);
  checked.push({ loc: loc, target: target, ok: r.ok, why: r.why || '' });
}
for (const [key, val] of Object.entries(redirectMap)) {
  if (!/^\/sdlc\//.test(val)) continue;
  const r = resolve(val);
  checked.push({ loc: '<redirect-map ' + key + '>', target: val, ok: r.ok, why: r.why || '' });
}
for (const arg of process.argv.slice(3)) {
  const r = resolve(arg);
  checked.push({ loc: '<arg>', target: arg, ok: r.ok, why: r.why || '' });
}

const failures = checked.filter((c) => !c.ok);
for (const c of checked) {
  process.stdout.write((c.ok ? 'OK ' : 'FAIL ') + c.loc + ' ' + c.target + (c.ok ? '' : ' -> ' + c.why) + '\n');
}
process.stdout.write('CHECKED ' + checked.length + '\n');
if (failures.length > 0) {
  process.stdout.write('FAILURES ' + failures.length + '\n');
  process.exit(1);
}
"""


def _helper(repo_root, run_cmd, tmp_path, *extra):
    script = tmp_path / "navigation-check.cjs"
    script.write_text(HELPER_CJS, encoding="utf-8")
    return run_cmd(["node", str(script), str(repo_root), *extra])


def test_t003737_navigation_kein_sdlc_link_und_kein_sdlc_redirect_endet_in_404(repo_root, run_cmd, tmp_path):
    result = _helper(repo_root, run_cmd, tmp_path)
    out = result.output

    # Positiv-Anker: Sammlung nicht leer, OK-Treffer vorhanden, /sdlc/cockpit dabei.
    assert out != ""
    assert re.search(r"^OK ", out, re.MULTILINE)
    assert re.search(r"^CHECKED [1-9][0-9]+$", out, re.MULTILINE)
    assert "/sdlc/cockpit" in out

    # Kernaussage: keine toten Ziele.
    if result.returncode != 0:
        print("Tote Navigationsziele (T003737):")
        print("\n".join(line for line in out.splitlines() if line.startswith("FAIL ")))
    assert result.returncode == 0


def test_t003737_navigation_positiv_negativ_anker_des_aufloesers(repo_root, run_cmd, tmp_path):
    result = _helper(repo_root, run_cmd, tmp_path, "/sdlc/cockpit", "/sdlc/nicht-da-t003737")
    out = result.output.splitlines()

    # Positiv: existierende Seite besteht die Aufloesung.
    assert "OK <arg> /sdlc/cockpit" in out
    # Negativ: synthetisches 404-Ziel faellt durch.
    assert any(line.startswith("FAIL <arg> /sdlc/nicht-da-t003737") for line in out)
    assert result.returncode == 1
