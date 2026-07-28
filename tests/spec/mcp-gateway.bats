#!/usr/bin/env bats
# tests/spec/mcp-gateway.bats
# SSOT: openspec/specs/mcp-gateway.md
#
# Covers: OAuth2 proxy MCP bypass, MCP server registration, ops agent output-trust.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── OAuth2 Proxy MCP Path Bypass ──────────────────────────────────────

@test "oauth2-proxy-dev.yaml exists" {
  [ -f "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml" ]
}

@test "oauth2-proxy-dev.yaml has --skip-auth-route for MCP paths" {
  run grep -q 'skip-auth-route' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

@test "oauth2-proxy-dev.yaml bypass includes kubernetes MCP path" {
  run grep -q 'kubernetes' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

@test "oauth2-proxy-dev.yaml bypass includes postgres MCP path" {
  run grep -q 'postgres' "$REPO/k3d/dev-stack/oauth2-proxy-dev.yaml"
  [ "$status" -eq 0 ]
}

# ── MCP Registry SSOT (abgelöst: hartcodierte .mcp.json-Tests) ──────────

@test "SSOT registry mcp.yaml exists with clients and cluster" {
  [ -f "$REPO/docs/agent-guide/registry/mcp.yaml" ]
  run bash -c "node -e \"const fs=require('fs'),y=require('yaml');const d=y.parse(fs.readFileSync('$REPO/docs/agent-guide/registry/mcp.yaml','utf8'));console.log(Object.keys(d.clients).length,Object.keys(d.cluster).length)\""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+[[:space:]]+[0-9]+ ]]
}

@test "mcp-sync.sh check passes (registry matches generated configs)" {
  run bash "$REPO/scripts/mcp-sync.sh" check
  echo "output: $output"
  [ "$status" -eq 0 ]
}

@test "mcp-sync.sh check is read-only (never writes)" {
  local before_sum after_sum
  before_sum=$(md5sum "$REPO/.mcp.json" "$REPO/.opencode/opencode.jsonc" 2>/dev/null | md5sum)
  run bash "$REPO/scripts/mcp-sync.sh" check
  after_sum=$(md5sum "$REPO/.mcp.json" "$REPO/.opencode/opencode.jsonc" 2>/dev/null | md5sum)
  echo "before: $before_sum after: $after_sum"
  [ "$before_sum" = "$after_sum" ]
}

@test "mcp-sync.sh check skips agy target with visible message" {
  if [ -f "$HOME/.gemini/config/mcp_config.json" ]; then
    skip "agy target exists on this machine — test only applies in CI"
  fi
  run bash "$REPO/scripts/mcp-sync.sh" check
  echo "output: $output"
  [[ "$output" =~ skipped ]]
}

# ── mcp-postgres Brand-Bindung (T002278) ──────────────────────────────
# Der Server auf :13001 haengt fest an der mentolder-DB. `external_id` ist nur
# pro Brand eindeutig, eine Abfrage nach einer korczewski-ID liefert daher still
# das gleichnamige mentolder-Ticket. Die Bindung muss maschinenlesbar in der
# Registry stehen und in der Prosa-SSOT als Routing-Regel dokumentiert sein.

@test "registry declares mcp-postgres brand binding and target database" {
  run bash -c "node -e \"const fs=require('fs'),y=require('yaml');const d=y.parse(fs.readFileSync('$REPO/docs/agent-guide/registry/mcp.yaml','utf8'));const c=d.clients['mcp-postgres'];if(c.brand!=='mentolder')process.exit(1);if(!c.database)process.exit(1);console.log('ok')\""
  echo "output: $output"
  [ "$status" -eq 0 ]
}

