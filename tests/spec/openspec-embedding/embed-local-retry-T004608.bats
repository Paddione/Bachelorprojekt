#!/usr/bin/env bats
# tests/spec/openspec-embedding/embed-local-retry-T004608.bats
#
# [T004608] openspec-embed-local.sh (der explizite C.4-Pfad aus dev-flow-plan)
# hat KEINEN Retry auf transiente Embed-Backend-Fehler: zwei Laeufe am
# 2026-08-14 endeten mit "best-effort failure (exit 0): The operation was
# aborted due to timeout" — der Change landete nie im pgvector-Index. Der
# post-commit-Hook hat Retries (T002916, OPENSPEC_EMBED_HOOK_RETRIES), der
# explizite Wrapper nicht.
#
# Der Fix: analoge Retry-Schleife im Wrapper (OPENSPEC_EMBED_RETRIES /
# OPENSPEC_EMBED_RETRY_DELAY), bevor der Fail-visible-Exit 1 greift.
#
# Test-Strategie (offline): Fake-`curl` (Probe OK, HTTP 200) und Fake-`node`
# (zaehlt Aufrufe, gibt wahlweise Fehler oder Erfolg aus) ueber PATH-Stubbs.
# SESSIONS_DATABASE_URL ist gesetzt — der kubectl-Pfad wird uebersprungen.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  WRAPPER="$REPO_ROOT/scripts/openspec-embed-local.sh"
  WORK="$(mktemp -d)"
  export WORK

  # Fake-bin: curl + node liegen hier zuerst im PATH.
  FAKE_BIN="$WORK/bin"
  mkdir -p "$FAKE_BIN"

  # Fake-curl: antwortet 200 auf die Embedding-Probe (curl -X POST /v1/embeddings).
  cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in
    -w) printf '200' ;;
  esac
done
exit 0
EOF
  chmod +x "$FAKE_BIN/curl"

  export PATH="$FAKE_BIN:$PATH"
  export SESSIONS_DATABASE_URL="postgres://test:test@127.0.0.1:5432/testdb"
  export LLM_EMBED_URL="http://127.0.0.1:1"   # egal — curl ist gefakt
  export OPENSPEC_EMBED_RETRY_DELAY=0
}

teardown() {
  rm -rf "${WORK:-}"
}

# Fake-node: scheitert N-1 mal, dann Erfolg (nur wenn FAIL_FIRST gesetzt),
# oder scheitert IMMER. Schreibt den Aufrufzaehler nach $WORK/node_calls.
write_fake_node() { # <mode: always_fail|fail_twice|success>
  local mode="$1"
  cat > "$FAKE_BIN/node" <<EOF
#!/usr/bin/env bash
count=0
[[ -f "$WORK/node_calls" ]] && count=\$(cat "$WORK/node_calls")
count=\$((count+1))
printf '%s' "\$count" > "$WORK/node_calls"
if [[ "$mode" == "always_fail" ]]; then
  echo '[openspec-embed] best-effort failure (exit 0): The operation was aborted due to timeout' >&2
elif [[ "$mode" == "fail_twice" && "\$count" -lt 2 ]]; then
  echo '[openspec-embed] best-effort failure (exit 0): The operation was aborted due to timeout' >&2
else
  echo "indexed slug='demo': 10 chunks (model=bge-m3)"
fi
exit 0
EOF
  chmod +x "$FAKE_BIN/node"
}

# ── Positiv-Anker: Erfolg im ersten Versuch bleibt Erfolg ──────────────────

@test "T004608: Erfolg im ersten node-Lauf bleibt Exit 0 (Positiv-Anker)" {
  write_fake_node success
  run bash "$WRAPPER" demo
  [ "$status" -eq 0 ]
  # >=1: der Wrapper laeuft nach Erfolg noch --count-skipped (zweiter node-Aufruf)
  [ "$(cat "$WORK/node_calls")" -ge 1 ]
}

# ── Negativ: transienter Fehler wird retried, statt sofort zu failen ───────

@test "T004608: transienter Backend-Timeout wird retried (2. Versuch erfolgreich)" {
  write_fake_node fail_twice
  OPENSPEC_EMBED_RETRIES=3 run bash "$WRAPPER" demo
  [ "$status" -eq 0 ]
  [ "$(cat "$WORK/node_calls")" -ge 2 ]
}

# ── Negativ: Retry-Erschoepfung endet fail-visible (kein stiller Exit 0) ────

@test "T004608: alle Retries erschoepft -> Exit 1, kein stilles Weitermachen" {
  write_fake_node always_fail
  OPENSPEC_EMBED_RETRIES=2 run bash "$WRAPPER" demo
  [ "$status" -eq 1 ]
  [ "$(cat "$WORK/node_calls")" -ge 3 ]   # initial + 2 Retries
  echo "$output" | grep -qiE "NICHT indiziert|best-effort"
}
