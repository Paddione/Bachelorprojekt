#!/usr/bin/env bats
# tests/spec/omp-harness.bats — taskfiles/Taskfile.omp.yml + scripts/omp-run.sh [T900793]
#
# omp (oh-my-pi, `@oh-my-pi/pi-coding-agent`, Binary `omp`) ersetzt
# pi-coding-agent (T900529). CLI-Stand: Upstream docs/cli-reference.md —
# `--no-context-files` heisst `--no-rules`, `--skill <pfad>` heisst
# `--skills <globs>`, `--no-prompt-templates`/`--no-themes` entfallen.
#
# Pruefmodus: command output verification. Die Tests rufen das Skript AUS und pruefen
# $status und $output; der Quelltext wird nicht gegreppt (T002448-M4).
#
# Geprueft wird die Level-Leiter des Harness-Runners: L0 startet blank (keine
# Kontextdateien, keine Skills, nur Basis-Tools), L2 erweitert die Tools und haengt
# den Harness-Kontext an, L3 filtert die Skill-Discovery auf die der Rolle `omp`
# explizit zugeteilten Skills. Die Wildcard `all` darf fuer `omp` NICHT greifen —
# der minimale Harness erbt sonst den vollen Katalog. Zusaetzlich fail-closed:
# unbekannte Stufe und nicht erreichbarer Endpunkt (der Probe muss greifen,
# BEVOR omp gestartet wird).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  PLAN="${BATS_TEST_TMPDIR}/plan.md"
  printf '# Smoke-Plan\n\n- [ ] Lege hello.txt an\n' > "$PLAN"
}

@test "omp-harness: Taskfile.omp.yml bietet install, status, uninstall und run mit gepinnter Version" {
  cat > "${BATS_TEST_TMPDIR}/assert_taskfile.py" <<'PYEOF'
import re, sys, yaml
doc = yaml.safe_load(open(sys.argv[1]))
tasks = doc["tasks"]
assert {"install", "status", "uninstall", "run"} <= set(tasks), sorted(tasks)
cmds = "\n".join(str(c) for c in tasks["install"]["cmds"])
assert "@oh-my-pi/pi-coding-agent@" in cmds, cmds
assert "@mariozechner/pi-coding-agent" not in cmds, cmds
pinned = str(doc["vars"]["OMP_VERSION"])
assert re.search(r'default "\d+\.\d+\.\d+"', pinned), pinned
print("OK")
PYEOF
  run python3 "${BATS_TEST_TMPDIR}/assert_taskfile.py" "${REPO_ROOT}/taskfiles/Taskfile.omp.yml"
  [ "$status" -eq 0 ]
  [[ "$output" == *OK* ]]
}

@test "omp-harness: L0 startet blank — ohne Kontextdateien, ohne Skills, nur Basis-Tools" {
  run bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L0 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"--no-rules"* ]]
  [[ "$output" == *"--no-skills"* ]]
  [[ "$output" == *"--no-extensions"* ]]
  [[ "$output" == *"--tools read,write,edit,bash"* ]]
  # `--no-skills` enthaelt die Zeichenfolge `--skill` nicht — der Negativtest ist scharf.
  [[ "$output" != *"--skill"* ]]
  [[ "$output" != *"--append-system-prompt"* ]]
}

@test "omp-harness: L2 erweitert die Tools und haengt den Harness-Kontext an" {
  run bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L2 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"--tools read,write,edit,bash,grep,find,ls"* ]]
  [[ "$output" == *"--append-system-prompt"* ]]
}

@test "omp-harness: L3 filtert die Discovery auf die Skills der Rolle omp" {
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
      roles: [omp]
    skill:shared-skill:
      state: canonical
      use_when: "Darf bei der Rolle omp nicht auftauchen"
      roles: [all]
YAMLEOF
  run env TOOLSET_REGISTRY="$reg" OMP_SKILLS_DIR="$skills" \
    bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L3 --dry-run
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst: die explizit freigegebene Instanz erscheint als --skills-Filter.
  [[ "$output" == *"--skills"* ]]
  [[ "$output" == *"fixture-skill"* ]]
  # Die Wildcard-Freigabe darf fuer die Rolle omp nicht greifen.
  [[ "$output" != *"shared-skill"* ]]
}