@test "registry names the sanctioned korczewski read path for mcp-postgres" {
  run bash -c "node -e \"const fs=require('fs'),y=require('yaml');const d=y.parse(fs.readFileSync('$REPO/docs/agent-guide/registry/mcp.yaml','utf8'));const c=d.clients['mcp-postgres'];if(!c.korczewski_path)process.exit(1);if(!/workspace-korczewski/.test(c.korczewski_path))process.exit(1);console.log('ok')\""
  echo "output: $output"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide warns that mcp-postgres is brand-scoped to mentolder" {
  run grep -qi 'brand-gebunden\|brand-scoped\|nur die mentolder-DB' \
    "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide routes ticket reads to ticket-mcp with explicit brand" {
  run grep -q 'T002278' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "CLAUDE.md routing table no longer sells mcp-postgres as the ticket-query path" {
  # [T002375-p7] Positiv-Anker ZUERST. Ohne ihn bestuende dieser Test auch dann, wenn
  # CLAUDE.md fehlt, umbenannt wurde oder $REPO falsch aufgeloest ist — "nicht gefunden"
  # und "gibt es nicht" sind fuer grep dasselbe. Genau diese Klasse (T002356-M1) ist der
  # Gegenstand dieses Partials.
  [ -f "$REPO/CLAUDE.md" ] || { echo "CLAUDE.md nicht gefunden — der Test haette vakuos bestanden"; false; }
  run grep -q 'mcp-postgres' "$REPO/CLAUDE.md"
  [ "$status" -eq 0 ] || { echo "CLAUDE.md erwaehnt mcp-postgres gar nicht mehr — Anker pruefen"; false; }

  run grep -q 'mcp-postgres` (localhost:13001) — Ticket-Queries' "$REPO/CLAUDE.md"
  [ "$status" -ne 0 ]
}

@test "cluster container names match deployment manifest" {
  run grep -c '"name": "keycloak"\|"name": "playwright"\|"name": "github"' \
    "$REPO/k3d/default/claude-code-mcp-monolith-deploy.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 3 ]
}

# ── Ops Agent Output-Trust Guardrails ─────────────────────────────────

@test "bachelorprojekt-ops.md exists" {
  [ -f "$REPO/.claude/agents/bachelorprojekt-ops.md" ]
}

@test "ops agent has Output trust & shell-session integrity section" {
  run grep -qi 'output.*trust\|shell.*session.*integrity' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

@test "ops agent warns against fabricating diagnosis from unverified output" {
  run grep -qi 'fabricate\|do not conclude\|never.*diagnose.*unverified' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

@test "ops agent prescribes kubectl get nodes as verification probe" {
  run grep -q 'kubectl get nodes' "$REPO/.claude/agents/bachelorprojekt-ops.md"
  [ "$status" -eq 0 ]
}

# ── repo-built MCP servers: PATH name, not absolute path (T002301) ────

@test "T002301: no repo-built MCP server is referenced by an absolute home path" {
  local reg="$REPO/docs/agent-guide/registry/mcp.yaml"
  [ -f "$reg" ]
  # Nur Server, die AUS DIESEM REPO gebaut werden — sie koennen per Build-Task auf den
  # PATH installiert werden. Fremde Server (task-master-ai = npm-Paket, codebase-memory-mcp
  # = extern nach ~/.local/bin installiert) sind ausgenommen: ihr Pfad ist nicht durch
  # einen Build-Schritt dieses Repos beeinflussbar.
  local server fail=0
  for server in ticket-mcp mcp-task-runner factory-mcp; do
    local block hits
    block="$(awk -v s="^  ${server}:$" '$0 ~ s {f=1; next} f && /^  [a-z]/ {exit} f' "$reg")"
    hits="$(printf '%s\n' "$block" | grep -nE '^\s*command: */home/' || true)"
    [ -z "$hits" ] || { echo "$server wird ueber einen absoluten Home-Pfad gestartet:"; echo "$hits"; fail=1; }
  done
  [ "$fail" -eq 0 ]
}

@test "T002301: ticket-mcp is referenced by PATH name" {
  local reg="$REPO/docs/agent-guide/registry/mcp.yaml"
  run grep -A3 '^  ticket-mcp:' "$reg"
  [ "$status" -eq 0 ]
  [[ "$output" == *"command: ticket-mcp-go"* ]] \
    || { echo "ticket-mcp wird nicht ueber den PATH-Namen referenziert:"; echo "$output"; return 1; }
}

@test "T002301: ticket-mcp:build installs onto the PATH like mcp-task-runner" {
  # Ohne Install-Schritt bleibt das Binary im Repo liegen und der PATH-Name greift ins Leere.
  run grep -A12 '^  ticket-mcp:build:' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
  [[ "$output" == *"/usr/local/bin"* ]] \
    || { echo "ticket-mcp:build installiert nicht auf den PATH:"; echo "$output"; return 1; }
}

# ── MCP Postgres Bridge Child-Process Containment (T002321) ────────────
#
# Der postgres-Container wurde 56x OOMKilled: supergateway --stateless spawnt
# pro MCP-Request einen mcp-server-postgres-Kindprozess (~54Mi RSS) und reaped
# ihn nie; die RSS-Summe erreicht nach ~10h das 2Gi-cgroup-Limit.

MONOLITH_MANIFEST_REL="k3d/default/claude-code-mcp-monolith-deploy.yaml"

# Startkommando (args[0]) des postgres-Containers aus dem JSON-Manifest.
pg_container_args() {
  jq -r '.spec.template.spec.containers[] | select(.name=="postgres") | .args[0]' \
    "$REPO/$MONOLITH_MANIFEST_REL"
}

pg_memory_limit() {
  jq -r '.spec.template.spec.containers[] | select(.name=="postgres") | .resources.limits.memory' \
    "$REPO/$MONOLITH_MANIFEST_REL"
}

@test "monolith deployment manifest exists" {
  [ -f "$REPO/$MONOLITH_MANIFEST_REL" ]
}

@test "postgres container reaps accumulated mcp-server-postgres children" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'reap|REAP'"
  [ "$status" -eq 0 ]
}

@test "postgres container pins supergateway to an explicit version" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'supergateway@[0-9]+\.[0-9]+\.[0-9]+'"
  [ "$status" -eq 0 ]
}

@test "postgres container pins @modelcontextprotocol/server-postgres to an explicit version" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq '@modelcontextprotocol/server-postgres@[0-9]+\.[0-9]+\.[0-9]+'"
  [ "$status" -eq 0 ]
}

@test "postgres container logs child count so growth is visible before the kill" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'child|children'"
  [ "$status" -eq 0 ]
}

