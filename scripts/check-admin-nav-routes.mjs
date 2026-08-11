#!/usr/bin/env node
// Guard (T003826): kein Admin-Sidebar-Eintrag darf über REDIRECT_MAP in einer /sdlc/-Route
// landen. build-target.mjs entfernt alle /sdlc/-Routen aus dem prod-Manifest
// (BUILD_TARGET=prod), ein solcher Eintrag führte also ins Leere.
//
// Warum ein eigenes Skript statt nur des vitest-Tests (nav-items.test.ts):
// Der CI-Job "Vitest (website)" läuft mit `--changed origin/main`, während checkout@v7
// und `git fetch --depth=1` beide eine shallow History anlegen. Ohne gemeinsamen
// Vorfahren findet die Änderungserkennung nichts und der Job meldet
// "No test files found, exiting with code 0" — grün, ohne einen Test ausgeführt zu haben.
// Dieses Skript hängt an der BATS-Suite, die unabhängig davon läuft.
//
// PRÜFMODUS: Output-Verifikation. Die Module werden importiert und die Pfade real
// aufgelöst; es wird kein Quelltext gegrept (CLAUDE.md § Test-Resultats-Konvention).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { buildNavSections } = await import(join(repoRoot, 'website/src/lib/admin/nav-items.ts'));
const { resolveRedirect } = await import(join(repoRoot, 'website/src/middleware/redirect-map.ts'));

const OPTS = { inboxPending: 3, brettUrl: 'https://brett.example.invalid' };

/** Folgt der Redirect-Kette; ein Eintrag kann über mehrere Sprünge in /sdlc/ landen. */
function resolveFinal(href) {
  let current = href;
  for (let hop = 0; hop < 10; hop++) {
    const next = resolveRedirect(current.split('?')[0]);
    if (next === null || next === current) return current;
    current = next;
  }
  return current;
}
const isSdlc = (href) => resolveFinal(href).startsWith('/sdlc/');

const sections = buildNavSections(OPTS);
const items = sections.flatMap((s) => s.items);
const internal = items.filter((i) => !i.external);

const problems = [];

// Positiv-Anker zuerst (CLAUDE.md § Positiv-Anker-Pflicht, T002356-M1): ohne sie bestünde
// die Negativ-Aussage unten auch dann, wenn gar keine Einträge geladen wurden.
if (internal.length === 0) problems.push('Anker: keine internen Einträge geladen');
if (!isSdlc('/admin/cockpit')) problems.push('Anker: Guard erkennt /admin/cockpit nicht als SDLC-Route');
if (!isSdlc('/admin/planungsbuero')) problems.push('Anker: transitive Auflösung greift nicht');
if (isSdlc('/admin/inhalte')) problems.push('Anker: Guard schlägt fälschlich bei /admin/inhalte an');

for (const i of internal) {
  if (isSdlc(i.href)) problems.push(`Eintrag "${i.label}" → ${i.href} → ${resolveFinal(i.href)}`);
}
for (const i of items) {
  for (const m of i.matches ?? []) {
    if (isSdlc(m)) problems.push(`matches von "${i.label}" → ${m} → ${resolveFinal(m)}`);
  }
}

if (problems.length) {
  console.error('admin-nav-routes: FAIL');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`admin-nav-routes: OK (${items.length} Einträge, ${internal.length} intern, keine /sdlc/-Ziele)`);
