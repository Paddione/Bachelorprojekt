#!/usr/bin/env bats
# tests/spec/brain-foundation.bats
# SSOT: openspec/specs/brain-foundation.md
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  BOOTSTRAP="$REPO_ROOT/scripts/brain-bootstrap.sh"
  LINT_WL="$REPO_ROOT/templates/brain/scripts/lint-wikilinks.sh"
  LINT_FM="$REPO_ROOT/templates/brain/scripts/lint-frontmatter.sh"
  WORK="$(mktemp -d)"
}
teardown() { rm -rf "$WORK"; }

@test "bootstrap seeds the full Karpathy layout" {
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [ -f "$WORK/brain/SCHEMA.md" ]
  [ -f "$WORK/brain/index.md" ]
  [ -f "$WORK/brain/log.md" ]
  [ -d "$WORK/brain/raw" ]
  [ -d "$WORK/brain/wiki" ]
  [ -f "$WORK/brain/scripts/lint-wikilinks.sh" ]
  [ -f "$WORK/brain/scripts/lint-frontmatter.sh" ]
  [ -f "$WORK/brain/.github/workflows/ci.yml" ]
}

@test "bootstrap is idempotent — second run exits 0 and keeps seed" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [ -f "$WORK/brain/SCHEMA.md" ]
  [ -f "$WORK/brain/wiki/example-note.md" ]
}

@test "bootstrap local mode performs no gh/network side effects" {
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [[ "$output" != *"repo create"* ]]
}

@test "lint-frontmatter flags a missing mandatory field" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\n---\nbody\n' > "$WORK/w/wiki/bad.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"missing required frontmatter field: status"* ]]
}

@test "lint-frontmatter passes a well-formed page" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/ok.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "lint-wikilinks flags a dead link" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost]]\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dead wikilink: [[ghost]]"* ]]
}

@test "lint-wikilinks passes when every link resolves" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[b]]\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nhi\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "seeded example pages satisfy their own frontmatter + wikilink lint" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$WORK/brain/scripts/lint-frontmatter.sh" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$WORK/brain/scripts/lint-wikilinks.sh" "$WORK/brain"; [ "$status" -eq 0 ]
}

@test "ci.yml wires both linters + a secret scan on push and pull_request" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  ci="$WORK/brain/.github/workflows/ci.yml"
  grep -q 'lint-wikilinks.sh' "$ci"
  grep -q 'lint-frontmatter.sh' "$ci"
  grep -qi 'gitleaks' "$ci"
  grep -q 'push' "$ci"
  grep -q 'pull_request' "$ci"
}

@test "bootstrap reads collaborator from --collaborator flag" {
  grep -q -- '--collaborator' "$BOOTSTRAP"
}

# --- T001578: site.Dockerfile template must be buildable -------------------

@test "site.Dockerfile pins quartz v4.5.2 via tagged clone" {
  grep -q -- '--branch v4.5.2' "$REPO_ROOT/templates/brain/site.Dockerfile"
}

@test "site.Dockerfile runtime stage uses the official static-web-server image" {
  grep -q 'ghcr.io/static-web-server/static-web-server:2-alpine' \
    "$REPO_ROOT/templates/brain/site.Dockerfile"
}

@test "site.Dockerfile has no npm ci against a nonexistent package.json" {
  df="$REPO_ROOT/templates/brain/site.Dockerfile"
  ! grep -q 'COPY package' "$df"
  ! grep -q -- '--only=production' "$df"
}

@test "build-site.yml workflow template exists and pushes brain-site:latest" {
  wf="$REPO_ROOT/templates/brain/.github/workflows/build-site.yml"
  [ -f "$wf" ]
  grep -q 'ghcr.io/paddione/brain-site:latest' "$wf"
  grep -q 'site.Dockerfile' "$wf"
}

@test "bootstrap seed contains site.Dockerfile and build-site.yml" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  [ -f "$WORK/brain/site.Dockerfile" ]
  [ -f "$WORK/brain/.github/workflows/build-site.yml" ]
}

# --- T001884: Mermaid-Markdown architecture page (E3) ---

