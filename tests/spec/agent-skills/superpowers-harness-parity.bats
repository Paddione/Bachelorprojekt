#!/usr/bin/env bats
# tests/spec/agent-skills/superpowers-harness-parity.bats — T900056
# SSOT: openspec/specs/agent-skills.md
#
# Die dev-flow-Skills rufen 11 superpowers:*-Skills an 61 Stellen auf. In opencode
# konnte keiner davon je aufloesen: opencode erbt den Plugin-Satz von Claude Code
# nicht, und .opencode/opencode.jsonc deklariert superpowers nicht.
#
# In Claude Code war die Aktivierung dagegen immer korrekt — das Plugin war nur nicht
# installiert. scripts/plugin-doctor.sh (T002651) meldet genau das seit Monaten
# zutreffend bei jedem Session-Start, folgenlos: es gibt keinen Weg vom Befund zum
# Zustand. `claude plugin install <plugin>@<marketplace>` existiert und wird nirgends
# im Repo aufgerufen. Ein Befund ohne ausfuehrbare Behebung wird weggeklickt.
#
# Pruefmodus (T002448-M4): OUTPUT-VERIFIKATION gegen Repo-Fakten. Geprueft werden
# Deklarationen in getrackten Dateien, nicht der maschinenlokale Installationszustand
# — der ist pro Rechner verschieden und in CI abwesend. Deshalb ist dieser Guard
# fail-closed ueberall, waehrend plugin-doctor.sh bewusst nur lokal etwas sagt.
#
# WINDOWS-FALLE (beobachtet in diesem Ticket): Pfade werden IMMER per argv an python3
# uebergeben, nie in den Skripttext interpoliert. Git-Bash mangelt argv-Pfade nach
# Windows-Konvention, den Heredoc-Inhalt aber nicht — ein interpolierter /c/... -Pfad
# laeuft dort in FileNotFoundError.
#
# Testnamen bleiben ASCII: ein U+2014-Gedankenstrich im @test-Namen laesst bats mit
# "unknown test name" abbrechen (ebenfalls hier beobachtet).

setup() {
  # Diese Datei liegt in tests/spec/agent-skills/ — drei Ebenen bis zur Repo-Wurzel.
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T900056: superpowers ist in beiden Harnesses deklariert" {
  run python3 - "$REPO" <<'PY'
import json, sys, os, re

repo = sys.argv[1]
missing = []

settings = os.path.join(repo, ".claude", "settings.json")
enabled = json.load(open(settings, encoding="utf-8")).get("enabledPlugins", {})
if not any(k.split("@", 1)[0] == "superpowers" and v is True for k, v in enabled.items()):
    missing.append("Claude Code: kein aktivierter superpowers-Eintrag in enabledPlugins")

oc = open(os.path.join(repo, ".opencode", "opencode.jsonc"), encoding="utf-8").read()
# Zeilenkommentare entfernen: ein auskommentierter Eintrag ist keine Deklaration.
oc = re.sub(r"^\s*//.*$", "", oc, flags=re.M)
if "obra/superpowers" not in oc:
    missing.append("opencode: superpowers fehlt im plugin-Array von .opencode/opencode.jsonc")

if missing:
    print("NOT_DECLARED: " + "; ".join(missing))
    sys.exit(1)
print("OK: superpowers in beiden Harnesses deklariert")
PY
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}

@test "T900056: es gibt einen ausfuehrbaren Weg vom Doctor-Befund zur Installation" {
  # Der Befund allein hat den Ausfall nicht behoben. Erst ein Target, das den
  # deklarierten Zustand herstellt, macht ihn handhabbar.
  run bash -c "cd '$REPO' && task --list-all 2>/dev/null"
  [ "$status" -eq 0 ] || { echo "task --list-all fehlgeschlagen:"; echo "$output"; return 1; }
  echo "$output" | grep -q 'plugins:sync' || {
    echo "kein plugins:sync-Target in der Taskfile-Liste"
    return 1
  }
}

@test "T900056: plugin-doctor nennt bei jedem Befund die Behebung" {
  # Fixture statt echtem ~/.claude: der Doctor ist maschinenlokal, der Test darf es
  # nicht sein. Pfad-Overrides sind die dafuer vorgesehene Schnittstelle (T002448-M4).
  local fix="$BATS_TEST_TMPDIR/fix"
  mkdir -p "$fix/claude-home/plugins"
  printf '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n' \
    > "$fix/repo-settings.json"
  printf '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n' \
    > "$fix/claude-home/settings.json"
  printf '{"version": 2, "plugins": {}}\n' \
    > "$fix/claude-home/plugins/installed_plugins.json"

  PLUGIN_DOCTOR_CLAUDE_HOME="$fix/claude-home" \
  PLUGIN_DOCTOR_REPO_SETTINGS="$fix/repo-settings.json" \
    run bash "$REPO/scripts/plugin-doctor.sh"

  [ "$status" -eq 1 ] || { echo "erwartet Exit 1 (Befund), war $status:"; echo "$output"; return 1; }
  echo "$output" | grep -q 'plugins:sync' || {
    echo "Befund nennt keine ausfuehrbare Behebung:"
    echo "$output"
    return 1
  }
}

