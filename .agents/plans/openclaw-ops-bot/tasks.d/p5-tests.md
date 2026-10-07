---
title: "p5 — Tests für den OpenClaw-Ops-Bot"
ticket_id: T900538
domains: [agent-tooling, llm-local-dev]
status: active
---

# p5 — Tests

Files: `tests/unit/openclaw-taskfile.bats` (umgebaut), `tests/spec/openclaw-ops-bot.bats` (neu),
`tests/spec/fixtures/openclaw-fake-gateway.mjs` (neu), `tests/spec/llm-local-dev.bats` (zwei Tests
entfernt), `components/website/src/data/test-inventory.json` (regeneriert).

Vertrag: `openspec/changes/openclaw-ops-bot/design.md`. Konventionen: `tests/CLAUDE.md`
(Output-Verifikation, Positiv-Anker bei Negativtests, vendiertes `bats`). Alle Befehle laufen im
Worktree-Root. Keine anderen Dateien ändern.

Jedes Scenario aus `specs/llm-local-dev.md` und `specs/openclaw-ops-bot.md` hat genau einen
`@test` mit dem Scenario-Titel als Namen. Zusätzliche Tests decken Requirement-Sätze ohne eigenes
Scenario ab (Exit 2, Exit 4, Heartbeat, Allowlist, `.env.example`, Include, `.gitignore`).

| Scenario (Spec) | Datei | `@test` |
|-----------------|-------|---------|
| Alle Pflicht-Tasks sind vorhanden (llm-local-dev) | `tests/unit/openclaw-taskfile.bats` | gleichnamig |
| Das Taskfile verwaltet kein opencode (llm-local-dev) | `tests/unit/openclaw-taskfile.bats` | gleichnamig |
| Taskfile pins Node by checksum and no longer installs opencode | `tests/spec/openclaw-ops-bot.bats` | gleichnamig |
| Template binds loopback and uses env references | `tests/spec/openclaw-ops-bot.bats` | gleichnamig |
| Write tools are denied for both agents | `tests/spec/openclaw-ops-bot.bats` | gleichnamig |
| Primary is local, fallback is OpenCode Go | `tests/spec/openclaw-ops-bot.bats` | gleichnamig |
| Successful call prints the answer | `tests/spec/openclaw-ops-bot.bats` | gleichnamig |
| Gateway without listener | `tests/spec/openclaw-ops-bot.bats` | gleichnamig |

Parser für die Config-Vorlagen: p2 schreibt `openclaw/openclaw.json5` und
`openclaw/exec-approvals.json5` als striktes JSON mit Kommentaren nur auf eigenen `//`-Zeilen.
Der Test verwirft deshalb nur Zeilen mit führendem `//` und ruft `JSON.parse` auf. Ein
`//` innerhalb eines Werts (URL) bleibt so unangetastet.

## Task 5.1: Fixture und Tests schreiben

### 5.1a `tests/spec/fixtures/openclaw-fake-gateway.mjs`

Datei mit exakt diesem Inhalt anlegen (keine npm-Abhängigkeiten, nur `node:http` und `node:fs`):

```js
#!/usr/bin/env node
// openclaw-fake-gateway.mjs <token> <port-file> <request-log>
// Fake-OpenClaw-Gateway für tests/spec/openclaw-ops-bot.bats (T900538). Keine Abhängigkeiten.
// Lauscht auf 127.0.0.1 mit einem freien Port (listen 0) und schreibt den Port atomar in
// <port-file>. POST /v1/chat/completions: prüft `Authorization: Bearer <token>`, hängt pro
// Request eine JSON-Zeile {auth, path, body} an <request-log> an und antwortet mit 200 und
// {"choices":[{"message":{"content":"RESULT: done"}}]} bzw. 401 und Fehler-JSON.
// Alle anderen Pfade: 404.

import { createServer } from 'node:http';
import { appendFileSync, renameSync, writeFileSync } from 'node:fs';

const [token, portFile, logPath] = process.argv.slice(2);
if (!token || !portFile || !logPath) {
  console.error('usage: openclaw-fake-gateway.mjs <token> <port-file> <request-log>');
  process.exit(64);
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    send(res, 404, { error: { message: 'not found', type: 'not_found' } });
    return;
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let body = null;
    try { body = JSON.parse(raw); } catch { body = { unparsable: raw }; }
    const auth = req.headers.authorization === `Bearer ${token}` ? 'ok' : 'bad';
    appendFileSync(logPath, JSON.stringify({ auth, path: req.url, body }) + '\n');
    if (auth !== 'ok') {
      send(res, 401, { error: { message: 'invalid gateway token', type: 'unauthorized' } });
      return;
    }
    send(res, 200, { choices: [{ index: 0, message: { role: 'assistant', content: 'RESULT: done' } }] });
  });
});

server.listen(0, '127.0.0.1', () => {
  const tmp = `${portFile}.tmp`;
  writeFileSync(tmp, String(server.address().port));
  renameSync(tmp, portFile);
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
```

