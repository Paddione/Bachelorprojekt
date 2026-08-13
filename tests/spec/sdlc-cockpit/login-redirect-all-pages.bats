#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/login-redirect-all-pages.bats
# T003746 — Guard: jede SDLC-Seite mit !session-Gate leitet unauthentifizierte
# Aufrufe ueber /login?returnTo=... um (buildLoginRedirect), nicht direkt zum
# OIDC-Provider (getLoginUrl). Vor dem Ticket gingen bei 8 von 10 gated Seiten
# pathname + search (returnTo) verloren; cockpit.astro und app-catalog.astro
# waren bereits korrekt.
#
# SSOT: openspec/specs/sdlc-cockpit.md
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Der Guard sammelt die gated
# Seiten zwar per Regex aus dem Quelltext, aber die ZUSICHERUNG haengt an den
# AUSGEWERTETEN Ergebnissen: die Redirect-Ausdruecke der !session-Zweige werden
# mit new Function evaluiert — getLoginUrl ist im Sandbox-Kontext ein Sentinel,
# der 'OIDC-DIRECT:' + Argumente zurueckgibt, buildLoginRedirect wird echt aus
# website/src/lib/login-redirect.ts importiert (reines TS ohne Imports, laeuft
# unter --experimental-strip-types, node >= 22.6; CI test-bats: node 22).
# Ein direkter OIDC-Redirect faellt damit als evaluierte Location durch, nicht
# als String-Fund im Quelltext.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  HELPER="$BATS_TEST_TMPDIR/login-redirect-guard.mjs"

  cat > "$HELPER" <<'EOF'
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.argv[2];
const PAGES = join(ROOT, 'website/src/pages');

// Echte buildLoginRedirect aus der SSOT (reines TS ohne Imports -> strip-types).
const { buildLoginRedirect } = await import(join(ROOT, 'website/src/lib/login-redirect.ts'));

// --- 1. Kandidaten sammeln: .astro unter pages/sdlc mit !session-Gate ---
function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.astro')) acc.push(p);
  }
  return acc;
}
// Erste !session-Zeile: Bedingung (auch Verbund wie `!session || !isAdmin(...)`)
// plus der vollstaendige Redirect-Ausdruck. Matcht alle gated Seiten.
const GATE_RE = /if \(!session[^)]*(?:\([^)]*\))?[^)]*\) return Astro\.redirect\(([^)]+(?:\([^)]*\))?[^)]*)\);/;

const gated = [];
for (const f of walk(join(PAGES, 'sdlc'))) {
  const src = readFileSync(f, 'utf8');
  const m = src.match(GATE_RE);
  if (!m) continue;
  // Route relativ zu pages/ ableiten — der relative Pfad enthaelt sdlc/ bereits.
  // Dynamische Segmente ([id]) werden zu Beispiel-Werten (demo-123).
  const rel = f.slice(PAGES.length + 1).replace(/\.astro$/, '');
  const route = '/' + rel.replace(/\[[^\]]+\]/g, 'demo-123');
  gated.push({ file: f.slice(ROOT.length + 1), expr: m[1], route });
}
gated.sort((a, b) => a.file.localeCompare(b.file));

// Positiv-Anker (T002356-M1): ohne Kandidatensatz waere der Test vakuos gruen.
if (gated.length < 10) {
  process.stdout.write('FAIL Anker: nur ' + gated.length + ' gated Seiten gefunden, erwartet >= 10\n');
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
EOF
}

@test "T003746 login-redirect: jede gated SDLC-Seite leitet ueber /login?returnTo um" {
  run node --experimental-strip-types "$HELPER" "$REPO"

  # Positiv-Anker (T002356-M1): der Kandidatensatz ist nicht leer und es gibt
  # OK-Treffer — ein leerer Lauf (Extraktion kaputt) ist nicht gruen.
  grep -qE '^OK ' <<<"$output"
  grep -qE '^CHECKED (10|[1-9][0-9]+)$' <<<"$output"

  # Kernaussage: keine Seite evaluiert auf eine OIDC-DIRECT:-Sentinel-Location.
  if [ "$status" -ne 0 ]; then
    echo "SDLC-Login-Redirect-Defekte (T003746):" >&3
    grep '^FAIL ' <<<"$output" >&3
  fi
  [ "$status" -eq 0 ]
}
