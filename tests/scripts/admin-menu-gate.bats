#!/usr/bin/env bats
# admin-menu-gate.bats — verifies R1/R2/R4/R5/R7 enforcement.

setup() {
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  mkdir -p website/src/layouts website/src/pages/admin scripts
  cp "${BATS_TEST_DIRNAME}/../../scripts/admin-menu-gate.sh" scripts/
  chmod +x scripts/admin-menu-gate.sh
}

teardown() {
  rm -rf "$TMPDIR"
}

# Helper: write a minimal valid AdminLayout.astro
write_layout() {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Tagesgeschäft',
    items: [
      { href: '/admin/termine', label: 'Termine', icon: 'calendar' },
    ],
  },
];
EOF
}

# Helper: commit a clean baseline (so `origin/main` diff resolves)
commit_baseline() {
  write_layout
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git branch -M main
  git remote add origin "$TMPDIR" 2>/dev/null || true
  git update-ref refs/remotes/origin/main HEAD
}

@test "passes on clean baseline" {
  commit_baseline
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"Gate PASSED"* ]]
}

@test "R1: fails when a new static admin page has no nav entry" {
  commit_baseline
  mkdir -p website/src/pages/admin
  echo "<h1>Forecasting</h1>" > website/src/pages/admin/forecasting.astro
  git add -A
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R1"* ]]
  [[ "$output" == *"/admin/forecasting"* ]]
}

@test "R1: passes when new page is added to navGroups" {
  commit_baseline
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Tagesgeschäft',
    items: [
      { href: '/admin/termine',     label: 'Termine',     icon: 'calendar' },
      { href: '/admin/forecasting', label: 'Forecasting', icon: 'star' },
    ],
  },
];
EOF
  mkdir -p website/src/pages/admin
  echo "<h1>Forecasting</h1>" > website/src/pages/admin/forecasting.astro
  git add -A
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
}

@test "R1: dynamic [param] routes are exempt (parent must be in menu)" {
  commit_baseline
  mkdir -p website/src/pages/admin/projekte
  echo "<h1>Detail</h1>" > "website/src/pages/admin/projekte/[id].astro"
  git add -A
  # Parent /admin/projekte is not in the menu either, so this should still pass
  # for the [id] file (excluded by the gate's grep -v '\['), but FAIL only if
  # the user added a static /admin/projekte.astro without listing it.
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
}

@test "R2: fails when a label starts with 'Neue'" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Coaching',
    items: [
      { href: '/admin/coaching/sessions/new', label: 'Neue Session', icon: 'plus' },
    ],
  },
];
EOF
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R2"* ]]
  [[ "$output" == *"Neue Session"* ]]
}

@test "R4: fails when a group has >6 items" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Toomany',
    items: [
      { href: '/admin/a', label: 'A', icon: 'x' },
      { href: '/admin/b', label: 'B', icon: 'x' },
      { href: '/admin/c', label: 'C', icon: 'x' },
      { href: '/admin/d', label: 'D', icon: 'x' },
      { href: '/admin/e', label: 'E', icon: 'x' },
      { href: '/admin/f', label: 'F', icon: 'x' },
      { href: '/admin/g', label: 'G', icon: 'x' },
    ],
  },
];
EOF
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R4"* ]]
}

@test "R5: fails when navGroups has >6 groups" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  { label: 'G1', items: [ { href: '/admin/1', label: 'A', icon: 'x' } ] },
  { label: 'G2', items: [ { href: '/admin/2', label: 'A', icon: 'x' } ] },
  { label: 'G3', items: [ { href: '/admin/3', label: 'A', icon: 'x' } ] },
  { label: 'G4', items: [ { href: '/admin/4', label: 'A', icon: 'x' } ] },
  { label: 'G5', items: [ { href: '/admin/5', label: 'A', icon: 'x' } ] },
  { label: 'G6', items: [ { href: '/admin/6', label: 'A', icon: 'x' } ] },
  { label: 'G7', items: [ { href: '/admin/7', label: 'A', icon: 'x' } ] },
];
EOF
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R5"* ]]
}

@test "R7: fails when dashboard links to an orphan" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'G',
    items: [
      { href: '/admin/termine', label: 'Termine', icon: 'calendar' },
    ],
  },
];
EOF
  cat > website/src/pages/admin.astro <<'EOF'
<a href="/admin/projekte">Aktive Projekte</a>
EOF
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R7"* ]]
  [[ "$output" == *"/admin/projekte"* ]]
}

@test "ADMIN_MENU_GATE=skip bypasses with warning" {
  commit_baseline
  mkdir -p website/src/pages/admin
  echo "<h1>Forecasting</h1>" > website/src/pages/admin/forecasting.astro
  git add -A
  ADMIN_MENU_GATE=skip run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"bypassed"* ]]
}
