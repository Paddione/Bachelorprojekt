#!/usr/bin/env bats
# tests/spec/openclaw-ops-bot.bats — Spec openclaw-ops-bot (T900538)
# Vertrag: .agents/plans/openclaw-ops-bot/design.md
#
# Prüfmodus:
# - Config-Vorlagen (openclaw.json5, exec-approvals.json5) werden geparst, nicht gegrept:
#   Zeilen mit führendem `//` verwerfen, Rest per JSON.parse (Format-Vertrag aus p2).
#   Zeilen-Filter statt Zeichen-Stripper, damit `//` in Werten wie URLs erhalten bleibt.
# - Taskfile wird per YAML-Parser gelesen, die verbotenen Muster per grep -F auf die Datei.
# - scripts/openclaw-ask.sh läuft gegen einen Fake-Gateway (fixtures/openclaw-fake-gateway.mjs);
#   geprüft werden Exit-Code, Ausgabe und der beim Fake angekommene Request.
# - heartbeat-scratch.md ist Prosa für den Agenten; dort ist grep das angemessene Mittel.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  CONFIG="${REPO}/openclaw/openclaw.json5"
  APPROVALS="${REPO}/openclaw/exec-approvals.json5"
  ASK="${REPO}/scripts/openclaw-ask.sh"
  T="${BATS_TEST_TMPDIR}"
  TOKEN="test-token-0123456789abcdef"
  mkdir -p "${T}/home"
  LOG="${T}/requests.log"
  : > "${LOG}"
  node "${BATS_TEST_DIRNAME}/fixtures/openclaw-fake-gateway.mjs" "${TOKEN}" "${T}/port" "${LOG}" \
    > "${T}/fake.out" 2>&1 3>&- &
  FAKE_PID=$!
  for _ in $(seq 1 50); do
    [ -s "${T}/port" ] && break
    sleep 0.1
  done
  [ -s "${T}/port" ] || { cat "${T}/fake.out"; return 1; }
  FAKE_URL="http://127.0.0.1:$(cat "${T}/port")"
}

teardown() {
  if [ -n "${FAKE_PID:-}" ]; then
    kill "${FAKE_PID}" 2>/dev/null || true
    wait "${FAKE_PID}" 2>/dev/null || true
  fi
}

# json_get <datei> <js-ausdruck über c> — gibt JSON.stringify(<ausdruck>) aus.
json_get() {
  node - "$1" "$2" <<'JS'
const fs = require('node:fs');
const [file, expr] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const c = JSON.parse(text);
const v = new Function('c', `return (${expr});`)(c);
process.stdout.write(v === undefined ? 'undefined' : JSON.stringify(v));
JS
}

@test "Taskfile pins Node by checksum and no longer installs opencode" {
  local tf="${REPO}/taskfiles/Taskfile.openclaw.yml"
  # Positiv-Anker: die Datei parst und trägt die Prüfsumme als 64 Hex-Zeichen.
  run python3 -c "import yaml,sys; print(yaml.safe_load(open(sys.argv[1]))['vars']['NODE24_SHA256'])" "$tf"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9a-f]{64}$ ]]
  # Negativ: kein sudo, keine opencode-Installation, keine opencode-Erkennung.
  run grep -n -F -e sudo -e 'npm install -g opencode' -e 'command -v opencode' "$tf"
  echo "$output"
  [ "$status" -eq 1 ]
}

@test "Template binds loopback and uses env references" {
  run json_get "$CONFIG" 'c.gateway.bind'
  [ "$status" -eq 0 ]
  [ "$output" = '"loopback"' ]
  run json_get "$CONFIG" 'c.gateway.port'
  [ "$output" = '18789' ]
  run json_get "$CONFIG" 'c.gateway.auth.mode'
  [ "$output" = '"token"' ]
  run json_get "$CONFIG" 'c.gateway.auth.token'
  [ "$output" = '"${OPENCLAW_GATEWAY_TOKEN}"' ]
  run json_get "$CONFIG" 'c.models.providers["opencode-go"].apiKey'
  [ "$output" = '"${OPENCODE_GO_API_KEY}"' ]
}

@test "Write tools are denied for both agents" {
  for agent in ops task-runner; do
    run json_get "$CONFIG" "c.agents.entries['${agent}'].tools.deny"
    [ "$status" -eq 0 ] || { echo "kein deny für ${agent}: $output"; return 1; }
    printf '%s' "$output" | jq -e '(["write","edit","apply_patch"] - .) == []' >/dev/null \
      || { echo "${agent} deny unvollständig: $output"; return 1; }
  done
}

@test "Primary is local, fallback is OpenCode Go" {
  run json_get "$CONFIG" 'c.agents.defaults.model'
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.primary == "local/local-default"
    and .fallbacks == ["opencode-go/muse-spark-1.3-contributor"]' >/dev/null
  run json_get "$CONFIG" 'c.agents.defaults.models["opencode-go/muse-spark-1.3-contributor"].params.thinking'
  [ "$output" = '"low"' ]
  run json_get "$CONFIG" 'c.models.providers.local.baseUrl'
  [ "$output" = '"${OPENCLAW_LOCAL_BASE_URL}"' ]
}

