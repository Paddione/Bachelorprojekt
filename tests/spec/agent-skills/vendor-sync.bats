#!/usr/bin/env bats
# tests/spec/agent-skills/vendor-sync.bats
# SSOT: openspec/specs/agent-skills.md — Runbook: docs/runbooks/vendor-sync.md
#
# scripts/vendor-sync.py hebt extern bezogene Skills/Plugins nächtlich auf die neueste
# Release. Die Vendor-Kopien tragen lokale Patches (z. B. der Consent-Gate in lavish,
# die .agents/-Pfade in gitops-repo-audit) — ein blindes Überschreiben würde sie still
# verwerfen. Deshalb 3-Wege-Merge gegen den gelockten Upstream-Commit.
#
# Prüfmodus [T002448-M4]: OUTPUT-VERIFIKATION. Jeder Test baut ein Fixture-Repo und
# lokale Upstream-Git-Repos unter $BATS_TEST_TMPDIR, FÜHRT das Skript aus und urteilt
# über Exit-Code, Report-JSON und den resultierenden Dateiinhalt. Kein Netzwerk: die
# Upstreams sind lokale Pfade, der Klon-Cache liegt im Temp-Verzeichnis.
#
# Fixture-Namen (zq-*) sind so gewählt, dass sie in keinem Worktree-Pfad vorkommen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO/scripts/vendor-sync.py"
  T="$BATS_TEST_TMPDIR"
  export VENDOR_SYNC_CACHE="$T/cache"
  export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid
  export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
  export GIT_CONFIG_GLOBAL=/dev/null

  # Upstream mit einem Skill, Release v1.0.0
  UP="$T/up-skills"
  mkdir -p "$UP/skills/zq-demo"
  git -C "$UP" init -q -b main
  printf -- '---\nname: zq-demo\ndescription: demo\n---\n\nzeile-a\nzeile-b\nzeile-c\nzeile-d\nzeile-e\n' \
    > "$UP/skills/zq-demo/SKILL.md"
  git -C "$UP" add -A && git -C "$UP" commit -qm v1 && git -C "$UP" tag v1.0.0
  BASE_SHA="$(git -C "$UP" rev-parse HEAD)"

  # Fixture-Repo: Vendor-Kopie mit lokalem Patch in zeile-e
  ROOT="$T/root"
  mkdir -p "$ROOT/.opencode/skills/zq-demo" "$ROOT/docs/agent-guide/registry"
  sed 's/^zeile-e$/zeile-e LOKALER-PATCH/' "$UP/skills/zq-demo/SKILL.md" \
    > "$ROOT/.opencode/skills/zq-demo/SKILL.md"
  write_lock
}

write_lock() {
  cat > "$ROOT/docs/agent-guide/registry/vendor-lock.json" <<EOF
{
  "schema_version": 1,
  "skills": {
    "zq-demo": {"repo": "$UP", "path": "skills/zq-demo", "dest": ".opencode/skills/zq-demo",
                "track": "release", "ref": "$BASE_SHA", "version": "v1.0.0"}
  },
  "plugins": {}
}
EOF
}

upstream_release() { # $1 = sed-Ausdruck, $2 = Tag
  sed -i "$1" "$UP/skills/zq-demo/SKILL.md"
  git -C "$UP" commit -qam "$2" && git -C "$UP" tag "$2"
}

@test "update: Upstream-Änderung wird übernommen, lokaler Patch bleibt erhalten" {
  upstream_release 's/^zeile-a$/zeile-a UPSTREAM-NEU/' v1.1.0
  run python3 "$SYNC" update --root "$ROOT" --report "$T/r.json"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  run cat "$ROOT/.opencode/skills/zq-demo/SKILL.md"
  echo "$output" | grep -qF 'zeile-a UPSTREAM-NEU'
  echo "$output" | grep -qF 'zeile-e LOKALER-PATCH'
  run python3 -c 'import json,sys; e=json.load(open(sys.argv[1]))["skills"]["zq-demo"]; print(e["version"], e["ref"])' \
    "$ROOT/docs/agent-guide/registry/vendor-lock.json"
  [ "$output" = "v1.1.0 $(git -C "$UP" rev-parse v1.1.0)" ]
}

@test "update: Konflikt wird gemeldet (Exit 1) und von check als Befund erkannt" {
  upstream_release 's/^zeile-e$/zeile-e UPSTREAM-ANDERS/' v1.1.0
  run python3 "$SYNC" update --root "$ROOT" --report "$T/r.json"
  [ "$status" -eq 1 ]
  run python3 -c 'import json,sys; s=json.load(open(sys.argv[1]))["skills"][0]; print(s["status"], s["conflicts"][0]["file"])' "$T/r.json"
  [ "$output" = "conflict SKILL.md" ]
  run python3 "$SYNC" check --root "$ROOT" --no-network
  [ "$status" -eq 1 ]
  echo "$output" | grep -qF 'unresolved-conflict: .opencode/skills/zq-demo/SKILL.md'
}

