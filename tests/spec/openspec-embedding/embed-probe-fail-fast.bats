#!/usr/bin/env bats
# tests/spec/openspec-embedding/embed-probe-fail-fast.bats
# SSOT: openspec/specs/openspec-embedding.md
#
# [T900209] Der post-commit-Hook [openspec-embed] probte http://127.0.0.1:18235
# (llm-proxy), fand keinen Lauscher (curl 7) und wiederholte den ganzen Wrapper
# dreimal — mit bis zu 30s Budget und 5s Pause je Versuch, auf JEDEM Commit, der
# openspec/changes/* beruehrt. Ein fehlender Lauscher oder eine Abweisung
# (401/403/404) ist aber kein transienter Fehler: ein zweiter Versuch Sekunden
# spaeter trifft dieselbe Lage. Der Wrapper meldet solche dauerhaften
# Probe-Fehlschlaege deshalb mit einem eigenen Exit-Code (3), und der Hook
# wiederholt dann nicht.
#
# Pruefmodus: command output verification [T002448-M4]. Die Tests RUFEN den
# Wrapper bzw. den Hook auf und pruefen Exit-Code, Ausgabe und Aufrufzahl — kein
# Grep auf die Quelltexte.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/openspec-embed-local.sh"
  HOOK="$REPO/.githooks/post-commit-embed"
  export OPENSPEC_EMBED_PROBE_TIMEOUT=5
  # Die DB-Stufe hinter der Probe darf den Test nicht an kubectl binden.
  export SESSIONS_DATABASE_URL="postgres://u:p@127.0.0.1:1/db"
  export OPENSPEC_EMBED_RETRY_DELAY=0
}

teardown() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "${TMPGIT:-}" ] && rm -rf "$TMPGIT"
  return 0
}

# Wegwerf-HTTP-Server mit festem Status; Port vom Kernel (WSL2 reserviert
# Portbereiche, siehe probe-diagnosis.bats).
_serve_status() {
  local status="$1" port_file
  port_file="$(mktemp)"
  python3 - "$status" "$port_file" <<'PY' &
import http.server, sys
status = int(sys.argv[1]); port_file = sys.argv[2]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.send_response(status); self.end_headers(); self.wfile.write(b'{}')
    def log_message(self, *a): pass
srv = http.server.HTTPServer(('127.0.0.1', 0), H)
with open(port_file, 'w') as fh:
    fh.write(str(srv.server_address[1]))
srv.serve_forever()
PY
  SERVER_PID=$!
  SERVE_PORT=""
  for _ in $(seq 1 50); do
    SERVE_PORT="$(cat "$port_file" 2>/dev/null)"
    [ -n "$SERVE_PORT" ] && break
    sleep 0.1
  done
  rm -f "$port_file"
  [ -n "$SERVE_PORT" ]
}

# Ein freier, garantiert unbelegter Port: binden, Nummer merken, schliessen.
_dead_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

@test "T900209: kein Lauscher am Embedding-Port ist ein dauerhafter Fehlschlag (Exit 3)" {
  local port
  port="$(_dead_port)"
  run env LLM_EMBED_URL="http://127.0.0.1:$port" bash "$SCRIPT" __probe_only__
  # Positiv-Anker: die Probe lief gegen genau diesen Port und benannte curl 7.
  echo "$output" | grep -qF "127.0.0.1:$port"
  echo "$output" | grep -qiE 'curl 7|abgelehnt'
  [ "$status" -eq 3 ]
}

@test "T900209: eine abgewiesene Anfrage (HTTP 401) ist dauerhaft und nennt den Bearer-Token" {
  _serve_status 401
  run env LLM_EMBED_URL="http://127.0.0.1:$SERVE_PORT" bash "$SCRIPT" __probe_only__
  echo "$output" | grep -qF '401'
  [ "$status" -eq 3 ]
  # Die Remediation muss den tatsaechlichen Hebel nennen: das devmesh-llm-services
  # sperrt jede Anfrage ohne LLM_PROXY_ADMIN_TOKEN.
  echo "$output" | grep -qF 'LLM_PROXY_ADMIN_TOKEN'
}

@test "T900209: ein Serverfehler (HTTP 500) bleibt wiederholbar (Exit 1, nicht 3)" {
  # Gegenprobe: nicht jeder Probe-Fehlschlag darf als dauerhaft gelten, sonst
  # verliert der Hook seinen Retry fuer echte Transienten (T002916).
  _serve_status 500
  run env LLM_EMBED_URL="http://127.0.0.1:$SERVE_PORT" bash "$SCRIPT" __probe_only__
  echo "$output" | grep -qF '500'
  [ "$status" -eq 1 ]
}

