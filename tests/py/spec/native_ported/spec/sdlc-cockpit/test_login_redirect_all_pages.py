"""Native migration of tests/spec/sdlc-cockpit/login-redirect-all-pages.bats."""
# (T003746)
# Output verification: the redirect expressions of the !session branches are evaluated with new Function;
# getLoginUrl is a sentinel, buildLoginRedirect is the real function from
# components/website/src/lib/login-redirect.ts (node >= 22 with --experimental-strip-types).

import re

import pytest

GUARD_MJS = r"""
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.argv[2];
const PAGES = join(ROOT, 'components/website/src/pages');

// Echte buildLoginRedirect aus der SSOT (reines TS ohne Imports -> strip-types).
const { buildLoginRedirect } = await import(join(ROOT, 'components/website/src/lib/login-redirect.ts'));

// --- 1. Kandidaten sammeln: .astro unter pages/sdlc mit !session-Gate ---
function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.astro')) acc.push(p);
  }
  return acc;
}
const GATE_RE = /if \(!session[^)]*(?:\([^)]*\))?[^)]*\) return Astro\.redirect\(([^)]+(?:\([^)]*\))?[^)]*)\);/;

const gated = [];
for (const f of walk(join(PAGES, 'sdlc'))) {
  const src = readFileSync(f, 'utf8');
  const m = src.match(GATE_RE);
  if (!m) continue;
  const rel = f.slice(PAGES.length + 1).replace(/\.astro$/, '');
  const route = '/' + rel.replace(/\[[^\]]+\]/g, 'demo-123');
  gated.push({ file: f.slice(ROOT.length + 1), expr: m[1], route });
}
gated.sort((a, b) => a.file.localeCompare(b.file));

// Positiv-Anker (T002356-M1): ohne Kandidatensatz waere der Test vakuos gruen.
if (gated.length < 7) {
  process.stdout.write('FAIL Anker: nur ' + gated.length + ' gated Seiten gefunden, erwartet >= 7\n');
  process.exit(1);
}

// --- 2. returnTo-Pfad gegen pages/ aufloesen ([x].astro fuer dynamische Routen) ---
function pageExists(p) {
  const clean = p.replace(/\?.*$/, '').replace(/\/+$/, '');
  if (clean === '') return false;
  if (existsSync(join(PAGES, clean + '.astro'))) return true;
  if (existsSync(join(PAGES, clean, 'index.astro'))) return true;
  const parent = join(PAGES, dirname(clean));
  if (existsSync(parent)) {
    for (const e of readdirSync(parent)) {
      if (/^\[[^\]]+\]\.astro$/.test(e)) return true;
    }
  }
  return false;
}

// --- 3. Auswerten: getLoginUrl ist im Sandbox-Kontext ein Sentinel ---
const sentinel = (...a) => 'OIDC-DIRECT:' + a.join(',');
const failures = [];
for (const g of gated) {
  const url = new URL('https://sdlc.test' + g.route + '?tab=analytics');
  const expected = url.pathname + url.search;
  let loc;
  try {
    loc = new Function('Astro', 'getLoginUrl', 'buildLoginRedirect', 'return (' + g.expr + ');')({ url }, sentinel, buildLoginRedirect);
  } catch (e) {
    failures.push(g.file + ': EVAL-FEHLER ' + e.message);
    process.stdout.write('FAIL ' + g.file + ' -> EVAL-FEHLER ' + e.message + '\n');
    continue;
  }
  const returnTo = typeof loc === 'string' ? decodeURIComponent(loc.slice('/login?returnTo='.length)) : '';
  const ok = typeof loc === 'string'
    && loc.startsWith('/login?returnTo=')
    && !loc.includes('OIDC-DIRECT:')
    && returnTo === expected
    && pageExists(returnTo);
  if (ok) {
    process.stdout.write('OK ' + g.file + ' -> ' + loc + '\n');
  } else {
    const why = typeof loc !== 'string'
      ? 'Location ist kein String'
      : 'erwartet /login?returnTo=' + encodeURIComponent(expected) + ', ist ' + loc;
    failures.push(g.file + ': ' + why);
    process.stdout.write('FAIL ' + g.file + ' -> ' + loc + ' (' + why + ')\n');
  }
}

process.stdout.write('CHECKED ' + gated.length + '\n');
if (failures.length > 0) {
  process.stdout.write('FAILURES ' + failures.length + '\n');
  process.exit(1);
}
"""


@pytest.fixture
def node22(run_cmd):
    probe = run_cmd(["node", "-e", 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)'])
    if probe.returncode != 0:
        pytest.skip("node < 22 — kein TypeScript-Stripping")


def test_t003746_login_redirect_jede_gated_sdlc_seite_leitet_ueber_login_return_to_um(repo_root, run_cmd, tmp_path, node22):
    helper = tmp_path / "login-redirect-guard.mjs"
    helper.write_text(GUARD_MJS, encoding="utf-8")
    result = run_cmd(["node", "--experimental-strip-types", str(helper), str(repo_root)])
    out = result.output

    # Positiv-Anker: Kandidatensatz nicht leer und es gibt OK-Treffer.
    assert re.search(r"^OK ", out, re.MULTILINE)
    assert re.search(r"^CHECKED [1-9][0-9]*$", out, re.MULTILINE)

    # Kernaussage: keine Seite evaluiert auf eine OIDC-DIRECT:-Sentinel-Location.
    if result.returncode != 0:
        print("SDLC-Login-Redirect-Defekte (T003746):")
        print("\n".join(line for line in out.splitlines() if line.startswith("FAIL ")))
    assert result.returncode == 0
