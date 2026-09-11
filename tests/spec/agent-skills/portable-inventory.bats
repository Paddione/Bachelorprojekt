#!/usr/bin/env bats
# tests/spec/agent-skills/portable-inventory.bats
# SSOT: openspec/specs/agent-skills.md — Delta: openspec/changes/portable-agent-skills/
# Ticket: T900151, Partial p1 (Inventar + Projektions-Engine)
#
# Prüfmodus (T002448-M4): Command-Output-Verifikation. Jeder Test baut ein
# Fixture-Repo unter `mktemp -d`, führt `scripts/agent-skills/project.mjs` AUS und
# urteilt über Exit-Code und Diagnose-Output — kein Source-Grep auf Interna der Engine.
#
# Die Fixtures leben bewusst in Temp-Verzeichnissen: die Suite muss vor UND nach der
# p2-Korpus-Migration deterministisch sein und darf die echten Skill-Bäume des Repos
# (`.agents/skills`, `.claude/skills`, `.opencode/skills`) niemals verändern.
#
# Diagnosesemantik (Vertrag, von der Engine implementiert):
#   missing-projection             deklarierte Harness-Projektion existiert nicht
#   unexpected-projection          Skill-Verzeichnis existiert, Harness ist nicht deklariert
#   unregistered-skill             Skill-Verzeichnis existiert, Skill-id fehlt im Inventar
#   dangling-source                kanonische Quelle fehlt
#   non-rationalized-exception     Ausschluss oder sync=manual ohne Begründung
#   adapter-mapping-missing        Adapter-Projektion ohne deklariertes Capability-Mapping
#   body-drift                     sync=identical deklariert, Inhalt weicht aber ab
#   symlinked-harness-root         Harness-Wurzel ist ein Symlink (Plattformabhängigkeit)
#   symlinked-projection           deklarierte Projektion ist ein Symlink
#   unknown-harness                aggregierter/fremder Harness-Name (z. B. `both`)
#   invalid-exposure               exposure-Wert außerhalb portable|native|adapter
#   duplicate-skill-id             dieselbe Skill-id zweimal im Inventar
#   projection-outside-harness-root Projekionspfad liegt nicht in der Harness-Wurzel
#   registry-not-found             Inventar-Datei fehlt (Exit 2)
#   write-mode-disabled-in-ci      --write unter CI (Exit 2)

setup() {
  # Diese Datei liegt in tests/spec/agent-skills/ — drei Ebenen bis zur Repo-Wurzel.
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ENGINE="$REPO/scripts/agent-skills/project.mjs"
  REGISTRY_REL="docs/agent-guide/registry/skills.yaml"

  TMP="$(mktemp -d)"
  ROOT="$TMP/root"
  mkdir -p "$ROOT/.agents/skills" \
           "$ROOT/.opencode/skills" \
           "$ROOT/.claude/skills" \
           "$ROOT/$(dirname "$REGISTRY_REL")"
}

teardown() {
  if [ -n "${TMP:-}" ] && [ -d "${TMP:-}" ]; then
    rm -rf "$TMP"
  fi
  return 0
}

# ── Fixture-Helfer ────────────────────────────────────────────────────

# Legt ein Skill-Verzeichnis mit SKILL.md an. Gleiche Argumente => byte-identische
# Bäume; das ist die Grundlage der Hash-Paritäts-Tests.
put_skill() { # put_skill <skills-dir> <id> [body]
  local dir="$1/$2" body="${3:-canonical portable body}"
  mkdir -p "$dir"
  printf -- '---\nname: %s\ndescription: fixture skill\n---\n\n# %s\n\n%s\n' \
    "$2" "$2" "$body" > "$dir/SKILL.md"
}

# Zusätzliche Datei im Skill-Baum (für Mehrdatei-Drift).
put_extra() { # put_extra <skills-dir> <id> <relpath> <content>
  local dir="$1/$2"
  mkdir -p "$dir/$(dirname "$3")"
  printf '%s\n' "$4" > "$dir/$3"
}

# Schreibt die Standard-Kopfzeilen des Inventars und hängt die Skill-Einträge von
# stdin an. `printf '%s\n'` statt Heredoc-Interpolation: ein Skill-Eintrag darf
# `$` und Backticks enthalten, ohne dass Bash sie expandiert.
write_registry() {
  local body
  body="$(cat)"
  {
    printf 'schema_version: 1\n'
    printf 'harnesses:\n'
    printf '  codex:\n'
    printf '    discovery_root: .agents/skills\n'
    printf '  agy:\n'
    printf '    discovery_root: .agents/skills\n'
    printf '  opencode:\n'
    printf '    discovery_root: .opencode/skills\n'
    printf '  claude_code:\n'
    printf '    discovery_root: .claude/skills\n'
    printf 'skills:\n'
    printf '%s\n' "$body"
  } > "$ROOT/$REGISTRY_REL"
}