@test "omp-harness: unbekannte Stufe bricht fail-closed ab und nennt die gueltigen Stufen" {
  run bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L9 --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" == *"L0 L1 L2 L3"* ]]
}

@test "omp-harness: nicht erreichbarer Endpunkt bricht ab, bevor omp ueberhaupt startet" {
  mkdir -p "${BATS_TEST_TMPDIR}/bin"
  cat > "${BATS_TEST_TMPDIR}/bin/omp" <<'SHEOF'
#!/usr/bin/env bash
echo "STARTED" > "${OMP_STUB_LOG}"
exit 0
SHEOF
  chmod +x "${BATS_TEST_TMPDIR}/bin/omp"
  run env PATH="${BATS_TEST_TMPDIR}/bin:${PATH}" \
      OMP_STUB_LOG="${BATS_TEST_TMPDIR}/omp.log" \
      OMP_LOCAL_BASE_URL="http://127.0.0.1:9" \
      bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L0
  [ "$status" -eq 2 ]
  [[ "$output" == *"http://127.0.0.1:9"* ]]
  [ ! -e "${BATS_TEST_TMPDIR}/omp.log" ]
}

# ---------------------------------------------------------------------------
# Endpunkt-Verbund (Design D5/D6): zwei Stub-Endpunkte mit statischer
# /v1/models-Antwort, dazu ein Port ohne Lauscher. Kein echter Modellserver noetig.

_free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

_start_endpoint() { # <name> <json>
  local dir="${BATS_TEST_TMPDIR}/ep-$1" port
  mkdir -p "${dir}/v1"
  printf '%s' "$2" > "${dir}/v1/models"
  port="$(_free_port)"
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dir" >/dev/null 2>&1 &
  echo $! >> "${BATS_TEST_TMPDIR}/pids"
  for _ in $(seq 1 50); do
    curl -fsS -o /dev/null "http://127.0.0.1:${port}/v1/models" 2>/dev/null && break
    sleep 0.1
  done
  echo "http://127.0.0.1:${port}"
}

_pool() {
  EP1="$(_start_endpoint one '{"data":[{"id":"alpha-model","meta":{"n_ctx":32768}}]}')"
  EP2="$(_start_endpoint two '{"data":[{"id":"beta-model"},{"id":"text-embedding-bge-m3"}]}')"
  export OMP_ENDPOINTS="${EP1},http://127.0.0.1:9,${EP2}"
}

_stub_omp() {
  mkdir -p "${BATS_TEST_TMPDIR}/bin"
  cat > "${BATS_TEST_TMPDIR}/bin/omp" <<'SHEOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${OMP_STUB_LOG}.args"
cp "${PI_CODING_AGENT_DIR}/models.json" "${OMP_STUB_LOG}.models"
echo "$PI_CODING_AGENT_DIR" > "${OMP_STUB_LOG}.dir"
[ -z "${OMP_STUB_TOUCH:-}" ] || echo probe > "$OMP_STUB_TOUCH"
echo '{"type":"agent_end"}'
exit 0
SHEOF
  chmod +x "${BATS_TEST_TMPDIR}/bin/omp"
  export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}" OMP_STUB_LOG="${BATS_TEST_TMPDIR}/omp"
  export XDG_STATE_HOME="${BATS_TEST_TMPDIR}/state"
}

teardown() {
  [ -z "${OMP_STUB_TOUCH:-}" ] || rm -f "$OMP_STUB_TOUCH"
  if [ -f "${BATS_TEST_TMPDIR}/pids" ]; then
    xargs kill < "${BATS_TEST_TMPDIR}/pids" 2>/dev/null || true
  fi
}