@test "postgres memory limit is below 2Gi so a regression surfaces in hours" {
  limit="$(pg_memory_limit)"
  # Erwartet: Mi-Wert unter 2048Mi. 2Gi versteckt den Leak ~10h lang.
  [[ "$limit" =~ ^([0-9]+)Mi$ ]] || { echo "limit '$limit' ist nicht in Mi angegeben"; return 1; }
  [ "${BASH_REMATCH[1]}" -lt 2048 ]
}

# ── Reaper Candidate Selection (T002350) ──────────────────────────────
#
# Regress aus T002321: die Auswahl lief als Substring-Grep ueber die volle
# cmdline und traf damit PID 1 (supergateway fuehrt den Namen in seinem
# --stdio-Argument) sowie die Reaper-Subshell (erbt die Startskript-cmdline).
# Die Tests oben pruefen nur, DASS 'reap'/'child' im Startkommando steht —
# ein falsch selektierender Reaper ist davon nicht unterscheidbar. Diese
# Tests pruefen die AUSWAHL selbst.

# Legt einen Fixture-Prozesseintrag an: mk_proc <root> <pid> <ppid> <starttime> <argv...>
mk_proc() {
  local root="$1" pid="$2" ppid="$3" start="$4"; shift 4
  local d="$root/$pid" a i
  mkdir -p "$d"
  : > "$d/cmdline"
  for a in "$@"; do printf '%s\0' "$a" >> "$d/cmdline"; done
  # /proc/<pid>/stat: Feld 1=pid 2=comm 3=state 4=ppid … 22=starttime
  { printf '%s (node) S %s' "$pid" "$ppid"
    for i in $(seq 5 21); do printf ' 0'; done
    printf ' %s\n' "$start"
  } > "$d/stat"
  printf 'VmRSS:\t13000 kB\n' > "$d/status"
}