# Semantische Output-Assertion statt nackter grep-Pipeline: bei Fehlschlag wird der
# vollständige Output mitgeliefert, sonst bliebe die Fehlermeldung inhaltsleer.
assert_has() { # assert_has <fixed-string>
  if ! printf '%s\n' "$output" | grep -qF -- "$1"; then
    echo "ERWARTET im Output: $1" >&2
    echo "--- tatsaechlicher Output ---" >&2
    printf '%s\n' "$output" >&2
    return 1
  fi
}

assert_lacks() { # assert_lacks <fixed-string>
  if printf '%s\n' "$output" | grep -qF -- "$1"; then
    echo "NICHT ERWARTET im Output: $1" >&2
    echo "--- tatsaechlicher Output ---" >&2
    printf '%s\n' "$output" >&2
    return 1
  fi
}

# Findings eines JSON-Laufs darstellungsfrei auswerten (T002716): erzeugt pro Befund
# genau eine Zeile `code|skill|harness`.
json_findings() {
  printf '%s\n' "$output" | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; });
    process.stdin.on("end", () => {
      const j = JSON.parse(s);
      for (const f of j.findings ?? [])
        console.log([f.code, f.skill ?? "-", f.harness ?? "-"].join("|"));
    });'
}

count_findings() { # count_findings <grep-regex über json_findings-Zeilen>
  local n
  n="$(json_findings | grep -c -e "$1" || true)"
  printf '%s' "$n"
}

# ── 1. Positiv-Anker: konsistentes Vier-Harness-Inventar ──────────────

