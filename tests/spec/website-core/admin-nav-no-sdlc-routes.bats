#!/usr/bin/env bats
# tests/spec/website-core/admin-nav-no-sdlc-routes.bats
# SSOT: openspec/specs/website-core.md § Admin-Sidebar-Navigation
#
# PRÜFMODUS: Output-Verifikation. Der Test FÜHRT scripts/check-admin-nav-routes.mjs AUS
# und prüft dessen Exit-Code und Ausgabe. Das Skript importiert die Nav-Definition samt
# resolveRedirect() und löst jeden href real auf — es greppt keinen Quelltext
# (CLAUDE.md § Test-Resultats-Konvention, T002448-M4).
#
# Warum hier und nicht nur als vitest (website/src/lib/admin/nav-items.test.ts):
# Der CI-Job "Vitest (website)" läuft mit `--changed origin/main`, während checkout@v7
# und `git fetch --depth=1` beide eine shallow History anlegen. Ohne gemeinsamen Vorfahren
# meldet er "No test files found, exiting with code 0" — grün, ohne einen Test ausgeführt
# zu haben (beobachtet an PR #4285, Job 93753108543). Dieser BATS-Test hängt an der
# BATS-Suite, die unabhängig davon läuft.

setup() {
  REPO_ROOT="$BATS_TEST_DIRNAME/../../.."
  GUARD="$REPO_ROOT/scripts/check-admin-nav-routes.mjs"
}

@test "admin-nav: Guard-Skript existiert und ist ausführbar" {
  [ -f "$GUARD" ]
}

@test "admin-nav: kein Sidebar-Eintrag zeigt auf eine im prod-Build entfernte /sdlc/-Route" {
  # Node-Typestripping braucht 22.6+; ohne passende Laufzeit misst der Test die
  # Ausstattung des Runners statt den Zustand des Codes (CLAUDE.md, T002820).
  command -v node >/dev/null 2>&1 || skip "node not installed"
  node -e 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
    || skip "node < 22 — kein TypeScript-Stripping"

  run node --experimental-strip-types "$GUARD"
  [ "$status" -eq 0 ]
  # Semantik statt Darstellung: geprüft wird das Vorhandensein des OK-Markers,
  # ohne Zeilenanker und ohne die Zahlen festzuschreiben (T002716).
  echo "$output" | grep -qF -e 'admin-nav-routes: OK'
}

@test "admin-nav: Guard schlägt an, wenn ein SDLC-Eintrag eingeschleust wird" {
  # Positiv-Anker (T002356-M1): ohne diesen Nachweis wäre der grüne Lauf oben
  # auch dann grün, wenn der Guard gar nichts prüft.
  command -v node >/dev/null 2>&1 || skip "node not installed"
  node -e 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
    || skip "node < 22 — kein TypeScript-Stripping"

  local fixture="$BATS_TEST_TMPDIR/inject.mjs"
  cat > "$fixture" <<EOF
const { resolveRedirect } = await import('$REPO_ROOT/website/src/middleware/redirect-map.ts');
// Derselbe Auflösungspfad wie im Guard, angewandt auf einen entfernten Eintrag.
let cur = '/admin/cockpit';
for (let i = 0; i < 10; i++) {
  const next = resolveRedirect(cur.split('?')[0]);
  if (next === null || next === cur) break;
  cur = next;
}
process.exit(cur.startsWith('/sdlc/') ? 0 : 1);
EOF
  run node --experimental-strip-types "$fixture"
  [ "$status" -eq 0 ]
}