@test "omp-harness: --list-models zeigt Chat-Modelle aller erreichbaren Endpunkte und meldet stumme" {
  _pool
  run bash "${REPO_ROOT}/scripts/omp-run.sh" --list-models
  [ "$status" -eq 0 ]
  [[ "$output" == *"alpha-model	${EP1}"* ]]
  [[ "$output" == *"beta-model	${EP2}"* ]]
  [[ "$output" != *"text-embedding"* ]]
  [[ "$output" == *"http://127.0.0.1:9"* ]]
}

@test "omp-harness: --model wird an den Endpunkt geroutet, der das Modell serviert" {
  _pool
  _stub_omp
  run bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L0 --model beta-model --skip-tests
  [ "$status" -eq 0 ]
  provider="$(grep -A1 -x -- '--provider' "${OMP_STUB_LOG}.args" | tail -1)"
  model="$(grep -A1 -x -- '--model' "${OMP_STUB_LOG}.args" | tail -1)"
  [ "$model" = "beta-model" ]
  run jq -r --arg p "$provider" '.providers[$p].baseUrl' "${OMP_STUB_LOG}.models"
  [ "$output" = "${EP2}/v1" ]
  # Das Agent-Verzeichnis gehoert dem Lauf und ist danach weg.
  [ ! -e "$(cat "${OMP_STUB_LOG}.dir")" ]
}

@test "omp-harness: unbekanntes Modell bricht vor dem omp-Start ab und listet die Auswahl" {
  _pool
  _stub_omp
  run bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L0 --model no-such-model --skip-tests
  [ "$status" -eq 2 ]
  [[ "$output" == *"alpha-model"* ]]
  [[ "$output" == *"beta-model"* ]]
  [ ! -e "${OMP_STUB_LOG}.args" ]
}

@test "omp-harness: --json liefert den Bericht als ein JSON-Objekt, --skip-tests meldet test_exit null" {
  _pool
  _stub_omp
  run bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L0 --json --skip-tests
  [ "$status" -eq 0 ]
  last="$(printf '%s\n' "$output" | tail -n 1)"
  run jq -r '[.model, (.omp_exit|tostring), (.test_exit|tostring), .endpoint] | join(" ")' <<<"$last"
  [ "$status" -eq 0 ]
  [ "$output" = "alpha-model 0 null ${EP1}" ]
}

@test "omp-harness: LM-Studio-Endpunkt liefert Typ und Architektur, Embeddings fallen per Typ heraus" {
  local ep dir
  ep="$(_start_endpoint lms '{"data":[]}')"
  dir="${BATS_TEST_TMPDIR}/ep-lms"
  mkdir -p "${dir}/api/v0"
  printf '%s' '{"data":[{"id":"abc123hash","type":"llm","arch":"qwen3","quantization":"Q4_K_XL","state":"not-loaded"},{"id":"nomic","type":"embeddings","arch":"bert","state":"not-loaded"}]}' \
    > "${dir}/api/v0/models"
  run env OMP_LOCAL_BASE_URL="$ep" bash "${REPO_ROOT}/scripts/omp-run.sh" --list-models
  [ "$status" -eq 0 ]
  [[ "$output" == *"abc123hash	${ep}	qwen3 Q4_K_XL not-loaded"* ]]
  [[ "$output" != *"nomic"* ]]
}

@test "omp-harness: changed_files zaehlt nur, was der Lauf selbst geaendert hat" {
  _pool
  _stub_omp
  export OMP_STUB_TOUCH="${REPO_ROOT}/omp-probe-${BATS_TEST_NUMBER}-$$.txt"
  run bash "${REPO_ROOT}/scripts/omp-run.sh" "$PLAN" --level L0 --json --skip-tests
  [ "$status" -eq 0 ]
  run jq -r '.changed_files' <<<"$(printf '%s\n' "$output" | tail -n 1)"
  [ "$output" = "1" ]
}