### 5.1b `tests/spec/openclaw-ops-bot.bats`

Datei mit exakt diesem Inhalt anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/openclaw-ops-bot.bats — Spec openclaw-ops-bot (T900538)
# SSOT: openspec/specs/openclaw-ops-bot.md (bis zum Archiv: openspec/changes/openclaw-ops-bot/specs/)
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
```

### 5.1c `tests/unit/openclaw-taskfile.bats`

Gesamten Inhalt durch exakt diesen Text ersetzen. Die Tests auf `OPENAI_BASE_URL` (Ollama) und
`OPENAI_MODEL` (qwen2.5) entfallen laut REMOVED-Delta in `specs/llm-local-dev.md`.

```bash
#!/usr/bin/env bats
# tests/unit/openclaw-taskfile.bats — Spec llm-local-dev, Requirement „Required Task Declarations" (T900538)
#
# Prüfmodus: Taskfiles per YAML-Parser, .env.example durch Einlesen in einer leeren Shell
# (env -i, set -a), .gitignore über `git check-ignore`. Nur die verbotenen opencode-Muster
# werden per grep -F auf die Datei geprüft, weil sich die Aussage ausschließlich im Dateitext zeigt.

setup() {
  cd "${BATS_TEST_DIRNAME}/../.."
  TF=taskfiles/Taskfile.openclaw.yml
}

@test "Taskfile.openclaw.yml parses as YAML" {
  run python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$TF"
  [ "$status" -eq 0 ]
}

@test "Alle Pflicht-Tasks sind vorhanden" {
  run python3 -c "
import yaml, sys
tasks = yaml.safe_load(open(sys.argv[1]))['tasks']
want = ['backup', 'install', 'configure', 'start', 'status', 'logs', 'restore', 'wipe']
missing = [t for t in want if t not in tasks]
print('missing: ' + ' '.join(missing) if missing else 'ok')
" "$TF"
  [ "$status" -eq 0 ]
  [ "$output" = "ok" ]
}

@test "Das Taskfile verwaltet kein opencode" {
  # Positiv-Anker: die Datei parst und deklariert install (sonst wäre „kein Treffer" vakuos).
  run python3 -c "import yaml,sys; print('install' in yaml.safe_load(open(sys.argv[1]))['tasks'])" "$TF"
  [ "$status" -eq 0 ]
  [ "$output" = "True" ]
  # Verboten ist Installieren, Deinstallieren, Erkennen und Konfigurieren von opencode.
  # Erlaubt bleibt das Lesen des Go-Keys aus ~/.local/share/opencode/auth.json.
  run grep -n -F -e 'npm install -g opencode' -e 'npm uninstall -g opencode' \
    -e 'command -v opencode' -e '.config/opencode' "$TF"
  echo "$output"
  [ "$status" -eq 1 ]
}