@test "release-tracking: höchste stabile SemVer gewinnt, Prerelease wird ignoriert" {
  upstream_release 's/^zeile-b$/zeile-b neun/' v1.9.0
  upstream_release 's/^zeile-b neun$/zeile-b zehn/' v1.10.0
  upstream_release 's/^zeile-b zehn$/zeile-b rc/' v2.0.0-rc1
  run python3 "$SYNC" status --root "$ROOT" --report "$T/r.json"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  run python3 -c 'import json,sys; s=json.load(open(sys.argv[1]))["skills"][0]; print(s["status"], s["to"])' "$T/r.json"
  [ "$output" = "available v1.10.0" ]
}

@test "status schreibt nichts" {
  upstream_release 's/^zeile-a$/zeile-a UPSTREAM-NEU/' v1.1.0
  before="$(cat "$ROOT/.opencode/skills/zq-demo/SKILL.md" "$ROOT/docs/agent-guide/registry/vendor-lock.json")"
  run python3 "$SYNC" status --root "$ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'available'
  [ "$before" = "$(cat "$ROOT/.opencode/skills/zq-demo/SKILL.md" "$ROOT/docs/agent-guide/registry/vendor-lock.json")" ]
}

@test "check: Referenz auf einen im Plugin-Release fehlenden Skill ist ein Befund" {
  PL="$T/up-plugin"
  mkdir -p "$PL/skills/zq-alpha"
  git -C "$PL" init -q -b main
  printf -- '---\nname: zq-alpha\n---\n' > "$PL/skills/zq-alpha/SKILL.md"
  git -C "$PL" add -A && git -C "$PL" commit -qm v1 && git -C "$PL" tag v1.0.0
  PSHA="$(git -C "$PL" rev-parse HEAD)"
  printf 'pin %s\n' "$PSHA" > "$ROOT/pins.txt"
  printf 'nutze zqplug:zq-alpha und zqplug:zq-gamma\n' > "$ROOT/flow.md"
  python3 - "$ROOT/docs/agent-guide/registry/vendor-lock.json" "$PL" "$PSHA" <<'PY'
import json, sys
p, repo, sha = sys.argv[1:]
d = json.load(open(p))
d["plugins"] = {"git": {"zqplug": {"repo": repo, "track": "release", "skills_dir": "skills",
    "reference_pattern": "zqplug:([a-z0-9][a-z0-9-]*)", "pins": ["pins.txt"], "ref": sha, "version": "v1.0.0"}}}
json.dump(d, open(p, "w"))
PY
  run python3 "$SYNC" check --root "$ROOT"
  [ "$status" -eq 1 ]
  # Positiv-Anker: der vorhandene Skill wird aufgelöst, der fehlende gemeldet
  echo "$output" | grep -qF 'dangling-plugin-reference: zqplug:zq-gamma'
  run bash -c "python3 '$SYNC' check --root '$ROOT' 2>/dev/null | grep -cF 'zqplug:zq-alpha ' || true"
  [ "$output" = "0" ]
}

@test "update: Git-Plugin-Pin wird in allen Pin-Dateien angehoben" {
  PL="$T/up-plugin"
  mkdir -p "$PL/skills/zq-alpha"
  git -C "$PL" init -q -b main
  printf -- '---\nname: zq-alpha\n---\n' > "$PL/skills/zq-alpha/SKILL.md"
  git -C "$PL" add -A && git -C "$PL" commit -qm v1 && git -C "$PL" tag v1.0.0
  OLD="$(git -C "$PL" rev-parse HEAD)"
  printf 'x\n' >> "$PL/skills/zq-alpha/SKILL.md"
  git -C "$PL" commit -qam v2 && git -C "$PL" tag v2.0.0
  NEW="$(git -C "$PL" rev-parse HEAD)"
  printf '"zqplug": "git+%s#%s"\n' "$PL" "$OLD" > "$ROOT/pins.txt"
  python3 - "$ROOT/docs/agent-guide/registry/vendor-lock.json" "$PL" "$OLD" <<'PY'
import json, sys
p, repo, sha = sys.argv[1:]
d = json.load(open(p))
d["plugins"] = {"git": {"zqplug": {"repo": repo, "track": "release", "pins": ["pins.txt"], "ref": sha, "version": "v1.0.0"}}}
json.dump(d, open(p, "w"))
PY
  run python3 "$SYNC" update --root "$ROOT" --only zqplug
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  grep -qF "#$NEW" "$ROOT/pins.txt"
  run python3 "$SYNC" check --root "$ROOT" --no-network
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "Repo: Lock, Inventar und Vendor-Kopien sind konsistent (offline)" {
  run python3 "$SYNC" check --no-network
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -qF 'sauber'
}
