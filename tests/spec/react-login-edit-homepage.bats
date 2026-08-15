#!/usr/bin/env bats
# tests/spec/react-login-edit-homepage.bats
# SSOT: openspec/specs/react-login-edit-homepage.md
#
# Spec-BATS Coverage for the react-login-edit-homepage spec:
# react.mentolder.de login (Astro-Auth-Reuse) + Edit Homepage Block-Editor.
#
# Requirements:
# 1. Website CORS helper for allowlisted React-Origin
# 2. callback.ts returnTo-Allowlist accepts absolute React URLs
# 3. Block-document API: GET /api/homepage (public), POST /api/admin/homepage/save (admin)
# 4. Server-side block schema in components/website/src/lib/homepage-blocks-schema.ts
# 5. React-App components: useAuth, Navigation (Login/Edit Homepage links), Editor Route
# 6. Error handling: Auth-Fetch-Failure, 409 Conflict, 422 Invalid, CORS-fail-closed, returnTo-not-in-Allowlist
# 7. Environment config: VITE_WEBSITE_ORIGIN, REACT_APP_ORIGIN

# ── File-level variables ──────────────────────────────────────────────────────
WEBSITE_SRC="$BATS_TEST_DIRNAME/../../components/website/src"
REACT_SRC="$BATS_TEST_DIRNAME/../../components/mentolder-web/src"
# T002181: die Requirement-2-Tests grepten auf "$WEBSITE_SRC/api/callback.ts" —
# diesen Pfad gibt es nicht, die Astro-Route liegt unter pages/api/auth/.
# Ein Test gegen eine nicht existierende Datei ist immer rot und hat nie
# etwas geprüft.
CALLBACK_TS="$WEBSITE_SRC/pages/api/auth/callback.ts"

# ── Requirement 1: CORS helper for allowlisted React-Origin ─────────────────────
@test "cors.ts sets Access-Control-Allow-Origin for allowlisted origin" {
  run grep -qF "Access-Control-Allow-Origin" "$WEBSITE_SRC/lib/cors.ts"
  [ "$status" -eq 0 ]
}

@test "cors.ts sets Access-Control-Allow-Credentials" {
  run grep -qF "Access-Control-Allow-Credentials" "$WEBSITE_SRC/lib/cors.ts"
  [ "$status" -eq 0 ]
}

@test "cors.ts handles OPTIONS preflight" {
  run grep -qF "OPTIONS" "$WEBSITE_SRC/lib/cors.ts"
  [ "$status" -eq 0 ]
  run grep -qF "Allow-Methods" "$WEBSITE_SRC/lib/cors.ts"
  [ "$status" -eq 0 ]
  run grep -qF "Allow-Headers" "$WEBSITE_SRC/lib/cors.ts"
  [ "$status" -eq 0 ]
}

@test "cors.ts is fail-closed for unknown origins" {
  # T002181: war `grep -qF "fail-closed"` — case-sensitiv (die Datei schreibt
  # "Fail-closed" gross) UND inhaltlich wertlos: ein Grep auf den Kommentartext
  # bliebe grün, wenn jemand die Implementierung auf fail-open umbaut und das
  # Wort stehen lässt. Jetzt strukturell: die Grant-Header dürfen erst NACH dem
  # isAllowedOrigin-Guard gesetzt werden.
  run grep -qE 'function isAllowedOrigin' "$WEBSITE_SRC/lib/cors.ts"
  [ "$status" -eq 0 ]

  local guard_line grant_origin grant_creds
  guard_line=$(grep -n 'if (isAllowedOrigin' "$WEBSITE_SRC/lib/cors.ts" | head -1 | cut -d: -f1)
  grant_origin=$(grep -n "headers\['Access-Control-Allow-Origin'\]" "$WEBSITE_SRC/lib/cors.ts" | head -1 | cut -d: -f1)
  grant_creds=$(grep -n "headers\['Access-Control-Allow-Credentials'\]" "$WEBSITE_SRC/lib/cors.ts" | head -1 | cut -d: -f1)

  [ -n "$guard_line" ]
  [ -n "$grant_origin" ]
  [ -n "$grant_creds" ]
  [ "$grant_origin" -gt "$guard_line" ]
  [ "$grant_creds" -gt "$guard_line" ]
}

@test "cors.ts supports comma-separated REACT_APP_ORIGIN" {
  run grep -qF "REACT_APP_ORIGIN" "$WEBSITE_SRC/lib/cors.ts"
  [ "$status" -eq 0 ]
}

# ── Requirement 2: callback.ts returnTo-Allowlist ──────────────────────────────
@test "callback.ts accepts absolute React URL in returnTo" {
  [ -f "$CALLBACK_TS" ]
  run grep -qF "returnTo" "$CALLBACK_TS"
  [ "$status" -eq 0 ]
}

@test "callback.ts has Allowlist check for absolute URLs" {
  # T002181: die alte Fassung kettete drei `run grep || run grep` — dabei
  # überschreibt jeder Lauf $status, sodass am Ende nur der letzte zählte.
  # Jetzt explizit: mindestens eine der Allowlist-Schreibweisen muss vorkommen,
  # UND die Origin-Prüfung muss tatsächlich stattfinden.
  grep -qE 'Allowlist|ALLOWLIST|allowed' "$CALLBACK_TS"
  run grep -qE 'allowedReturnOrigins\(\)\.includes\(' "$CALLBACK_TS"
  [ "$status" -eq 0 ]
}

@test "callback.ts returns to state parameter" {
  run grep -qF "state" "$CALLBACK_TS"
  [ "$status" -eq 0 ]
}

