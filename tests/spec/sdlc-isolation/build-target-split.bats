#!/usr/bin/env bats
# tests/spec/sdlc-isolation/build-target-split.bats
# SSOT: openspec/changes/sdlc-build-target-split/specs/sdlc-isolation.md
# T002624: Nachweis, dass ein reiner SDLC-Commit den Produktions-Build nicht mehr auslöst.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  BUILD_WEBSITE_YML="$REPO_ROOT/.github/workflows/build-website.yml"
  SDLC_PAGES_DIR="$REPO_ROOT/website/src/pages/sdlc"
  ADMIN_PAGES_DIR="$REPO_ROOT/website/src/pages/admin"
  BUILD_TARGET_MJS="$REPO_ROOT/website/src/integrations/build-target.mjs"
  SDLC_CONSOLE_YAML="$REPO_ROOT/k3d/sdlc-stack/sdlc-console.yaml"
}

# ── T002675: Infra-Allowlist im BUILD_TARGET=sdlc-Filter ──────────────────
# Die sdlc-console probet /api/health und braucht /api/auth/* + /login für den
# OIDC-Login. Diese Routen müssen im sdlc-Route-Manifest erhalten bleiben,
# sonst crasht der Container in der Probe-Schleife (HTTP 404, T002675).

@test "T002675: build-target.mjs enthaelt Infra-Allowlist /api/health und /api/auth/" {
  [ -f "$BUILD_TARGET_MJS" ] || { echo "MISSING: $BUILD_TARGET_MJS"; return 1; }
  grep -q "/api/health" "$BUILD_TARGET_MJS" \
    || { echo "MISSING '/api/health' in der Infra-Allowlist von build-target.mjs"; return 1; }
  grep -q "/api/auth/" "$BUILD_TARGET_MJS" \
    || { echo "MISSING '/api/auth/' in der Infra-Allowlist von build-target.mjs"; return 1; }
}

@test "T002675: sdlc-console Probe-Pfad /api/health ist von der Allowlist abgedeckt" {
  [ -f "$SDLC_CONSOLE_YAML" ] || { echo "MISSING: $SDLC_CONSOLE_YAML"; return 1; }
  [ -f "$BUILD_TARGET_MJS" ] || { echo "MISSING: $BUILD_TARGET_MJS"; return 1; }
  # Proben dürfen nie auf eine Route zeigen, die der sdlc-Filter entfernt.
  probe_path=$(grep -A2 "readinessProbe:" "$SDLC_CONSOLE_YAML" | grep "path:" | head -1 | sed -E 's/.*path: *"?([^" ]+)"?.*/\1/')
  [ -n "$probe_path" ] || { echo "FAIL: keine Probe-Path in $SDLC_CONSOLE_YAML gefunden"; return 1; }
  grep -q "$probe_path" "$BUILD_TARGET_MJS" \
    || { echo "FAIL: Probe-Path '$probe_path' ist nicht in der build-target.mjs-Allowlist"; return 1; }
}

@test "T002675: build-target.mjs haelt /login.astro als Infra-Route (Login-Seite)" {
  [ -f "$BUILD_TARGET_MJS" ] || { echo "MISSING: $BUILD_TARGET_MJS"; return 1; }
  grep -qE "login\.astro" "$BUILD_TARGET_MJS" \
    || { echo "MISSING '/login.astro' in der Infra-Allowlist von build-target.mjs"; return 1; }
}


# Assertion 1: build-website.yml enthält die drei negativen Pfad-Muster.
@test "T002624: build-website.yml enthaelt negativen Pfad-Filter für pages/sdlc (RED vor Task 5)" {
  [ -f "$BUILD_WEBSITE_YML" ] || { echo "MISSING workflow: $BUILD_WEBSITE_YML"; return 1; }
  grep -qE "!website/src/pages/sdlc/\*\*" "$BUILD_WEBSITE_YML" \
    || { echo "MISSING negativer Pfad-Filter '!website/src/pages/sdlc/**' in build-website.yml"; return 1; }
}

@test "T002624: build-website.yml enthaelt negativen Pfad-Filter für lib/sdlc" {
  [ -f "$BUILD_WEBSITE_YML" ] || { echo "MISSING workflow: $BUILD_WEBSITE_YML"; return 1; }
  grep -qE "!website/src/lib/sdlc/\*\*" "$BUILD_WEBSITE_YML" \
    || { echo "MISSING negativer Pfad-Filter '!website/src/lib/sdlc/**' in build-website.yml"; return 1; }
}

@test "T002624: build-website.yml enthaelt negativen Pfad-Filter für components/sdlc" {
  [ -f "$BUILD_WEBSITE_YML" ] || { echo "MISSING workflow: $BUILD_WEBSITE_YML"; return 1; }
  grep -qE "!website/src/components/sdlc/\*\*" "$BUILD_WEBSITE_YML" \
    || { echo "MISSING negativer Pfad-Filter '!website/src/components/sdlc/**' in build-website.yml"; return 1; }
}

# Assertion 2: Positiv-Anker — pages/sdlc/ existiert und enthält mindestens eine .astro-Datei.
@test "T002624: website/src/pages/sdlc/ existiert mit mindestens einer .astro-Datei" {
  [ -d "$SDLC_PAGES_DIR" ] || { echo "MISSING directory: $SDLC_PAGES_DIR"; return 1; }
  count=$(find "$SDLC_PAGES_DIR" -name '*.astro' 2>/dev/null | wc -l | tr -d ' ')
  [ "$count" -gt 0 ] || { echo "FAIL: $SDLC_PAGES_DIR enthaelt keine .astro-Dateien (Umzug fehlt)"; return 1; }
}

# Assertion 3: Unter pages/admin/ liegt keine der verschobenen SDLC-Seiten mehr.
@test "T002624: keine verschobene SDLC-Seite existiert mehr unter pages/admin/" {
  [ -d "$ADMIN_PAGES_DIR" ] || { echo "MISSING directory: $ADMIN_PAGES_DIR"; return 1; }
  moved_pages="cockpit.astro pipeline.astro observability.astro repohealth.astro software-history.astro architektur.astro platform.astro app-catalog.astro prompts.astro ki-konfiguration.astro bugs.astro"
  for page in $moved_pages; do
    if [ -f "$ADMIN_PAGES_DIR/$page" ]; then
      echo "FAIL: $page existiert noch unter $ADMIN_PAGES_DIR — wurde nicht nach sdlc/ verschoben"
      return 1
    fi
  done
  # Verzeichnisse die verschoben wurden
  for dir in systemtest tickets; do
    if [ -d "$ADMIN_PAGES_DIR/$dir" ]; then
      echo "FAIL: Verzeichnis $dir existiert noch unter $ADMIN_PAGES_DIR"
      return 1
    fi
  done
}

@test "T002624: build-website.yml enthaelt BUILD_TARGET=prod build-arg" {
  [ -f "$BUILD_WEBSITE_YML" ] || { echo "MISSING workflow: $BUILD_WEBSITE_YML"; return 1; }
  grep -qE 'BUILD_TARGET=prod' "$BUILD_WEBSITE_YML" \
    || { echo "MISSING BUILD_TARGET=prod in build-website.yml"; return 1; }
}