@test "T900056: opencode sperrt die Disziplin-Skills, nicht die references" {
  # writing-plans/executing-plans werden von dev-flow-* als Unterschritt gerufen und
  # duerfen keinen Repo-Work-Request selbst beantworten — das uebersprAenge Ticket,
  # Worktree, plan-lint und stage-plan. Die references dagegen tragen den normativen
  # Kern der geteilten dev-flow-Skills und muessen erreichbar sein.
  run python3 - "$REPO" <<'PY'
import sys, os, re

oc = open(os.path.join(sys.argv[1], ".opencode", "opencode.jsonc"), encoding="utf-8").read()
oc = re.sub(r"^\s*//.*$", "", oc, flags=re.M)

block = re.search(r'"skill"\s*:\s*\{(.*?)\n\s*\}', oc, re.S)
if not block:
    print("ANCHOR_FAIL: kein skill-Block in opencode.jsonc")
    sys.exit(1)
entries = dict(re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', block.group(1)))
if not entries:
    print("ANCHOR_FAIL: skill-Block ohne Eintraege")
    sys.exit(1)

problems = []
for name in ("writing-plans", "executing-plans"):
    if entries.get(name) != "deny":
        problems.append(name + " ist nicht auf deny")
if entries.get("references") == "deny":
    problems.append("references steht auf deny und sperrt den dev-flow-Kern")

if problems:
    print("CURATION: " + "; ".join(problems))
    sys.exit(1)
print("OK: %d skill-Eintraege geprueft" % len(entries))
PY
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}

@test "T900056: kein Skill beschreibt einen Plugin-Skill als Harness-Builtin" {
  # Genau diese Formulierung hat den Ausfall unsichtbar gemacht: ein Builtin kann
  # nicht fehlen, also hat niemand die Installation geprueft.
  run python3 - "$REPO" <<'PY'
import sys, os, re

repo = sys.argv[1]
hits = []
for root, _dirs, files in os.walk(os.path.join(repo, ".claude", "skills")):
    for f in files:
        if not f.endswith(".md"):
            continue
        p = os.path.join(root, f)
        for n, line in enumerate(open(p, encoding="utf-8", errors="replace"), 1):
            if "superpowers:" in line and re.search(r"built-?in", line, re.I):
                rel = os.path.relpath(p, repo).replace(os.sep, "/")
                hits.append("%s:%d" % (rel, n))

if hits:
    print("BUILTIN_CLAIM: " + " ".join(hits))
    sys.exit(1)
print("OK: keine Builtin-Behauptung fuer Plugin-Skills")
PY
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}

@test "T900056: kein projektlokaler Skill kollidiert mit einem superpowers-Skillnamen" {
  # openspec/specs/agent-skills.md: genau ein Skill darf auf einen Namen antworten.
  # .claude/skills/superpowers/using-git-worktrees/ deklariert einen Namen, den das
  # installierte Plugin ebenfalls liefert.
  run python3 - "$REPO" <<'PY'
import sys, os, re

repo = sys.argv[1]
PLUGIN_SKILLS = {
    "brainstorming", "dispatching-parallel-agents", "executing-plans",
    "finishing-a-development-branch", "receiving-code-review", "requesting-code-review",
    "subagent-driven-development", "systematic-debugging", "test-driven-development",
    "using-git-worktrees", "using-superpowers", "verification-before-completion",
    "writing-plans", "writing-skills",
}

collisions, seen = [], 0
for root, _dirs, files in os.walk(os.path.join(repo, ".claude", "skills")):
    if "SKILL.md" not in files:
        continue
    p = os.path.join(root, "SKILL.md")
    head = open(p, encoding="utf-8", errors="replace").read(2000)
    m = re.search(r"^name:\s*(.+)$", head, re.M)
    if not m:
        continue
    seen += 1
    name = m.group(1).strip().strip("'\"")
    if name.split(":")[-1] in PLUGIN_SKILLS:
        collisions.append(os.path.relpath(p, repo).replace(os.sep, "/") + " (name: " + name + ")")

if not seen:
    print("ANCHOR_FAIL: keine SKILL.md mit name-Frontmatter gefunden")
    sys.exit(1)
if collisions:
    print("COLLISION: " + "; ".join(sorted(collisions)))
    sys.exit(1)
print("OK: %d Skills geprueft, keine Namenskollision" % seen)
PY
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}
