#!/usr/bin/env bash
# admin-menu-gate.sh — enforce admin menu rules (R1, R2, R4, R5, R7).
#
# Exits 0 if the menu in website/src/layouts/AdminLayout.astro complies with
# the rules and every new /admin/* static page added in this branch (vs the
# base ref) is reachable from the sidemenu.
#
# Override: ADMIN_MENU_GATE=skip   — exits 0 with a warning; PR title gets
#                                    [menu-gate-skip] prefix in dev-flow-execute.

set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
LAYOUT="website/src/layouts/AdminLayout.astro"
DASHBOARD="website/src/pages/admin.astro"
MAX_GROUPS=6
MAX_ITEMS=6

if [[ "${ADMIN_MENU_GATE:-}" == "skip" ]]; then
  echo "⚠️  ADMIN_MENU_GATE=skip — gate bypassed (will be flagged in PR title)"
  exit 0
fi

if [[ ! -f "$LAYOUT" ]]; then
  echo "✗ $LAYOUT not found — wrong working directory?" >&2
  exit 2
fi

# --- Step 1: extract reach set (hrefs + matches[] prefixes) from AdminLayout ---
# We use awk on the navGroups literal. The shape is stable enough for this:
#   { href: '/admin/foo', ..., matches: ['/admin/foo', '/admin/bar'] }

REACH_SET=$(awk '
  /href: *'\''/ {
    match($0, /href: *'\''([^'\'']+)'\''/, m)
    if (m[1]) print m[1]
  }
  /matches: *\[/, /\]/ {
    while (match($0, /'\''([^'\'']+)'\''/, m)) {
      print m[1]
      $0 = substr($0, RSTART + RLENGTH)
    }
  }
' "$LAYOUT" | sort -u)

# Always include /admin (Dashboard header link)
REACH_SET=$(printf '%s\n/admin\n' "$REACH_SET" | sort -u)

# --- Step 2: count groups and items (R4, R5) ---
GROUP_COUNT=$(awk '/^ *label: *'\''/{c++} END{print c+0}' "$LAYOUT")

# Per-group item count: walk navGroups, count items between '{ href:' lines
# bracketed by the same group's label..]. A bit ugly; uses braces depth.
MAX_GROUP_SIZE=$(awk '
  BEGIN { depth=0; n=0; max=0; in_items=0 }
  /label: *'\''/ {
    if (n > max) max = n
    n = 0
    in_items = 0
  }
  /items: *\[/ { in_items = 1; next }
  in_items && /^ *\{ *href:/ { n++ }
  /^ *\],? *$/ && in_items { in_items = 0 }
  END {
    if (n > max) max = n
    print max
  }
' "$LAYOUT")

# --- Step 3: collect labels (R2 — destinations not actions) ---
LABELS=$(awk '
  /label: *'\''/ {
    match($0, /label: *'\''([^'\'']+)'\''/, m)
    if (m[1]) print m[1]
  }
' "$LAYOUT")

# --- Step 4: detect new static /admin/* pages added vs base ---
NEW_ROUTES=$(git diff --name-only --diff-filter=AM "$BASE_REF" \
  -- 'website/src/pages/admin/**/*.astro' 2>/dev/null \
  | grep -v '\[' \
  | grep -v '^website/src/pages/admin\.astro$' \
  || true)

# --- Step 5: derive canonical hrefs ---
ROUTE_HREFS=$(printf '%s\n' "$NEW_ROUTES" \
  | sed -E 's|^website/src/pages||; s|/index\.astro$||; s|\.astro$||' \
  | grep -v '^$' || true)

# --- Step 6: parse dashboard hrefs for R7 ---
DASHBOARD_HREFS=""
if [[ -f "$DASHBOARD" ]]; then
  DASHBOARD_HREFS=$(grep -oE 'href="/admin[^"]*"' "$DASHBOARD" \
    | sed -E 's|href="||; s|"$||' \
    | sort -u || true)
fi

# --- Run checks ---
FAILED=0
echo "Admin-Menu Gate"
echo "─────────────────────────────────────"

# R5: group count
if (( GROUP_COUNT > MAX_GROUPS )); then
  echo "✗ R5  navGroups has $GROUP_COUNT groups (max $MAX_GROUPS)"
  FAILED=1
else
  echo "✓ R5  navGroups = $GROUP_COUNT (≤ $MAX_GROUPS)"
fi

# R4: max items per group
if (( MAX_GROUP_SIZE > MAX_ITEMS )); then
  echo "✗ R4  Largest group has $MAX_GROUP_SIZE items (max $MAX_ITEMS)"
  FAILED=1
else
  echo "✓ R4  Largest group = $MAX_GROUP_SIZE items (≤ $MAX_ITEMS)"
fi

# R2: label verb hygiene
BAD_LABELS=$(echo "$LABELS" | grep -iE '^(neu|new|add|erstell|create)' || true)
if [[ -n "$BAD_LABELS" ]]; then
  echo "✗ R2  Action-labels in menu (use destinations / nouns):"
  echo "$BAD_LABELS" | sed 's/^/    - /'
  FAILED=1
else
  echo "✓ R2  All labels are destinations"
fi

# R1: orphan check on new routes
ORPHANS=""
if [[ -n "$ROUTE_HREFS" ]]; then
  while IFS= read -r route; do
    [[ -z "$route" ]] && continue
    if echo "$REACH_SET" | grep -qxF "$route"; then
      continue
    fi
    # Check dynamic-parent reachability: walk up the path
    parent="$route"
    matched=""
    while [[ "$parent" == /admin/* ]]; do
      parent="${parent%/*}"
      if echo "$REACH_SET" | grep -qxF "$parent"; then
        matched="$parent"
        break
      fi
    done
    if [[ -z "$matched" ]]; then
      ORPHANS+="    - $route"$'\n'
    fi
  done <<< "$ROUTE_HREFS"
fi

if [[ -n "$ORPHANS" ]]; then
  echo "✗ R1  New static admin routes not reachable from sidemenu:"
  printf '%s' "$ORPHANS"
  echo "      Suggestion: add to navGroups in $LAYOUT, or list parent in matches[]."
  FAILED=1
else
  echo "✓ R1  All new admin routes are reachable"
fi

# R7: dashboard cross-ref
DASHBOARD_ORPHANS=""
if [[ -n "$DASHBOARD_HREFS" ]]; then
  while IFS= read -r href; do
    [[ -z "$href" ]] && continue
    [[ "$href" == /admin ]] && continue
    if echo "$REACH_SET" | grep -qxF "$href"; then
      continue
    fi
    # check dynamic parent
    parent="$href"
    matched=""
    while [[ "$parent" == /admin/* ]]; do
      parent="${parent%/*}"
      if echo "$REACH_SET" | grep -qxF "$parent"; then
        matched="$parent"
        break
      fi
    done
    if [[ -z "$matched" ]]; then
      DASHBOARD_ORPHANS+="    - $href"$'\n'
    fi
  done <<< "$DASHBOARD_HREFS"
fi

if [[ -n "$DASHBOARD_ORPHANS" ]]; then
  echo "✗ R7  Dashboard links to orphan(s):"
  printf '%s' "$DASHBOARD_ORPHANS"
  echo "      Suggestion: either add the target to the sidemenu, or remove from $DASHBOARD."
  FAILED=1
else
  echo "✓ R7  Dashboard hrefs are all reachable"
fi

echo "─────────────────────────────────────"
if (( FAILED )); then
  echo "Gate FAILED. See suggestions above. Set ADMIN_MENU_GATE=skip to bypass (logged)."
  exit 1
fi
echo "Gate PASSED."
exit 0