@test "build-graph-docs.mjs emits docs/diagrams/architecture.md with mermaid fences, not HTML" {
  cd "$REPO_ROOT"
  WORK="$(mktemp -d)"
  ARCH_OUT="$WORK/architecture.md" run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ] || { echo "FAIL: generator exited non-zero: $output"; rm -rf "$WORK"; return 1; }
  [ -f "$WORK/architecture.md" ] || { echo "FAIL: architecture.md not written"; rm -rf "$WORK"; return 1; }
  grep -q '```mermaid' "$WORK/architecture.md" \
    || { echo "FAIL: no mermaid fence in output"; rm -rf "$WORK"; return 1; }
  ! grep -q '<html' "$WORK/architecture.md" \
    || { echo "FAIL: output still contains raw HTML"; rm -rf "$WORK"; return 1; }
  ! grep -q 'cdn.jsdelivr.net' "$WORK/architecture.md" \
    || { echo "FAIL: output still references the CDN mermaid script"; rm -rf "$WORK"; return 1; }
  rm -rf "$WORK"
}

@test "docs/diagrams/architecture.md is byte-identical across two consecutive generator runs (no embedded timestamp)" {
  cd "$REPO_ROOT"
  WORK="$(mktemp -d)"
  ARCH_OUT="$WORK/architecture.md" run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ]
  first="$(cat "$WORK/architecture.md")"
  ARCH_OUT="$WORK/architecture.md" run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ]
  second="$(cat "$WORK/architecture.md")"
  [ "$first" = "$second" ] || { echo "FAIL: output differs between consecutive runs — likely an embedded timestamp"; rm -rf "$WORK"; return 1; }
  rm -rf "$WORK"
}

# --- T001884: brain-ingest SKILL.md synced to the real pipeline (E7) ---

@test "brain-ingest SKILL.md references the real orchestrator, not a fictional quartz CLI workflow" {
  skill="$REPO_ROOT/.claude/skills/brain-ingest/SKILL.md"
  grep -q 'scripts/brain-ingest.sh' "$skill" \
    || { echo "FAIL: SKILL.md never mentions the real orchestrator script"; return 1; }
  ! grep -q 'quartz generate --sources' "$skill" \
    || { echo "FAIL: SKILL.md still describes the never-built quartz CLI workflow"; return 1; }
}

# --- T001963: prune deletion-sync + fail-closed transform validation ---

make_prune_fixture() {
  FIX="$BATS_TEST_TMPDIR/fix"
  mkdir -p "$FIX/repo/docs" "$FIX/brain/wiki"
  # Quell-Repo: kept.md existiert, gone.md existiert NICHT
  printf 'kept\n' > "$FIX/repo/docs/kept.md"
  # Worklist-TSV (Format: pfad \t slug \t gruppe)
  printf 'docs/kept.md\tdocs-kept\tcore-docs\n' > "$FIX/worklist.tsv"
  # Wiki-Seiten
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsource:: Bachelorprojekt docs/kept.md\nbody [[docs-kept]]\n' \
    > "$FIX/brain/wiki/docs-kept.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsource:: Bachelorprojekt docs/gone.md\nbody\n' \
    > "$FIX/brain/wiki/docs-gone.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nno source line\n' \
    > "$FIX/brain/wiki/orphan-with-state.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsource:: self\nmeta page\n' \
    > "$FIX/brain/wiki/SCHEMA-notes.md"
  # State-File: reverse-map für orphan-with-state (Quellpfad docs/vanished.md existiert nicht)
  printf '{"docs/vanished.md":{"hash":"h1","slug":"orphan-with-state","type":"note","transformed_at":"2026-07-15T00:00:00Z"}}\n' \
    > "$FIX/state.json"
}

@test "prune default run lists stale source:: page as candidate without deleting" {
  make_prune_fixture
  run bash "$REPO_ROOT/scripts/brain-ingest-prune.sh" --brain-repo "$FIX/brain" --root "$FIX/repo" --worklist "$FIX/worklist.tsv" --state "$FIX/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PRUNE-CANDIDATE: wiki/docs-gone.md"* ]]
  [ -f "$FIX/brain/wiki/docs-gone.md" ]
  [[ "$output" != *"PRUNE-CANDIDATE: wiki/docs-kept.md"* ]]
}

@test "prune state-reverse-map flags page without source:: whose state source vanished" {
  make_prune_fixture
  run bash "$REPO_ROOT/scripts/brain-ingest-prune.sh" --brain-repo "$FIX/brain" --root "$FIX/repo" --worklist "$FIX/worklist.tsv" --state "$FIX/state.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PRUNE-CANDIDATE: wiki/orphan-with-state.md"* ]]
}