@test ".env.example lists all seven variables with empty secrets" {
  run env -i bash -c '
    set -a
    . ./openclaw/.env.example
    for v in OPENCLAW_GATEWAY_TOKEN TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPENCLAW_LOCAL_BASE_URL \
             OPENCODE_GO_API_KEY OPENCLAW_GO_SESSION OPENCLAW_LOG_LEVEL; do
      printf "%s=%s\n" "$v" "${!v-UNSET}"
    done'
  [ "$status" -eq 0 ]
  [ "$output" = "OPENCLAW_GATEWAY_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
OPENCLAW_LOCAL_BASE_URL=http://127.0.0.1:1919/v1
OPENCODE_GO_API_KEY=
OPENCLAW_GO_SESSION=
OPENCLAW_LOG_LEVEL=info" ]
}

@test "Root Taskfile.yml includes openclaw" {
  run python3 -c "
import yaml
inc = yaml.safe_load(open('Taskfile.yml'))['includes']['openclaw']
print(inc['taskfile'] if isinstance(inc, dict) else inc)
"
  [ "$status" -eq 0 ]
  [ "$output" = "./taskfiles/Taskfile.openclaw.yml" ]
}

@test ".gitignore excludes openclaw/.env" {
  # Positiv-Anker: die Vorlage selbst ist NICHT ignoriert (sonst ignoriert ein Wildcard alles).
  run git check-ignore -q openclaw/.env.example
  [ "$status" -eq 1 ]
  run git check-ignore -q openclaw/.env
  [ "$status" -eq 0 ]
}
```

Syntaxprüfung (erwartet `17`, Exit 0):

```bash
tests/unit/lib/bats-core/bin/bats --count tests/unit/openclaw-taskfile.bats tests/spec/openclaw-ops-bot.bats
```

## Task 5.2: Rotlauf gegen den Stand vor p1–p4 (RED)

Im Factory-Ablauf liegen p1–p4 beim Start von p5 schon im Branch. Der Rotlauf läuft deshalb in
einem temporären, losgelösten Worktree auf `origin/main`, in den nur die drei neuen Testdateien
kopiert werden. Der gemeinsame Stash-Stapel wird nicht benutzt.

```bash
git fetch origin main
RED="$(mktemp -d)/red"
git worktree add --detach "$RED" origin/main
mkdir -p "$RED/tests/spec/fixtures"
cp tests/unit/openclaw-taskfile.bats "$RED/tests/unit/"
cp tests/spec/openclaw-ops-bot.bats "$RED/tests/spec/"
cp tests/spec/fixtures/openclaw-fake-gateway.mjs "$RED/tests/spec/fixtures/"
( cd "$RED" && tests/unit/lib/bats-core/bin/bats tests/unit/openclaw-taskfile.bats tests/spec/openclaw-ops-bot.bats ); echo "rc=$?"
git worktree remove --force "$RED"
```

expected: FAIL — `rc=1`, 13 von 17 Tests `not ok`. Grün bleiben nur die vier Tests, deren
Aussage auf `main` schon gilt: „Taskfile.openclaw.yml parses as YAML", „Alle Pflicht-Tasks sind
vorhanden", „Root Taskfile.yml includes openclaw", „.gitignore excludes openclaw/.env". Rot sind
unter anderem „Das Taskfile verwaltet kein opencode" (alter Taskfile enthält `command -v opencode`
und `sudo npm install -g opencode@latest`) und alle Broker-Tests (`scripts/openclaw-ask.sh`
fehlt, Exit 127). Ist einer der 13 Tests grün, ist das ein Befund am Test, kein „schon erfüllt":
Test prüfen, bevor es weitergeht.

## Task 5.3: Grünlauf

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/openclaw-taskfile.bats tests/spec/openclaw-ops-bot.bats
```

Erwartet: `1..17`, alle `ok`, Exit 0. Schlägt ein Test fehl, liegt der Fehler in der
Implementierung aus p1–p4 (Werte stehen in `design.md`), nicht im Test: die zugehörige Datei an den
Vertrag anpassen und nur dann den Test ändern, wenn er vom Design abweicht.

## Task 5.4: Test-Inventar regenerieren

```bash
task test:inventory
git diff --stat components/website/src/data/test-inventory.json
jq -e '[.[] | select(.file == "tests/spec/openclaw-ops-bot.bats")] | length == 1' components/website/src/data/test-inventory.json
```

Erwartet: der Diff fügt genau einen Eintrag `{"id": "openclaw-ops-bot", "file":
"tests/spec/openclaw-ops-bot.bats", "category": "openclaw-ops-bot", "kind": "shell"}` hinzu, `jq`
gibt `true` aus. `tests/unit/` und die Fixture erscheinen nicht im Inventar. Weitere Änderungen im
Diff stammen nicht aus p5 und werden nicht mitcommittet.

## Task 5.5: Gestrichene Ollama-Tests entfernen

`tests/spec/llm-local-dev.bats` prüft noch die per REMOVED-Delta gestrichenen Requirements
„Local Ollama Base URL in Example Config" und „Chat Model Set in Example Config". Entferne genau
diese beiden `@test`-Blöcke samt der Leerzeile danach, sonst nichts:

```bash
@test "openclaw/.env.example sets OPENAI_BASE_URL to local Ollama endpoint" {
  run grep -qE '^OPENAI_BASE_URL=http://10\.10\.0\.3:11434/v1$' "$ENV_EXAMPLE"
  [ "$status" -eq 0 ]
}

@test "openclaw/.env.example sets OPENAI_MODEL to qwen2.5 series" {
  run grep -qE '^OPENAI_MODEL=qwen2\.5:' "$ENV_EXAMPLE"
  [ "$status" -eq 0 ]
}
```

Der Test „openclaw/.env.example exists" bleibt. Prüfbefehl:

```bash
grep -c 'OPENAI_BASE_URL\|OPENAI_MODEL' tests/spec/llm-local-dev.bats   # 0
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats          # alle ok
```