@test "ops is the default agent with a 30-minute Telegram heartbeat and exec in allowlist mode" {
  run json_get "$CONFIG" 'c.agents.entries.ops'
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.default == true
    and .heartbeat.every == "30m"
    and .heartbeat.target == "telegram"
    and .heartbeat.to == "${TELEGRAM_CHAT_ID}"' >/dev/null
  run json_get "$CONFIG" '"heartbeat" in c.agents.entries["task-runner"]'
  [ "$output" = 'false' ]
  run json_get "$CONFIG" 'c.tools.exec.security'
  [ "$output" = '"allowlist"' ]
}

@test "Exec allowlist of both agents permits only read-only commands" {
  run node - "$APPROVALS" <<'JS'
const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const c = JSON.parse(text);
// Ein Eintrag erlaubt <bin> <args>, wenn sein pattern auf das Binary passt (Name, Pfad
// oder Wildcard) und sein argPattern (fehlt es: alles) auf die Argumente matcht.
const allows = (e, bin, args) => {
  const p = String(e.pattern ?? '').split('/').pop();
  if (p !== bin && p !== '*' && p !== '**') return false;
  return e.argPattern === undefined || new RegExp(e.argPattern).test(args);
};
const readOnly = [['kubectl', '--context fleet get pods -A'], ['flux', 'get kustomizations -A'],
  ['gh', 'run list --branch main --limit 5'], ['git', 'status']];
const forbidden = [['rm', '-rf /tmp/x'], ['kubectl', 'delete pod x'],
  ['kubectl', '--context fleet apply -f x.yaml'], ['kubectl', 'patch deploy x -p {}'],
  ['kubectl', 'scale deploy x --replicas=0'], ['flux', 'reconcile kustomization x'],
  ['flux', 'suspend kustomization x'], ['flux', 'resume kustomization x'],
  ['git', 'push origin main']];
const errors = [];
for (const id of ['ops', 'task-runner']) {
  const list = c.agents?.[id]?.allowlist;
  if (!Array.isArray(list) || list.length === 0) { errors.push(`${id}: allowlist fehlt/leer`); continue; }
  for (const [bin, args] of readOnly) {
    if (!list.some((e) => allows(e, bin, args))) errors.push(`${id}: verbietet ${bin} ${args}`);
  }
  for (const [bin, args] of forbidden) {
    if (list.some((e) => allows(e, bin, args))) errors.push(`${id}: erlaubt ${bin} ${args}`);
  }
}
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log('allowlist ok');
JS
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$output" = "allowlist ok" ]
}

@test "heartbeat-scratch.md lists every check and NO_REPLY, and the workspace has no HEARTBEAT.md" {
  local f="${REPO}/openclaw/heartbeat-scratch.md"
  # Positiv-Anker: die Scratch-Datei existiert und nennt die Quittung.
  [ -f "$f" ]
  grep -qF 'NO_REPLY' "$f"
  grep -qF 'flux get kustomizations --context fleet -A' "$f"
  grep -qF 'kubectl --context fleet get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded' "$f"
  grep -qF 'gh run list --branch main --limit 5' "$f"
  grep -qF 'bash scripts/ticket.sh list --status plan_staged' "$f"
  # Negativ: kein HEARTBEAT.md im Workspace-Verzeichnis des Repos.
  [ ! -e "${REPO}/openclaw/workspace/HEARTBEAT.md" ]
}

@test "Successful call prints the answer" {
  run env HOME="${T}/home" OPENCLAW_GATEWAY_URL="$FAKE_URL" OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
    "$ASK" --timeout 10 "status"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qxF 'RESULT: done'
  run jq -r 'select(.auth == "ok") | .body.model' "$LOG"
  [ "$output" = "openclaw/task-runner" ]
  run jq -r 'select(.auth == "ok") | .body.messages[-1].content' "$LOG"
  [ "$output" = "status" ]
}

@test "Gateway without listener" {
  local port
  port="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  run env HOME="${T}/home" OPENCLAW_GATEWAY_URL="http://127.0.0.1:${port}" OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
    "$ASK" --timeout 10 "status"
  [ "$status" -eq 3 ]
  [[ "$output" == *"http://127.0.0.1:${port}"* ]]
}

@test "Missing token exits 2 without contacting the gateway" {
  run env -u OPENCLAW_GATEWAY_TOKEN HOME="${T}/home" OPENCLAW_GATEWAY_URL="$FAKE_URL" \
    "$ASK" --timeout 10 "status"
  [ "$status" -eq 2 ]
  [ ! -s "$LOG" ]
}

@test "Wrong token exits 4 with the gateway error text" {
  run env HOME="${T}/home" OPENCLAW_GATEWAY_URL="$FAKE_URL" OPENCLAW_GATEWAY_TOKEN="wrong-token" \
    "$ASK" --timeout 10 "status"
  [ "$status" -eq 4 ]
  [[ "$output" == *"invalid gateway token"* ]]
  run jq -r '.auth' "$LOG"
  [ "$output" = "bad" ]
}