@test "T900209: der Probe sendet LLM_PROXY_ADMIN_TOKEN als Bearer, wenn gesetzt" {
  # Server, der nur mit dem erwarteten Bearer 200 liefert, sonst 401.
  local port_file
  port_file="$(mktemp)"
  python3 - "$port_file" <<'PY' &
import http.server, sys
port_file = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        ok = self.headers.get('Authorization') == 'Bearer probe-secret'
        self.send_response(200 if ok else 401); self.end_headers(); self.wfile.write(b'{}')
    def log_message(self, *a): pass
srv = http.server.HTTPServer(('127.0.0.1', 0), H)
with open(port_file, 'w') as fh:
    fh.write(str(srv.server_address[1]))
srv.serve_forever()
PY
  SERVER_PID=$!
  for _ in $(seq 1 50); do SERVE_PORT="$(cat "$port_file" 2>/dev/null)"; [ -n "$SERVE_PORT" ] && break; sleep 0.1; done
  rm -f "$port_file"

  # node durch einen Stub ersetzen: die Stufe hinter der Probe soll nur belegen,
  # dass die Probe bestanden wurde.
  local fake_bin="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$fake_bin"
  printf '#!/usr/bin/env bash\necho "stub-node-reached"\n' > "$fake_bin/node"
  chmod +x "$fake_bin/node"

  run env PATH="$fake_bin:$PATH" LLM_PROXY_ADMIN_TOKEN=probe-secret \
    LLM_EMBED_URL="http://127.0.0.1:$SERVE_PORT" bash "$SCRIPT" __probe_only__
  # Positiv-Anker: die Probe wurde bestanden, der Wrapper erreichte die Embed-Stufe.
  echo "$output" | grep -qF 'stub-node-reached'
  probe_fail="$(echo "$output" | grep -F 'Embedding-Probe' || true)"
  [ -z "$probe_fail" ]
}

@test "T900209: defaultEmbed() sendet LLM_PROXY_ADMIN_TOKEN als Bearer" {
  # Ohne den Header besteht die Probe, aber der eigentliche Embed-Lauf
  # scheitert am devmesh-Proxy mit 401.
  run env LLM_PROXY_ADMIN_TOKEN=embed-secret LLM_EMBED_URL=http://127.0.0.1:1 \
    node --input-type=module -e "
      let seen = null;
      globalThis.fetch = async (_url, opts) => {
        seen = opts.headers.Authorization ?? opts.headers.authorization ?? null;
        return { ok: true, json: async () => ({ data: [{ embedding: [0.1] }] }) };
      };
      const { defaultEmbed } = await import('$REPO/scripts/openspec-embed.mjs');
      const out = await defaultEmbed(['x']);
      console.log('embeddings=' + out.length + ' auth=' + seen);
    "
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'embeddings=1'
  echo "$output" | grep -qF 'auth=Bearer embed-secret'
}

# --- .githooks/post-commit-embed ------------------------------------------

_setup_hook_repo() { # <wrapper-exit-code>
  TMPGIT="$(mktemp -d)"
  git -C "$TMPGIT" init -q
  git -C "$TMPGIT" config user.email test@example.com
  git -C "$TMPGIT" config user.name test
  mkdir -p "$TMPGIT/scripts"
  CALLS="$TMPGIT/calls.log"
  : > "$CALLS"
  cp "$REPO/scripts/openspec-embed-lib.sh" "$TMPGIT/scripts/openspec-embed-lib.sh"
  cat > "$TMPGIT/scripts/openspec-embed-local.sh" <<EOF
#!/usr/bin/env bash
echo call >> "$CALLS"
exit $1
EOF
  chmod +x "$TMPGIT/scripts/openspec-embed-local.sh"
  : > "$TMPGIT/README.md"
  ( cd "$TMPGIT" && git add -A && git commit -q -m root )
  mkdir -p "$TMPGIT/openspec/changes/demo"
  : > "$TMPGIT/openspec/changes/demo/tasks.md"
  ( cd "$TMPGIT" && git add -A && git commit -q -m seed )
}

@test "T900209: der Hook wiederholt einen dauerhaften Probe-Fehlschlag (Exit 3) nicht" {
  _setup_hook_repo 3
  run bash -c "cd '$TMPGIT' && unset CI && OPENSPEC_EMBED_HOOK_RETRY_DELAY=0 bash '$HOOK'"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Wrapper wurde aufgerufen.
  [ -s "$CALLS" ]
  [ "$(wc -l < "$CALLS")" -eq 1 ]
}

@test "T900209: der Hook wiederholt transiente Fehlschlaege (Exit 1) weiterhin" {
  _setup_hook_repo 1
  run bash -c "cd '$TMPGIT' && unset CI && OPENSPEC_EMBED_HOOK_RETRY_DELAY=0 bash '$HOOK'"
  [ "$status" -eq 0 ]
  [ "$(wc -l < "$CALLS")" -eq 3 ]
}