# Bildet den am 2026-07-27 real gemessenen Prozessbaum nach.
mk_fixture() {
  local root="$1"
  # PID 1 — supergateway-Parent: traegt den gesuchten Namen erst in argv[2]
  mk_proc "$root" 1 0 100 \
    node /usr/local/bin/supergateway --stdio 'mcp-server-postgres "postgresql://x"'
  # PID 19 — Reaper-Subshell: hat die komplette Startskript-cmdline geerbt
  mk_proc "$root" 19 1 110 \
    /bin/sh -c 'reap_stale_children() { … mcp-server-postgres … }; reap_stale_children &'
  # echte Children: argv[1] ist der Server selbst, ppid=1
  mk_proc "$root" 4711 1 200 node /usr/local/bin/mcp-server-postgres 'postgresql://x'
  mk_proc "$root" 4712 1 210 node /usr/local/bin/mcp-server-postgres 'postgresql://x'
}

# Schneidet die Auswahlfunktion aus dem Startkommando des Manifests.
reaper_selection_fn() {
  pg_container_args | sed -n '/^list_reap_candidates()/,/^}/p'
}

# Laedt die Auswahlfunktion und laesst sie gegen das Fixture laufen.
# Ausgabe-Kontrakt: je Kandidat eine Zeile "<starttime> <pid>", aeltester zuerst.
run_selection() {  # <fixture> <self_pid>
  local fixture="$1" self="$2" fn
  fn="$(bash -c "$(declare -f pg_container_args reaper_selection_fn); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; reaper_selection_fn")"
  [ -n "$fn" ] || return 127
  bash -c "$fn
PROC_ROOT='$fixture' SELF_PID='$self' list_reap_candidates"
}

# Nur die PID-Spalte der Kandidatenliste.
selected_pids() {  # <fixture> <self_pid>
  run_selection "$1" "$2" | awk '{print $2}' | tr '\n' ' ' | sed 's/ $//'
}

# Positiv-Anker fuer die Negativtests. Ohne ihn wuerde "PID 1 ist nicht in der
# Liste" trivial gelten, solange die Funktion fehlt und die Liste leer ist —
# also genau die vakuose Gruenfaerbung, an der T002321 gescheitert ist.
assert_selection_alive() {  # <kandidatenliste>
  [ -n "$1" ] \
    || { echo "Kandidatenliste ist leer — Auswahlfunktion fehlt oder selektiert nichts; der Negativtest waere vakuos gruen"; return 1; }
  case " $1 " in
    *" 4711 "*) ;;
    *) echo "erwartetes Child 4711 fehlt in [$1] — Positiv-Anker nicht erfuellt"; return 1 ;;
  esac
}

@test "T002350: reaper exposes a pure selection function (no kill) that a test can load" {
  run bash -c "$(declare -f pg_container_args reaper_selection_fn); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; reaper_selection_fn"
  [ "$status" -eq 0 ]
  [ -n "$output" ] \
    || { echo "list_reap_candidates() fehlt im Startkommando — die Auswahl ist nicht isoliert und damit nicht pruefbar"; return 1; }
}

@test "T002350: list_reap_candidates returns only genuine children" {
  fixture="$(mktemp -d)"; mk_fixture "$fixture"
  got="$(selected_pids "$fixture" 19)"
  rm -rf "$fixture"
  [ "$got" = "4711 4712" ] \
    || { echo "Kandidaten: [$got] — erwartet [4711 4712]"; return 1; }
}

@test "T002350: list_reap_candidates never returns PID 1" {
  # PID 1 ist der supergateway-Parent; er fuehrt den gesuchten Namen in argv[2].
  fixture="$(mktemp -d)"; mk_fixture "$fixture"
  got="$(selected_pids "$fixture" 19)"
  rm -rf "$fixture"
  assert_selection_alive "$got" || return 1
  case " $got " in
    *" 1 "*) echo "PID 1 (supergateway-Parent) steht in der Kandidatenliste: [$got]"; return 1 ;;
  esac
}

@test "T002350: list_reap_candidates never returns the reaper's own subshell" {
  # PID 19 hat die komplette Startskript-cmdline geerbt — genau der Selbstmord aus #3397.
  fixture="$(mktemp -d)"; mk_fixture "$fixture"
  got="$(selected_pids "$fixture" 19)"
  rm -rf "$fixture"
  assert_selection_alive "$got" || return 1
  case " $got " in
    *" 19 "*) echo "die Reaper-Subshell steht in der Kandidatenliste: [$got]"; return 1 ;;
  esac
}