@test "prune --prune deletes candidates and cleans state entries" {
  make_prune_fixture
  run bash "$REPO_ROOT/scripts/brain-ingest-prune.sh" --brain-repo "$FIX/brain" --root "$FIX/repo" --worklist "$FIX/worklist.tsv" --state "$FIX/state.json" --prune
  [ "$status" -eq 0 ]
  [ ! -f "$FIX/brain/wiki/docs-gone.md" ]
  [ ! -f "$FIX/brain/wiki/orphan-with-state.md" ]
  [ -f "$FIX/brain/wiki/docs-kept.md" ]
  ! jq -e '."docs/vanished.md"' "$FIX/state.json" >/dev/null 2>&1
  [[ "$output" == *"PRUNED: wiki/docs-gone.md"* ]]
}

@test "prune never deletes meta pages (source self / no state entry)" {
  make_prune_fixture
  run bash "$REPO_ROOT/scripts/brain-ingest-prune.sh" --brain-repo "$FIX/brain" --root "$FIX/repo" --worklist "$FIX/worklist.tsv" --state "$FIX/state.json" --prune
  [ "$status" -eq 0 ]
  [ -f "$FIX/brain/wiki/SCHEMA-notes.md" ]
  [[ "$output" != *"PRUNE-CANDIDATE: wiki/SCHEMA-notes.md"* ]]
}

start_mock_llm() {
  local body="$1"
  PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
  : > "$BATS_TEST_TMPDIR/hits"
  python3 - "$PORT" "$body" "$BATS_TEST_TMPDIR/hits" >"$BATS_TEST_TMPDIR/mock.log" 2>&1 <<'PYEOF' &
import http.server, json, sys

port = int(sys.argv[1])
body = sys.argv[2]
hits_file = sys.argv[3]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        with open(hits_file, "r+") as f:
            n = int(f.read() or "0") + 1
            f.seek(0); f.write(str(n)); f.truncate()
        payload = json.dumps({"choices": [{"message": {"content": body}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *args):
        pass

http.server.HTTPServer(("127.0.0.1", port), Handler).serve_forever()
PYEOF
  MOCK_PID=$!
  for _ in $(seq 1 50); do
    (exec 9<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && exec 9<&- 9>&- && break
    sleep 0.1
  done
}

stop_mock_llm() {
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" >/dev/null 2>&1 || true
}

@test "transform fails closed when output lacks source:: after one retry" {
  make_prune_fixture
  SLUGS_JSON="$FIX/slugs.json"
  printf '["docs-kept"]\n' > "$SLUGS_JSON"
  start_mock_llm $'---\ntype: note\ntags: [x]\nstatus: active\n---\nkein rueckverweis'
  LM_STUDIO_URL="http://127.0.0.1:$PORT" run bash "$REPO_ROOT/scripts/brain-ingest-transform.sh" "$FIX/repo/docs/kept.md" note docs-kept "$SLUGS_JSON" '["note"]'
  stop_mock_llm
  [ "$status" -ne 0 ]
  [[ "$output" == *"validation: missing source:: line"* ]]
  [ "$(cat "$BATS_TEST_TMPDIR/hits")" -eq 2 ]
}

@test "transform passes a valid output with source:: and a body wikilink first try" {
  make_prune_fixture
  SLUGS_JSON="$FIX/slugs.json"
  printf '["docs-kept"]\n' > "$SLUGS_JSON"
  start_mock_llm $'---\ntype: note\ntags: [x]\nstatus: active\n---\nsource:: Bachelorprojekt docs/kept.md\nbody [[docs-kept]]'
  LM_STUDIO_URL="http://127.0.0.1:$PORT" run bash "$REPO_ROOT/scripts/brain-ingest-transform.sh" "$FIX/repo/docs/kept.md" note docs-kept "$SLUGS_JSON" '["note"]'
  stop_mock_llm
  [ "$status" -eq 0 ]
  [ "$(cat "$BATS_TEST_TMPDIR/hits")" -eq 1 ]
  [[ "$output" == *"source::"* ]]
}

@test "transform requests max_tokens 3072 and carries the language rule" {
  grep -q 'max_tokens: 3072' "$REPO_ROOT/scripts/brain-ingest-transform.sh"
  grep -q 'Mischübersetzung' "$REPO_ROOT/scripts/brain-ingest-transform.sh"
}