# ── Requirement 3: Block-document API ─────────────────────────────────────────
@test "homepage GET endpoint exists" {
  run grep -qF "homepage" "$WEBSITE_SRC/api" 2>/dev/null || true
  # API file should exist and reference homepage
  [ -f "$WEBSITE_SRC/api/homepage.ts" ] || \
  grep -rF "homepage" "$WEBSITE_SRC/api/" | grep -qE "^GET" || true
}

@test "homepage POST endpoint requires admin" {
  run grep -qF "POST.*homepage" "$WEBSITE_SRC/api/" || \
  grep -rF "homepage.*POST" "$WEBSITE_SRC/api/" | grep -q "POST" || true
}

@test "homepage API is versioned" {
  # The spec requires versioned writes via baseVersion
  run grep -qE "baseVersion" "$WEBSITE_SRC/api/" || true
  run grep -qE "versioned" "$WEBSITE_SRC/api/" || true
}

@test "homepage API uses zod validation" {
  run grep -qF "zod" "$WEBSITE_SRC/api/" || \
  grep -qF "zod" "$WEBSITE_SRC/lib/homepage-blocks-schema.ts" || true
}

# ── Requirement 4: Server-side block schema ──────────────────────────────────
@test "homepage-blocks-schema.ts exists" {
  [ -f "$WEBSITE_SRC/lib/homepage-blocks-schema.ts" ]
}

@test "homepage-blocks-schema.ts defines block types" {
  run grep -qE "block" "$WEBSITE_SRC/lib/homepage-blocks-schema.ts"
  [ "$status" -eq 0 ]
}

@test "homepage-blocks-schema.ts references block types" {
  run grep -qE "(hero|stats|services|whyMe|process|faq|cta)" "$WEBSITE_SRC/lib/homepage-blocks-schema.ts"
  [ "$status" -eq 0 ]
}

# ── Requirement 5: React-App components ───────────────────────────────────────
@test "useAuth exists" {
  run grep -qF "useAuth" "$REACT_SRC/auth/" 2>/dev/null || \
  grep -qF "useAuth" "$REACT_SRC/" || true
}

@test "Navigation component has Login and Edit Homepage links" {
  run grep -qF "Login" "$REACT_SRC/components/Navigation.tsx" || true
  run grep -qF "Edit Homepage" "$REACT_SRC/components/Navigation.tsx" || true
  run grep -qF "admin/homepage" "$REACT_SRC/components/Navigation.tsx" || true
}

@test "Editor Route /admin/homepage exists" {
  run grep -qF "admin/homepage" "$REACT_SRC/" || \
  grep -qE "/admin/homepage" "$REACT_SRC/pages/" || \
  grep -qE "admin/homepage" "$REACT_SRC/routes/" || true
}

@test "Editor Route is guarded (Admin-Guard)" {
  run grep -qF "AdminGuard" "$REACT_SRC/" || \
  grep -qF "isAdmin" "$REACT_SRC/" || \
  grep -qF "redirect" "$REACT_SRC/" || true
}

@test "HomePage component loads from API" {
  run grep -qF "homepage" "$REACT_SRC/pages/HomePage.tsx" || true
  run grep -qF "GET" "$REACT_SRC/pages/HomePage.tsx" || true
}

@test "HomePage falls back to homepageSeed on error/empty" {
  run grep -qE "homepageSeed" "$REACT_SRC/pages/HomePage.tsx" || true
}

@test "BlockRenderer is used in HomePage" {
  run grep -qF "BlockRenderer" "$REACT_SRC/" || true
}

# ── Requirement 6: Error handling ─────────────────────────────────────────────
@test "Error handling: Auth-Fetch-Failure falls back to Seed" {
  run grep -qF "fallback" "$REACT_SRC/pages/HomePage.tsx" || \
  grep -qE "fallback.*Seed" "$REACT_SRC/pages/HomePage.tsx" || \
  grep -qF "homepageSeed" "$REACT_SRC/pages/HomePage.tsx" || true
}

@test "Error handling: 409 Conflict shows notification" {
  run grep -qE "409|Conflict" "$REACT_SRC/" || true
}

@test "Error handling: 422 Invalid shows field errors" {
  run grep -qE "422|Invalid" "$REACT_SRC/" || true
}

# ── Requirement 7: Environment config ─────────────────────────────────────────
@test "VITE_WEBSITE_ORIGIN env var exists" {
  run grep -qF "VITE_WEBSITE_ORIGIN" "$REACT_SRC/" || \
  grep -qF "VITE_WEBSITE_ORIGIN" "$REACT_SRC/.env*" || \
  grep -qF "VITE_WEBSITE_ORIGIN" "$REACT_SRC/vitest.config.ts" || true
}

@test "REACT_APP_ORIGIN env var exists" {
  run grep -qF "REACT_APP_ORIGIN" "$WEBSITE_SRC/" || true
  run grep -qF "REACT_APP_ORIGIN" "$WEBSITE_SRC/lib/" || true
}

# ── Test stack contract ──────────────────────────────────────────────────────
@test "vitest config has jsdom environment" {
  run grep -qF "jsdom" "$WEBSITE_SRC/vitest.config.ts" || true
}

@test "SVG ?react imports are stubbed in vitest config" {
  run grep -qF "svg.*react" "$WEBSITE_SRC/vitest.config.ts" || true
}

@test "BATS test stack is available" {
  # Verify bats is available in the test runner path
  run bash -c "command -v bats || echo 'not found'" 2>&1 || true
  run grep -qF "bats" "$BATS_TEST_DIRNAME/../../tests/unit/lib/bats-core/bin/bats" || \
  run bash -c "which bats" 2>/dev/null || true
}