@test "T002350: candidates are ordered oldest first" {
  # Stufe 2 killt die aeltesten zuerst — die Reihenfolge ist Teil des Kontrakts.
  fixture="$(mktemp -d)"; mk_fixture "$fixture"
  got="$(selected_pids "$fixture" 19)"
  rm -rf "$fixture"
  # 4711 hat starttime 200, 4712 hat 210 — der aeltere muss zuerst stehen.
  [ "${got%% *}" = "4711" ] \
    || { echo "aeltester Kandidat steht nicht vorn: [$got]"; return 1; }
}

@test "T002350: list_reap_candidates honours an explicit self-PID exclusion" {
  # Wird SELF_PID auf ein echtes Child gesetzt, muss dieses verschwinden — Beleg,
  # dass der Self-Guard wirkt und nicht bloss zufaellig nichts trifft.
  fixture="$(mktemp -d)"; mk_fixture "$fixture"
  got="$(selected_pids "$fixture" 4711)"
  rm -rf "$fixture"
  [ "$got" = "4712" ] \
    || { echo "SELF_PID=4711 wurde nicht ausgeschlossen: [$got]"; return 1; }
}

@test "T002350: reaper reads a configurable proc root so production keeps /proc" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'PROC_ROOT:-/proc'"
  [ "$status" -eq 0 ]
}

@test "T002350: reaper reads self-PID via \$_root indirection, not hardcoded /proc" {
  # Der Reaper muss ueber $_root/self/stat lesen, damit Tests ein Fixture
  # unterschieben koennen. Hardcoded /proc/self/stat waere nicht testbar.
  # [$] statt \$: der aeussere bats-String ist doppelt gequotet, '\$' kaeme beim
  # inneren grep als '$' an — und das ist in ERE der Zeilenende-Anker, das Muster
  # koennte nie matchen. Die Zeichenklasse umgeht beide Quoting-Ebenen.
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq '[\$]_root/self/stat'"
  [ "$status" -eq 0 ]
}

@test "T002350: reaper caps live children so a request burst cannot outrun the age threshold" {
  run bash -c "$(declare -f pg_container_args); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; pg_container_args | grep -Eq 'MCP_PG_CHILD_MAX_COUNT'"
  [ "$status" -eq 0 ]
}

@test "T002350: age threshold stays above the statement_timeout" {
  args="$(pg_container_args)"
  age="$(printf '%s' "$args" | grep -Eo 'MCP_PG_CHILD_MAX_AGE_SECONDS:-[0-9]+' | head -1 | grep -Eo '[0-9]+$')"
  timeout_ms="$(jq -r '.spec.template.spec.containers[] | select(.name=="postgres") | .env[] | select(.name=="PGOPTIONS") | .value' \
    "$REPO/$MONOLITH_MANIFEST_REL" | grep -Eo 'statement_timeout=[0-9]+' | grep -Eo '[0-9]+$')"
  [ -n "$age" ] || { echo "keine Altersschwelle gefunden"; return 1; }
  [ -n "$timeout_ms" ] || { echo "kein statement_timeout gefunden"; return 1; }
  [ "$age" -gt "$(( timeout_ms / 1000 ))" ] \
    || { echo "Altersschwelle ${age}s liegt nicht ueber statement_timeout $(( timeout_ms / 1000 ))s"; return 1; }
}

