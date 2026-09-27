#!/usr/bin/env bats
# tests/spec/pi-harness.bats — taskfiles/Taskfile.pi.yml + scripts/pi-run.sh [T900529]
#
# Pruefmodus: command output verification. Die Tests rufen das Skript AUS und pruefen
# $status und $output; der Quelltext wird nicht gegreppt (T002448-M4).
#
# Geprueft wird die Level-Leiter des Harness-Runners: L0 startet blank (keine
# Kontextdateien, keine Skills, nur Basis-Tools), L2 erweitert die Tools und haengt
# den Harness-Kontext an, L3 darueber hinaus die Skills der Rolle `pi`. Die Wildcard
# `all` darf fuer `pi` NICHT greifen — der minimale Harness erbt sonst den vollen
# Katalog. Zusaetzlich fail-closed: unbekannte Stufe und nicht erreichbarer Endpunkt
# (der Probe muss greifen, BEVOR pi gestartet wird).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  PLAN="${BATS_TEST_TMPDIR}/plan.md"
  printf '# Smoke-Plan\n\n- [ ] Lege hello.txt an\n' > "$PLAN"
}

@test "pi-harness: Taskfile.pi.yml bietet install, status, uninstall und run mit gepinnter Version" {
  cat > "${BATS_TEST_TMPDIR}/assert_taskfile.py" <<'PYEOF'
import re, sys, yaml
doc = yaml.safe_load(open(sys.argv[1]))
tasks = doc["tasks"]
assert {"install", "status", "uninstall", "run"} <= set(tasks), sorted(tasks)
cmds = "\n".join(str(c) for c in tasks["install"]["cmds"])
assert "@mariozechner/pi-coding-agent@" in cmds, cmds
pinned = str(doc["vars"]["PI_VERSION"])
assert re.search(r'default "\d+\.\d+\.\d+"', pinned), pinned
print("OK")
PYEOF
  run python3 "${BATS_TEST_TMPDIR}/assert_taskfile.py" "${REPO_ROOT}/taskfiles/Taskfile.pi.yml"
  [ "$status" -eq 0 ]
  [[ "$output" == *OK* ]]
}

@test "pi-harness: L0 startet blank — ohne Kontextdateien, ohne Skills, nur Basis-Tools" {
  run bash "${REPO_ROOT}/scripts/pi-run.sh" "$PLAN" --level L0 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"--no-context-files"* ]]
  [[ "$output" == *"--no-skills"* ]]
  [[ "$output" == *"--no-extensions"* ]]
  [[ "$output" == *"--tools read,write,edit,bash"* ]]
  # `--no-skills` enthaelt die Zeichenfolge `--skill` nicht — der Negativtest ist scharf.
  [[ "$output" != *"--skill"* ]]
  [[ "$output" != *"--append-system-prompt"* ]]
}

@test "pi-harness: L2 erweitert die Tools und haengt den Harness-Kontext an" {
  run bash "${REPO_ROOT}/scripts/pi-run.sh" "$PLAN" --level L2 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"--tools read,write,edit,bash,grep,find,ls"* ]]
  [[ "$output" == *"--append-system-prompt"* ]]
}

@test "pi-harness: L3 haengt nur die Skills an, die der Rolle pi explizit zugeteilt sind" {
  local reg="${BATS_TEST_TMPDIR}/capabilities.yaml"
  local skills="${BATS_TEST_TMPDIR}/.claude/skills"
  mkdir -p "${skills}/fixture-skill"
  printf -- '---\nname: fixture-skill\ndescription: Fixture-Skill fuer den Harness-Test\n---\n' \
    > "${skills}/fixture-skill/SKILL.md"
  cat > "$reg" <<'YAMLEOF'
capabilities:
  demo-fixture:
    skill:fixture-skill:
      state: canonical
      use_when: "Nur fuer den Harness-Test"
      roles: [pi]
    skill:shared-skill:
      state: canonical
      use_when: "Darf bei der Rolle pi nicht auftauchen"
      roles: [all]
YAMLEOF
  run env TOOLSET_REGISTRY="$reg" PI_SKILLS_DIR="$skills" \
    bash "${REPO_ROOT}/scripts/pi-run.sh" "$PLAN" --level L3 --dry-run
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst: die explizit freigegebene Instanz erscheint mit Pfad.
  [[ "$output" == *".claude/skills/fixture-skill/SKILL.md"* ]]
  # Die Wildcard-Freigabe darf fuer die Rolle pi nicht greifen.
  [[ "$output" != *"shared-skill"* ]]
}

@test "pi-harness: unbekannte Stufe bricht fail-closed ab und nennt die gueltigen Stufen" {
  run bash "${REPO_ROOT}/scripts/pi-run.sh" "$PLAN" --level L9 --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"L0 L1 L2 L3"* ]]
}

@test "pi-harness: nicht erreichbarer Endpunkt bricht ab, bevor pi ueberhaupt startet" {
  mkdir -p "${BATS_TEST_TMPDIR}/bin"
  cat > "${BATS_TEST_TMPDIR}/bin/pi" <<'SHEOF'
#!/usr/bin/env bash
echo "STARTED" > "${PI_STUB_LOG}"
exit 0
SHEOF
  chmod +x "${BATS_TEST_TMPDIR}/bin/pi"
  run env PATH="${BATS_TEST_TMPDIR}/bin:${PATH}" \
      PI_STUB_LOG="${BATS_TEST_TMPDIR}/pi.log" \
      PI_LOCAL_BASE_URL="http://127.0.0.1:9" \
      bash "${REPO_ROOT}/scripts/pi-run.sh" "$PLAN" --level L0
  [ "$status" -eq 2 ]
  [[ "$output" == *"http://127.0.0.1:9"* ]]
  [ ! -e "${BATS_TEST_TMPDIR}/pi.log" ]
}
