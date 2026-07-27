#!/usr/bin/env bats
# tests/spec/agent-skills.bats
# SSOT: openspec/specs/agent-skills.md
#
# Covers: dev-flow-chore git-crypt guard, ticket-ops dedup, agent-push notifications.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── dev-flow-chore: git-crypt smudge guard ────────────────────────────

@test "dev-flow-chore SKILL.md exists" {
  [ -f "$REPO/.claude/skills/dev-flow-chore/SKILL.md" ]
}

@test "dev-flow-chore Step 4 has Secret-in-index-Guard for git-crypt artifacts" {
  run grep -q 'Secret-in-index-Guard\|secret.*index.*guard\|git-crypt' "$REPO/.claude/skills/dev-flow-chore/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "dev-flow-chore skill refuses bare git add -A (mentions git-crypt)" {
  run grep -qi 'git.add.*-A\|git add -A\|git-crypt' "$REPO/.claude/skills/dev-flow-chore/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── ticket-ops: intake deduplication ──────────────────────────────────

@test "ticket-ops SKILL.md exists" {
  [ -f "$REPO/.claude/skills/ticket-ops/SKILL.md" ]
}

@test "ticket-ops skill mentions dedup or duplicate check" {
  run grep -qi 'dedup\|duplicate\|same.*title\|vorhanden.*Ticket' "$REPO/.claude/skills/ticket-ops/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── agent-push: notification delivery ─────────────────────────────────

@test "agent-push.sh exists and is executable" {
  [ -f "$REPO/scripts/agent-push.sh" ]
  [ -x "$REPO/scripts/agent-push.sh" ]
}

@test "agent-push.sh constructs ntfy topic from bachelorprojekt-\${SOURCE}" {
  run grep -q 'bachelorprojekt-' "$REPO/scripts/agent-push.sh"
  [ "$status" -eq 0 ]
}

# ── skill quality pass (T002303) ──────────────────────────────────────
#
# "Projekteigen" wird NICHT hartkodiert, sondern aus der Vendor-Sektion in OVERVIEW.md
# abgeleitet — dieselbe Quelle, die G-AGENTIC08/09 in health-goals-check.sh benutzen.
# Eine zweite Namensliste hier wäre ein weiteres Register, das unabhängig driftet.

vendor_skills() {
  sed -n '/<!-- vendor-skills:begin -->/,/<!-- vendor-skills:end -->/p' \
    "$REPO/.claude/skills/OVERVIEW.md" | grep -oE '^\| `[a-z0-9/-]+`' | tr -d '|` '
}

project_owned_skills() {
  local vendor; vendor="$(vendor_skills)"
  local f d
  for f in $(cd "$REPO" && git ls-files -- .claude/skills | grep '/SKILL\.md$'); do
    d="${f#.claude/skills/}"; d="${d%/SKILL.md}"
    printf '%s\n' "$vendor" | grep -qx "$d" || echo "$d"
  done
}

@test "OVERVIEW.md vendor marker block exists and is non-empty" {
  run vendor_skills
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "every vendor skill named in OVERVIEW.md has a directory" {
  for d in $(vendor_skills); do
    [ -d "$REPO/.claude/skills/$d" ] || { echo "vendor skill without directory: $d"; return 1; }
  done
}

@test "every active project-owned skill has a description in its frontmatter" {
  for d in $(project_owned_skills); do
    f="$REPO/.claude/skills/$d/SKILL.md"
    # archived: true ist die bewusste Ausnahme — spiegelt G-AGENTIC07, das ebenfalls nur
    # Skills MIT description zählt (z.B. update-dependencies läuft als Cloud-Routine).
    awk 'BEGIN{n=0}/^---$/{n++;next} n==1&&/^archived:[[:space:]]*true/{found=1} END{exit !found}' "$f" && continue
    awk 'BEGIN{n=0}/^---$/{n++;next} n==1&&/^description:/{found=1} END{exit !found}' "$f" \
      || { echo "no description: $d"; return 1; }
  done
}

@test "no project-owned SKILL.md exceeds 250 lines" {
  for d in $(project_owned_skills); do
    n=$(wc -l < "$REPO/.claude/skills/$d/SKILL.md")
    [ "$n" -le 250 ] || { echo "$d has $n lines (limit 250)"; return 1; }
  done
}

@test "every skill frontmatter parses as YAML and declares a name" {
  run python3 - "$REPO" <<'PY'
import glob, os, sys
try:
    import yaml
except ImportError:
    print("SKIP: pyyaml missing"); sys.exit(0)
repo = sys.argv[1]; bad = []
pats = ('.claude/skills/*/SKILL.md', '.claude/skills/*/*/SKILL.md')
for pat in pats:
    for f in glob.glob(os.path.join(repo, pat)):
        txt = open(f, encoding='utf-8').read()
        if not txt.startswith('---'):
            bad.append(f + ' (no frontmatter)'); continue
        try:
            d = yaml.safe_load(txt.split('---', 2)[1])
            if not isinstance(d, dict) or 'name' not in d:
                bad.append(f + ' (no name)')
        except Exception as e:
            bad.append(f'{f} ({e.__class__.__name__})')
print('\n'.join(bad))
sys.exit(1 if bad else 0)
PY
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "OVERVIEW.md links only to SKILL.md files that exist" {
  while read -r p; do
    [ -z "$p" ] && continue
    [ -f "$REPO/.claude/skills/$p" ] || { echo "dead link: $p"; return 1; }
  done < <(grep -oE '\]\([a-z0-9/-]+/SKILL\.md\)' "$REPO/.claude/skills/OVERVIEW.md" \
           | sed 's/^](//; s/)$//' | sort -u)
}

@test "OVERVIEW.md does not link into the docs container build output" {
  run grep -c 'docs-content-built' "$REPO/.claude/skills/OVERVIEW.md"
  [ "$output" = "0" ]
}