@test "T002350: selection holds against real procfs, not just the fixture" {
  # Ein Fixture aus regulaeren Dateien kann procfs-Semantik nicht abbilden:
  # /proc/<pid>/cmdline meldet st_size=0 trotz Inhalt. Ein groessenbasierter
  # Guard liefe im Fixture gruen und selektierte im Container stumm nichts.
  command -v docker >/dev/null 2>&1 || skip "docker nicht verfuegbar"
  docker image inspect node:20-alpine >/dev/null 2>&1 || skip "node:20-alpine nicht lokal vorhanden"

  fn="$(bash -c "$(declare -f pg_container_args reaper_selection_fn); REPO='$REPO'; MONOLITH_MANIFEST_REL='$MONOLITH_MANIFEST_REL'; reaper_selection_fn")"
  [ -n "$fn" ] || { echo "keine Auswahlfunktion im Manifest"; return 1; }

  script="$(mktemp)"
  {
    printf '%s\n' '#!/bin/sh'
    printf '%s\n' 'printf "#!/usr/bin/env node\nsetTimeout(()=>{},9e5)\n" > /usr/local/bin/mcp-server-postgres'
    printf '%s\n' 'chmod +x /usr/local/bin/mcp-server-postgres'
    printf '%s\n' 'mcp-server-postgres "postgresql://x" & child=$!'
    printf '%s\n' 'sleep 2'
    printf '%s\n' "$fn"
    printf '%s\n' 'read -r self _ < /proc/self/stat'
    printf '%s\n' 'cand="$(list_reap_candidates | awk "{print \$2}" | tr "\n" " ")"'
    printf '%s\n' 'echo "candidates=[$cand] child=$child"'
    printf '%s\n' 'case " $cand " in *" $child "*) ;; *) echo "FAIL: echtes Child nicht selektiert"; exit 1 ;; esac'
    printf '%s\n' 'case " $cand " in *" 1 "*) echo "FAIL: PID 1 selektiert"; exit 1 ;; esac'
    printf '%s\n' 'echo OK'
  } > "$script"

  run docker run --rm -v "$script:/smoke.sh:ro" node:20-alpine sh /smoke.sh
  rm -f "$script"
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}

# ── MCP Monolith Deployment Reality In SSOT (T002321) ──────────────────

@test "mcp-gateway spec does not claim the monolith is decommissioned while its manifest ships" {
  if [ -f "$REPO/$MONOLITH_MANIFEST_REL" ]; then
    # Nur normative Prosa pruefen. Scenario-Bloecke beschreiben die Pruefbedingung
    # und duerfen das Wort tragen: nach dem Archivieren des Changes steht der
    # GIVEN-Text ("trug die Notiz, ... sei dekommissioniert") im SSOT und wuerde
    # einen Grep ueber das ganze Dokument dauerhaft rot faerben.
    # Ein Scenario-Block endet bei der ersten Zeile, die weder leer noch eine
    # Bullet-Zeile noch deren eingerueckte Fortsetzung ist — NICHT erst bei der
    # naechsten Ueberschrift, sonst verschluckt der Filter den gesamten Rest der
    # Datei nach dem letzten Scenario.
    run bash -c "awk '
      /^#### Scenario:/                  { in_s = 1; next }
      in_s && /^([[:space:]]*\$|[[:space:]]+|- )/ { next }
      { in_s = 0 }
      !in_s
    ' \"$REPO/openspec/specs/mcp-gateway.md\" | grep -Eq 'dekommissioniert|decommissioned'"
    [ "$status" -ne 0 ]

    # [T002375-p7] Negativ-Probe zum Filter selbst. Der erste Fix-Versuch in PR #3398
    # beendete Scenario-Bloecke erst bei der naechsten #-Ueberschrift und verschluckte
    # damit den GESAMTEN Dateirest nach dem letzten Scenario — der Test waere unbemerkt
    # dauerhaft gruen geblieben. Hier wird deshalb belegt, dass der Filter noch Substanz
    # durchlaesst: eine Ueberschrift, die garantiert im Dokument steht, muss ihn passieren.
    run bash -c "awk '
      /^#### Scenario:/                  { in_s = 1; next }
      in_s && /^([[:space:]]*\$|[[:space:]]+|- )/ { next }
      { in_s = 0 }
      !in_s
    ' \"$REPO/openspec/specs/mcp-gateway.md\" | grep -cE '^#+ '"
    [ "$output" -gt 0 ] || {
      echo "der Scenario-Filter verschluckt den Dateirest — der Abwesenheitstest waere dauerhaft gruen"; false; }
  fi
}

@test "mcp-gateway spec documents the manual apply path of k3d/default" {
  run grep -q 'k3d/default' "$REPO/openspec/specs/mcp-gateway.md"
  [ "$status" -eq 0 ]
}