@test "Positiv-Anker: portable Skill mit vier Harnesses und identischen Projektionen ist befangsfrei" {
  put_skill "$ROOT/.agents/skills"   demo-portable
  put_skill "$ROOT/.opencode/skills" demo-portable
  put_skill "$ROOT/.claude/skills"   demo-portable
  write_registry <<'YAML'
  - id: demo-portable
    provenance: project
    exposure: portable
    source: .agents/skills/demo-portable
    harnesses:
      codex:       { path: .agents/skills/demo-portable,   sync: identical }
      agy:         { path: .agents/skills/demo-portable,   sync: identical }
      opencode:    { path: .opencode/skills/demo-portable, sync: identical }
      claude_code: { path: .claude/skills/demo-portable,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  echo "$output"
  [ "$status" -eq 0 ]
  assert_has 'demo-portable'
}

# ── 2. p1-RED-Kernfall: vier Harnesses deklariert, Codex-Projektion fehlt ──

@test "p1-RED: portable fuer vier Harnesses deklariert, Codex-Projektion fehlt — Befund nennt Harness und Skill-id" {
  # OpenCode- und Claude-Projektion sind vorhanden und identisch; die kanonische
  # Quelle unter .agents/skills (und damit die Codex- UND agy-Sicht) fehlt.
  put_skill "$ROOT/.opencode/skills" demo-portable
  put_skill "$ROOT/.claude/skills"   demo-portable
  write_registry <<'YAML'
  - id: demo-portable
    provenance: project
    exposure: portable
    source: .agents/skills/demo-portable
    harnesses:
      codex:       { path: .agents/skills/demo-portable,   sync: identical }
      agy:         { path: .agents/skills/demo-portable,   sync: identical }
      opencode:    { path: .opencode/skills/demo-portable, sync: identical }
      claude_code: { path: .claude/skills/demo-portable,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  # Positiv-Anker: die Engine hat das Fixture ueberhaupt ausgewertet.
  assert_has 'skill=demo-portable'
  assert_has 'missing-projection'
  assert_has 'harness=codex'
  assert_has 'harness=agy'
  assert_has 'dangling-source'
  # Die vorhandenen Projektionen duerfen nicht faelschlich als fehlend gelten.
  assert_lacks 'harness=opencode'
  assert_lacks 'harness=claude_code'
}

@test "p1-RED-Kernfall maschinenlesbar: JSON-Modus liefert code/skill/harness pro Befund" {
  put_skill "$ROOT/.opencode/skills" demo-portable
  put_skill "$ROOT/.claude/skills"   demo-portable
  write_registry <<'YAML'
  - id: demo-portable
    provenance: project
    exposure: portable
    source: .agents/skills/demo-portable
    harnesses:
      codex:       { path: .agents/skills/demo-portable,   sync: identical }
      agy:         { path: .agents/skills/demo-portable,   sync: identical }
      opencode:    { path: .opencode/skills/demo-portable, sync: identical }
      claude_code: { path: .claude/skills/demo-portable,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check --json
  [ "$status" -eq 1 ]
  [ "$(count_findings '^missing-projection|demo-portable|codex$')" -eq 1 ]
  [ "$(count_findings '^missing-projection|demo-portable|agy$')" -eq 1 ]
  [ "$(count_findings '^dangling-source|demo-portable|-')" -eq 1 ]
  [ "$(count_findings '^missing-projection|demo-portable|opencode$')" -eq 0 ]
}

# ── 3. Unerwartete Projektion / undeklarierte Kopie ───────────────────

@test "native Skill mit undeklarierter Kopie in einem anderen Harness wird als Katalog-Drift gemeldet" {
  put_skill "$ROOT/.opencode/skills" demo-native
  # Die Claude-Kopie ist NICHT deklariert — genau das ist der Drift.
  put_skill "$ROOT/.claude/skills"   demo-native
  write_registry <<'YAML'
  - id: demo-native
    provenance: project
    exposure: native
    source: .opencode/skills/demo-native
    harnesses:
      opencode: { path: .opencode/skills/demo-native, sync: identical }
    exclusions:
      codex:       "OpenCode-nativer Runbook-Skill: kein portabler Kern, keine Codex-Sicht."
      agy:         "OpenCode-nativer Runbook-Skill: agy konsumiert die OpenCode-Lane nicht."
      claude_code: "OpenCode-nativer Runbook-Skill: keine Claude-Variante vorgesehen."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'skill=demo-native'
  assert_has 'unexpected-projection'
  assert_has 'harness=claude_code'
  # Positiv-Anker: die deklarierte OpenCode-Sicht ist in Ordnung.
  assert_lacks 'missing-projection'
}

@test "Skill-Verzeichnis ohne Inventar-Eintrag wird als unregistered-skill gemeldet" {
  put_skill "$ROOT/.agents/skills"   demo-known
  put_skill "$ROOT/.opencode/skills" demo-known
  put_skill "$ROOT/.claude/skills"   demo-known
  put_skill "$ROOT/.opencode/skills" demo-ghost
  write_registry <<'YAML'
  - id: demo-known
    provenance: project
    exposure: portable
    source: .agents/skills/demo-known
    harnesses:
      codex:       { path: .agents/skills/demo-known,   sync: identical }
      agy:         { path: .agents/skills/demo-known,   sync: identical }
      opencode:    { path: .opencode/skills/demo-known, sync: identical }
      claude_code: { path: .claude/skills/demo-known,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'unregistered-skill'
  assert_has 'skill=demo-ghost'
  assert_has 'harness=opencode'
  # Positiv-Anker: der registrierte Skill bleibt ohne Befund.
  assert_lacks 'skill=demo-known'
}

@test "lokal installierte Skills aus der Inventar-Ignore-Liste bleiben ohne Befund" {
  put_skill "$ROOT/.agents/skills"   demo-registered
  put_skill "$ROOT/.opencode/skills" demo-registered
  put_skill "$ROOT/.claude/skills"   demo-registered
  put_skill "$ROOT/.opencode/skills" demo-local-only
  {
    printf 'schema_version: 1\n'
    printf 'harnesses:\n'
    printf '  codex:\n    discovery_root: .agents/skills\n'
    printf '  agy:\n    discovery_root: .agents/skills\n'
    printf '  opencode:\n    discovery_root: .opencode/skills\n'
    printf '  claude_code:\n    discovery_root: .claude/skills\n'
    printf 'ignore:\n'
    printf '  - id: demo-local-only\n'
    printf '    rationale: "Lokal via market-cli installiert, nicht getrackt (T001783)."\n'
    printf 'skills:\n'
    printf '  - id: demo-registered\n'
    printf '    provenance: project\n'
    printf '    exposure: portable\n'
    printf '    source: .agents/skills/demo-registered\n'
    printf '    harnesses:\n'
    printf '      codex:       { path: .agents/skills/demo-registered,   sync: identical }\n'
    printf '      agy:         { path: .agents/skills/demo-registered,   sync: identical }\n'
    printf '      opencode:    { path: .opencode/skills/demo-registered, sync: identical }\n'
    printf '      claude_code: { path: .claude/skills/demo-registered,   sync: identical }\n'
    printf '    exclusions: {}\n'
  } > "$ROOT/$REGISTRY_REL"

  run node "$ENGINE" --root "$ROOT" --check
  echo "$output"
  [ "$status" -eq 0 ]
  assert_lacks 'demo-local-only'
}

# ── 4. Dangling source ────────────────────────────────────────────────

@test "fehlende kanonische Quelle wird als dangling-source gemeldet" {
  put_skill "$ROOT/.opencode/skills" demo-lost
  write_registry <<'YAML'
  - id: demo-lost
    provenance: project
    exposure: native
    source: .opencode/skills/demo-lost-missing
    harnesses:
      opencode: { path: .opencode/skills/demo-lost, sync: identical }
    exclusions:
      codex:       "Fixture: Quelle fehlt absichtlich."
      agy:         "Fixture: Quelle fehlt absichtlich."
      claude_code: "Fixture: Quelle fehlt absichtlich."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'dangling-source'
  assert_has 'skill=demo-lost'
}

# ── 5. Nicht begruendete Ausnahmen ────────────────────────────────────

@test "Harness-Ausschluss ohne Begruendung wird als non-rationalized-exception gemeldet" {
  put_skill "$ROOT/.opencode/skills" demo-silent
  write_registry <<'YAML'
  - id: demo-silent
    provenance: project
    exposure: native
    source: .opencode/skills/demo-silent
    harnesses:
      opencode: { path: .opencode/skills/demo-silent, sync: identical }
    exclusions:
      codex:       "Begruendet."
      agy:         ""
      claude_code: "Begruendet."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'non-rationalized-exception'
  assert_has 'harness=agy'
  # Positiv-Anker: die beiden begruendeten Ausschluesse sind unauffaellig.
  assert_lacks 'harness=codex'
  assert_lacks 'harness=claude_code'
}

@test "sync=manual ohne Begruendung wird als non-rationalized-exception gemeldet" {
  put_skill "$ROOT/.agents/skills"   demo-manual
  put_skill "$ROOT/.opencode/skills" demo-manual
  write_registry <<'YAML'
  - id: demo-manual
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-manual
    harnesses:
      codex:    { path: .agents/skills/demo-manual,   sync: identical }
      agy:      { path: .agents/skills/demo-manual,   sync: identical }
      opencode: { path: .opencode/skills/demo-manual, sync: manual }
    exclusions:
      claude_code: "Fixture: nur OpenCode-Adapter."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'non-rationalized-exception'
  assert_has 'harness=opencode'
}

@test "Adapter-Projektion ohne deklariertes Mapping wird als adapter-mapping-missing gemeldet" {
  put_skill "$ROOT/.agents/skills"   demo-adapter
  put_skill "$ROOT/.opencode/skills" demo-adapter "opencode adapter body"
  write_registry <<'YAML'
  - id: demo-adapter
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-adapter
    harnesses:
      codex:    { path: .agents/skills/demo-adapter,   sync: identical }
      agy:      { path: .agents/skills/demo-adapter,   sync: identical }
      opencode:
        path: .opencode/skills/demo-adapter
        sync: manual
        rationale: "OpenCode-Runtime-Identifier weicht ab."
    exclusions:
      claude_code: "Fixture: nur OpenCode-Adapter."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'adapter-mapping-missing'
  assert_has 'skill=demo-adapter'
}

@test "Adapter-Projektion mit deklariertem Mapping besteht die Pruefung trotz abweichendem Inhalt" {
  put_skill "$ROOT/.agents/skills"   demo-adapter
  put_skill "$ROOT/.opencode/skills" demo-adapter "opencode adapter body"
  put_skill "$ROOT/.claude/skills"   demo-adapter "claude adapter body"
  write_registry <<'YAML'
  - id: demo-adapter
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-adapter
    harnesses:
      codex:    { path: .agents/skills/demo-adapter,   sync: identical }
      agy:      { path: .agents/skills/demo-adapter,   sync: identical }
      opencode:
        path: .opencode/skills/demo-adapter
        sync: manual
        rationale: "OpenCode-Runtime-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "ticket-mcp-node_add_comment" }
      claude_code:
        path: .claude/skills/demo-adapter
        sync: manual
        rationale: "Claude-Code-MCP-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "mcp__ticket-mcp-node__add_comment" }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  echo "$output"
  [ "$status" -eq 0 ]
  assert_lacks 'body-drift'
}


# ── 6. Identitaet und Hash-Paritaet ───────────────────────────────────

@test "identical-Projektion mit abweichender SKILL.md wird als body-drift gemeldet" {
  put_skill "$ROOT/.agents/skills"   demo-drift
  put_skill "$ROOT/.opencode/skills" demo-drift "geaenderter OpenCode-Inhalt"
  put_skill "$ROOT/.claude/skills"   demo-drift
  write_registry <<'YAML'
  - id: demo-drift
    provenance: project
    exposure: portable
    source: .agents/skills/demo-drift
    harnesses:
      codex:       { path: .agents/skills/demo-drift,   sync: identical }
      agy:         { path: .agents/skills/demo-drift,   sync: identical }
      opencode:    { path: .opencode/skills/demo-drift, sync: identical }
      claude_code: { path: .claude/skills/demo-drift,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'body-drift'
  assert_has 'skill=demo-drift'
  assert_has 'harness=opencode'
  # Positiv-Anker: die identische Claude-Projektion bleibt ohne Drift-Befund.
  assert_lacks 'harness=claude_code'
}

@test "identical-Projektion mit fehlender Zusaetzdatei wird als body-drift gemeldet" {
  put_skill "$ROOT/.agents/skills"   demo-files
  put_extra "$ROOT/.agents/skills"   demo-files references/example.md "gemeinsame Referenz"
  put_skill "$ROOT/.opencode/skills" demo-files
  write_registry <<'YAML'
  - id: demo-files
    provenance: project
    exposure: portable
    source: .agents/skills/demo-files
    harnesses:
      codex:    { path: .agents/skills/demo-files,   sync: identical }
      agy:      { path: .agents/skills/demo-files,   sync: identical }
      opencode: { path: .opencode/skills/demo-files, sync: identical }
    exclusions:
      claude_code: "Fixture: kein Claude-Harness deklariert."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'body-drift'
  assert_has 'harness=opencode'
}

@test "identical-Projektion mit unerklaerter Zusaetzdatei wird als body-drift gemeldet" {
  put_skill "$ROOT/.agents/skills"   demo-extra
  put_skill "$ROOT/.opencode/skills" demo-extra
  put_extra "$ROOT/.opencode/skills" demo-extra local-note.md "nur OpenCode"
  write_registry <<'YAML'
  - id: demo-extra
    provenance: project
    exposure: portable
    source: .agents/skills/demo-extra
    harnesses:
      codex:    { path: .agents/skills/demo-extra,   sync: identical }
      agy:      { path: .agents/skills/demo-extra,   sync: identical }
      opencode: { path: .opencode/skills/demo-extra, sync: identical }
    exclusions:
      claude_code: "Fixture: kein Claude-Harness deklariert."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'body-drift'
  assert_has 'harness=opencode'
}

@test "mehrdatei-identische Projektionen bestehen die Hash-Paritaet" {
  put_skill "$ROOT/.agents/skills"   demo-multi
  put_extra "$ROOT/.agents/skills"   demo-multi references/example.md "gemeinsame Referenz"
  put_skill "$ROOT/.opencode/skills" demo-multi
  put_extra "$ROOT/.opencode/skills" demo-multi references/example.md "gemeinsame Referenz"
  put_skill "$ROOT/.claude/skills"   demo-multi
  put_extra "$ROOT/.claude/skills"   demo-multi references/example.md "gemeinsame Referenz"
  write_registry <<'YAML'
  - id: demo-multi
    provenance: project
    exposure: portable
    source: .agents/skills/demo-multi
    harnesses:
      codex:       { path: .agents/skills/demo-multi,   sync: identical }
      agy:         { path: .agents/skills/demo-multi,   sync: identical }
      opencode:    { path: .opencode/skills/demo-multi, sync: identical }
      claude_code: { path: .claude/skills/demo-multi,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "generierte Projektions-Metadaten brechen die Identitaetspruefung nicht" {
  put_skill "$ROOT/.agents/skills"   demo-meta
  put_skill "$ROOT/.opencode/skills" demo-meta
  put_skill "$ROOT/.claude/skills"   demo-meta
  printf '{"generatedBy":"scripts/agent-skills/project.mjs"}\n' \
    > "$ROOT/.opencode/skills/demo-meta/.agent-skill-projection.json"
  write_registry <<'YAML'
  - id: demo-meta
    provenance: project
    exposure: portable
    source: .agents/skills/demo-meta
    harnesses:
      codex:       { path: .agents/skills/demo-meta,   sync: identical }
      agy:         { path: .agents/skills/demo-meta,   sync: identical }
      opencode:    { path: .opencode/skills/demo-meta, sync: identical }
      claude_code: { path: .claude/skills/demo-meta,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  echo "$output"
  [ "$status" -eq 0 ]
}

# ── 7. Symlink-Verbot und plattformunabhaengige Kataloge ─────────────

@test "symlinked harness root wird gemeldet, obwohl er auf dieser Plattform aufloest" {
  put_skill "$ROOT/.agents/skills" demo-symroot
  put_skill "$ROOT/.claude/skills" demo-symroot
  rm -rf "$ROOT/.opencode/skills"
  ln -s ../.claude/skills "$ROOT/.opencode/skills"
  write_registry <<'YAML'
  - id: demo-symroot
    provenance: project
    exposure: portable
    source: .agents/skills/demo-symroot
    harnesses:
      codex:       { path: .agents/skills/demo-symroot,   sync: identical }
      agy:         { path: .agents/skills/demo-symroot,   sync: identical }
      opencode:    { path: .opencode/skills/demo-symroot, sync: identical }
      claude_code: { path: .claude/skills/demo-symroot,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'symlinked-harness-root'
  assert_has 'harness=opencode'
  # Positiv-Anker: die Projektion selbst wird nicht zusaetzlich als fehlend gemeldet.
  assert_lacks 'missing-projection'
}

@test "symlinked projection wird gemeldet, obwohl ihr Ziel inhaltlich korrekt ist" {
  put_skill "$ROOT/.agents/skills"   demo-symproj
  put_skill "$ROOT/.claude/skills"   demo-symproj
  ln -s ../../.agents/skills/demo-symproj "$ROOT/.opencode/skills/demo-symproj"
  write_registry <<'YAML'
  - id: demo-symproj
    provenance: project
    exposure: portable
    source: .agents/skills/demo-symproj
    harnesses:
      codex:       { path: .agents/skills/demo-symproj,   sync: identical }
      agy:         { path: .agents/skills/demo-symproj,   sync: identical }
      opencode:    { path: .opencode/skills/demo-symproj, sync: identical }
      claude_code: { path: .claude/skills/demo-symproj,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'symlinked-projection'
  assert_has 'harness=opencode'
  assert_lacks 'body-drift'
}

# ── 8. Registry-Schema und CLI-Vertrag ───────────────────────────────

@test "aggregierter Harness-Name both wird als unknown-harness abgelehnt" {
  put_skill "$ROOT/.agents/skills" demo-schema
  {
    printf 'schema_version: 1\n'
    printf 'harnesses:\n'
    printf '  codex:\n    discovery_root: .agents/skills\n'
    printf '  agy:\n    discovery_root: .agents/skills\n'
    printf '  opencode:\n    discovery_root: .opencode/skills\n'
    printf '  claude_code:\n    discovery_root: .claude/skills\n'
    printf 'skills:\n'
    printf '  - id: demo-schema\n'
    printf '    provenance: project\n'
    printf '    exposure: portable\n'
    printf '    source: .agents/skills/demo-schema\n'
    printf '    harnesses:\n'
    printf '      both: { path: .agents/skills/demo-schema, sync: identical }\n'
    printf '    exclusions: {}\n'
  } > "$ROOT/$REGISTRY_REL"

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 2 ]
  assert_has 'unknown-harness'
  assert_has 'skill=demo-schema'
}

@test "unbekannter exposure-Wert wird als invalid-exposure abgelehnt" {
  put_skill "$ROOT/.agents/skills" demo-exposure
  write_registry <<'YAML'
  - id: demo-exposure
    provenance: project
    exposure: shared
    source: .agents/skills/demo-exposure
    harnesses:
      codex: { path: .agents/skills/demo-exposure, sync: identical }
    exclusions:
      agy:         "Fixture."
      opencode:    "Fixture."
      claude_code: "Fixture."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 2 ]
  assert_has 'invalid-exposure'
  assert_has 'skill=demo-exposure'
}

@test "doppelte Skill-id wird als duplicate-skill-id abgelehnt" {
  put_skill "$ROOT/.agents/skills" demo-dup
  write_registry <<'YAML'
  - id: demo-dup
    provenance: project
    exposure: portable
    source: .agents/skills/demo-dup
    harnesses:
      codex: { path: .agents/skills/demo-dup, sync: identical }
    exclusions:
      agy:         "Fixture."
      opencode:    "Fixture."
      claude_code: "Fixture."
  - id: demo-dup
    provenance: project
    exposure: native
    source: .agents/skills/demo-dup
    harnesses:
      agy: { path: .agents/skills/demo-dup, sync: identical }
    exclusions:
      codex:       "Fixture."
      opencode:    "Fixture."
      claude_code: "Fixture."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 2 ]
  assert_has 'duplicate-skill-id'
  assert_has 'skill=demo-dup'
}

@test "Projektion ausserhalb der Harness-Wurzel wird als projection-outside-harness-root abgelehnt" {
  put_skill "$ROOT/.agents/skills"   demo-outside
  put_skill "$ROOT/.claude/skills"   demo-outside
  write_registry <<'YAML'
  - id: demo-outside
    provenance: project
    exposure: portable
    source: .agents/skills/demo-outside
    harnesses:
      codex: { path: .agents/skills/demo-outside, sync: identical }
      agy:   { path: .agents/skills/demo-outside, sync: identical }
      opencode: { path: .claude/skills/demo-outside, sync: identical }
    exclusions:
      claude_code: "Fixture."
YAML

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 2 ]
  assert_has 'projection-outside-harness-root'
  assert_has 'skill=demo-outside'
  assert_has 'harness=opencode'
}

@test "fehlendes Inventar wird als registry-not-found mit Exit 2 gemeldet" {
  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 2 ]
  assert_has 'registry-not-found'
}

@test "fehlendes Root-Verzeichnis wird als root-not-found mit Exit 2 gemeldet" {
  run node "$ENGINE" --root "$TMP/does-not-exist" --check
  [ "$status" -eq 2 ]
  assert_has 'root-not-found'
}

@test "unbekannte Option wird mit Exit 2 abgelehnt" {
  run node "$ENGINE" --root "$ROOT" --rewrite-everything
  [ "$status" -eq 2 ]
  assert_has 'unknown-option'
}

@test "gleichzeitige Angabe von --check und --write wird mit Exit 2 abgelehnt" {
  run node "$ENGINE" --root "$ROOT" --check --write
  [ "$status" -eq 2 ]
  assert_has 'mode-conflict'
}

@test "ohne Modus-Flag ist der Default check-only" {
  put_skill "$ROOT/.agents/skills" demo-default
  write_registry <<'YAML'
  - id: demo-default
    provenance: project
    exposure: portable
    source: .agents/skills/demo-default
    harnesses:
      codex:       { path: .agents/skills/demo-default,   sync: identical }
      agy:         { path: .agents/skills/demo-default,   sync: identical }
      opencode:    { path: .opencode/skills/demo-default, sync: identical }
      claude_code: { path: .claude/skills/demo-default,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT"
  [ "$status" -eq 1 ]
  assert_has 'missing-projection'
  [ ! -e "$ROOT/.opencode/skills/demo-default" ]
  [ ! -e "$ROOT/.claude/skills/demo-default" ]
}

@test "ein eigenes Registry-File kann explizit angegeben werden" {
  put_skill "$ROOT/.agents/skills"   demo-custom
  put_skill "$ROOT/.opencode/skills" demo-custom
  put_skill "$ROOT/.claude/skills"   demo-custom
  write_registry <<'YAML'
  - id: demo-custom
    provenance: project
    exposure: portable
    source: .agents/skills/demo-custom
    harnesses:
      codex:       { path: .agents/skills/demo-custom,   sync: identical }
      agy:         { path: .agents/skills/demo-custom,   sync: identical }
      opencode:    { path: .opencode/skills/demo-custom, sync: identical }
      claude_code: { path: .claude/skills/demo-custom,   sync: identical }
    exclusions: {}
YAML
  mv "$ROOT/$REGISTRY_REL" "$ROOT/custom-skills.yaml"

  run node "$ENGINE" --root "$ROOT" --registry "$ROOT/custom-skills.yaml" --check
  echo "$output"
  [ "$status" -eq 0 ]
}

# ── 9. Check-only und expliziter Write-Modus ─────────────────────────

@test "--check erzeugt keine Projektionen und veraendert das Fixture nicht" {
  put_skill "$ROOT/.agents/skills" demo-noop
  write_registry <<'YAML'
  - id: demo-noop
    provenance: project
    exposure: portable
    source: .agents/skills/demo-noop
    harnesses:
      codex:       { path: .agents/skills/demo-noop,   sync: identical }
      agy:         { path: .agents/skills/demo-noop,   sync: identical }
      opencode:    { path: .opencode/skills/demo-noop, sync: identical }
      claude_code: { path: .claude/skills/demo-noop,   sync: identical }
    exclusions: {}
YAML
  before="$(find "$ROOT" -type f | sort)"

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'missing-projection'

  after="$(find "$ROOT" -type f | sort)"
  [ "$before" = "$after" ]
  [ ! -e "$ROOT/.opencode/skills/demo-noop" ]
  [ ! -e "$ROOT/.claude/skills/demo-noop" ]
}

@test "--write materialisiert fehlende identical-Projektionen und wird danach clean" {
  put_skill "$ROOT/.agents/skills" demo-write
  put_extra "$ROOT/.agents/skills" demo-write references/example.md "gemeinsame Referenz"
  write_registry <<'YAML'
  - id: demo-write
    provenance: project
    exposure: portable
    source: .agents/skills/demo-write
    harnesses:
      codex:       { path: .agents/skills/demo-write,   sync: identical }
      agy:         { path: .agents/skills/demo-write,   sync: identical }
      opencode:    { path: .opencode/skills/demo-write, sync: identical }
      claude_code: { path: .claude/skills/demo-write,   sync: identical }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --write
  echo "$output"
  [ "$status" -eq 0 ]
  [ -f "$ROOT/.opencode/skills/demo-write/SKILL.md" ]
  [ -f "$ROOT/.claude/skills/demo-write/SKILL.md" ]
  [ -f "$ROOT/.opencode/skills/demo-write/references/example.md" ]
  [ -f "$ROOT/.claude/skills/demo-write/references/example.md" ]
  diff -r "$ROOT/.agents/skills/demo-write" "$ROOT/.opencode/skills/demo-write"
  diff -r "$ROOT/.agents/skills/demo-write" "$ROOT/.claude/skills/demo-write"

  run node "$ENGINE" --root "$ROOT" --check
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "--write ueberschreibt keine manual-Adapter und erzeugt sie auch nicht" {
  put_skill "$ROOT/.agents/skills"   demo-write-manual
  put_skill "$ROOT/.opencode/skills" demo-write-manual "bestehender OpenCode-Adapter"
  write_registry <<'YAML'
  - id: demo-write-manual
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-write-manual
    harnesses:
      codex:    { path: .agents/skills/demo-write-manual,   sync: identical }
      agy:      { path: .agents/skills/demo-write-manual,   sync: identical }
      opencode:
        path: .opencode/skills/demo-write-manual
        sync: manual
        rationale: "OpenCode-Runtime-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "ticket-mcp-node_add_comment" }
      claude_code:
        path: .claude/skills/demo-write-manual
        sync: manual
        rationale: "Claude-Code-MCP-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "mcp__ticket-mcp-node__add_comment" }
    exclusions: {}
YAML

  run node "$ENGINE" --root "$ROOT" --write
  [ "$status" -eq 1 ]
  assert_has 'missing-projection'
  assert_has 'harness=claude_code'
  grep -qF 'bestehender OpenCode-Adapter' "$ROOT/.opencode/skills/demo-write-manual/SKILL.md"
  [ ! -e "$ROOT/.claude/skills/demo-write-manual" ]
}

@test "--write entfernt keine undeklarierten Projektionen" {
  put_skill "$ROOT/.opencode/skills" demo-write-native
  put_skill "$ROOT/.claude/skills"   demo-write-native
  write_registry <<'YAML'
  - id: demo-write-native
    provenance: project
    exposure: native
    source: .opencode/skills/demo-write-native
    harnesses:
      opencode: { path: .opencode/skills/demo-write-native, sync: identical }
    exclusions:
      codex:       "Fixture: nativer OpenCode-Skill."
      agy:         "Fixture: nativer OpenCode-Skill."
      claude_code: "Fixture: nativer OpenCode-Skill."
YAML

  run node "$ENGINE" --root "$ROOT" --write
  [ "$status" -eq 1 ]
  assert_has 'unexpected-projection'
  [ -f "$ROOT/.claude/skills/demo-write-native/SKILL.md" ]

  run node "$ENGINE" --root "$ROOT" --check
  [ "$status" -eq 1 ]
  assert_has 'unexpected-projection'
}

@test "--write wird in CI verweigert und veraendert nichts" {
  put_skill "$ROOT/.agents/skills" demo-ci-write
  write_registry <<'YAML'
  - id: demo-ci-write
    provenance: project
    exposure: portable
    source: .agents/skills/demo-ci-write
    harnesses:
      codex:       { path: .agents/skills/demo-ci-write,   sync: identical }
      agy:         { path: .agents/skills/demo-ci-write,   sync: identical }
      opencode:    { path: .opencode/skills/demo-ci-write, sync: identical }
      claude_code: { path: .claude/skills/demo-ci-write,   sync: identical }
    exclusions: {}
YAML

  run env CI=true node "$ENGINE" --root "$ROOT" --write
  [ "$status" -eq 2 ]
  assert_has 'write-mode-disabled-in-ci'
  [ ! -e "$ROOT/.opencode/skills/demo-ci-write" ]
  [ ! -e "$ROOT/.claude/skills/demo-ci-write" ]
}

# ── 10. Live-Registry: Schema stabil, Korpus-Migration bleibt p2 ─────

@test "live: das Repo-Inventar ist schema-frei und der Check erlaubt nur Dateibefunde" {
  run node "$ENGINE" --root "$REPO" --check --json
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]

  catalog_size="$(printf '%s\n' "$output" | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; });
    process.stdin.on("end", () => {
      const j = JSON.parse(s);
      console.log((j.catalog ?? []).length);
    });')"
  [ "$catalog_size" -gt 0 ]

  schema_errors="$(count_findings '^\(registry-not-found\|root-not-found\|unknown-harness\|invalid-exposure\|duplicate-skill-id\|projection-outside-harness-root\|adapter-mapping-missing\|non-rationalized-exception\|invalid-schema\)')"
  [ "$schema_errors" -eq 0 ]
}

@test "live: das Inventar deklariert genau die vier Ziel-Harnesses" {
  run node "$ENGINE" --root "$REPO" --check --json
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]

  harness_ids="$(printf '%s\n' "$output" | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; });
    process.stdin.on("end", () => {
      const j = JSON.parse(s);
      console.log((j.harnesses ?? []).map((h) => h.id).sort().join(","));
    });')"
  [ "$harness_ids" = "agy,claude_code,codex,opencode" ]
}

@test "live: jeder git-getrackte Skill-id ist im Inventar katalogisiert oder bewusst ignoriert" {
  run node "$ENGINE" --root "$REPO" --check --json
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]

  printf '%s\n' "$output" | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; });
    process.stdin.on("end", () => {
      const j = JSON.parse(s);
      const ids = new Set();
      for (const c of j.catalog ?? []) ids.add(c.id);
      for (const ig of j.ignored ?? []) ids.add(ig.id);
      console.log([...ids].sort().join("\n"));
    });' > "$TMP/registry-ids.txt"

  git -C "$REPO" ls-files \
    '.agents/skills/*/SKILL.md' \
    '.claude/skills/*/SKILL.md' \
    '.opencode/skills/*/SKILL.md' \
    | awk -F/ '{ print $(NF - 1) }' \
    | sort -u > "$TMP/tracked-ids.txt"

  # Positiv-Anker: die Suite prüft eine echte, nicht-leere Skill-Menge.
  [ -s "$TMP/tracked-ids.txt" ]

  missing="$(comm -23 "$TMP/tracked-ids.txt" "$TMP/registry-ids.txt")"
  [ -z "$missing" ]
}
