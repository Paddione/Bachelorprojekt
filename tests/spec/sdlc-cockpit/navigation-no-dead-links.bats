#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/navigation-no-dead-links.bats
# T003737 — Guard: kein SDLC-Navigationsziel endet in 404, keine Redirect-Kette laenger
# als 1 Hop (ADR-006 Routen-Cutover /admin/* -> /sdlc/*, T002624).
#
# SSOT: openspec/changes/fix-sdlc-navigation-redirects/specs/sdlc-cockpit.md
#
# Pruefmodus: Querschnittstest (Ausnahme zu T002448-M4) — die Navigationsziele liegen
# als Literale im Quelltext (href-Attribute, href:-Eintraege in nav-items.ts,
# window.open-/Astro.redirect-Aufrufe), es gibt keine Laufzeit-Kommando-Repraesentation.
# Die ZUSICHERUNG haengt aber an den Aufloesungs-ERGEBNISSEN, nicht an String-
# Vorkommen: gesammelte Ziele werden durch die echte REDIRECT_MAP (geparst aus
# website/src/middleware/redirect-map.ts) aufgeloest und gegen das echte Dateisystem
# unter website/src/pages/ geprueft. Eine Redirect-Kette (Map-Wert ist selbst Map-Key)
# gilt als Defekt. /admin/live (Map-Wert von /admin/stream) ist als vorbestehender
# Defekt ohne SDLC-Bezug bewusst ausgenommen, weil er nicht unter /sdlc/ liegt;
# externe URLs, Anker (#) und der Auth-Guard-Pfad /admin ohne Slash sind kein
# Gegenstand der Pruefung. Dynamische Routen werden ueber das [x].astro-Muster des
# Elternverzeichnisses erkannt (z.B. /sdlc/tickets/<id> -> tickets/[id].astro).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  HELPER="$BATS_TEST_TMPDIR/navigation-check.cjs"

  cat > "$HELPER" <<'EOF'
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.argv[2];
const PAGES = path.join(ROOT, 'website/src/pages');
const MAP_FILE = path.join(ROOT, 'website/src/middleware/redirect-map.ts');
const SOURCES = [
  path.join(ROOT, 'website/src/components/sdlc'),
  path.join(ROOT, 'website/src/pages/sdlc'),
  path.join(ROOT, 'website/src/components/admin/AdminSidebarNav.astro'),
  path.join(ROOT, 'website/src/lib/admin/nav-items.ts'),
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

// href= (HTML), href: (TS-Objekt, nav-items.ts) oder Template-Literal, plus
// window.open(/Astro.redirect( — gefolgt von Quote/Backtick.
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

// --- 3. Aufloesen wie resolveRedirect (middleware.ts): trailing slash abstreifen,
// Map-Hit -> Vollziel, dann Existenz der Seitendatei pruefen. ---
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
  // ${Astro.url.search} haengt nur den Query-String an — resolveRedirect wertet
  // den nie aus (pathname-only), also hier entfernen statt als Pfad zu behandeln.
  // Generische ${...}-Ausdruecke (z.B. ${ticket.parentId}) werden zu <param>.
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
  if (!/^\/sdlc\//.test(val)) continue; // /admin/*-Werte sind keine SDLC-Flaeche
  const r = resolve(val);
  checked.push({ loc: '<redirect-map ' + key + '>', target: val, ok: r.ok, why: r.why || '' });
}
// CLI-Extra-Ziele (Positiv-/Negativ-Anker des Tests) zaehlen mit.
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
EOF
}

@test "T003737 navigation: kein SDLC-Link und kein SDLC-Redirect endet in 404" {
  run node "$HELPER" "$REPO"

  # Positiv-Anker (T002356-M1): die Sammlung ist nicht leer, es gibt OK-Treffer und
  # der bekannte Ankerpfad /sdlc/cockpit (Map-Ziel von /admin/cockpit) ist dabei.
  # Ohne Anker waere ein leerer Lauf (Sammlung kaputt, Map nicht geparst) gruen.
  [ -n "$output" ]
  grep -q '^OK ' <<<"$output"
  grep -qE '^CHECKED [1-9][0-9]+$' <<<"$output"
  grep -qF '/sdlc/cockpit' <<<"$output"

  # Kernaussage: keine toten Ziele. Bei Defekten die Fundstellen ausgeben.
  if [ "$status" -ne 0 ]; then
    echo "Tote Navigationsziele (T003737):" >&3
    grep '^FAIL ' <<<"$output" >&3
  fi
  [ "$status" -eq 0 ]
}

@test "T003737 navigation: Positiv-/Negativ-Anker des Aufloesers" {
  run node "$HELPER" "$REPO" '/sdlc/cockpit' '/sdlc/nicht-da-t003737'

  # Positiv: existierende Seite besteht die Aufloesung.
  grep -q '^OK <arg> /sdlc/cockpit$' <<<"$output"
  # Negativ: synthetisches 404-Ziel faellt durch (Status 1 wegen FAILURES).
  grep -q '^FAIL <arg> /sdlc/nicht-da-t003737' <<<"$output"
  [ "$status" -eq 1 ]
}
