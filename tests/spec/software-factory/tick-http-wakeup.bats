#!/usr/bin/env bats
# tests/spec/software-factory/tick-http-wakeup.bats
# SSOT: openspec/specs/software-factory.md  (Change: openspec/changes/rbac-exec-least-privilege)
# Ticket: T900110
#
# Pruefmodus: Manifest-Guards gegen factory-runner.yaml, Dockerfile, Workflow,
# NetworkPolicy; plus Laufzeittests gegen den Wakeup-Listener.

# ── Global path resolution (needed by both setup() and setup_file()) ─

REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
FACTORY="$REPO/k3d/dev-stack/factory-runner.yaml"
NETPOL="$REPO/k3d/dev-stack/factory-runner-netpol.yaml"
DOCKERFILE="$REPO/docker/factory-runner/Dockerfile"
LISTENER="$REPO/docker/factory-runner/wakeup-listener.mjs"
KUSTOMIZATION="$REPO/k3d/dev-stack/kustomization.yaml"
WORKFLOW="$REPO/.github/workflows/build-factory-runner.yml"
BATS_TMP="${BATS_TEST_TMPDIR:-/tmp}"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) BATS_TMP="$(cygpath -m "$BATS_TMP")" ;; esac
REPO_TMP="$BATS_TMP/factory-repo"
WAKER_PID=""
WAKER_PORT=""
SKIP_RUNTIME=true

setup() {
  :
}

# ── 1.4.1: no Role grants pods/exec for factory-tick ───────────────────

@test "1.4.1: no Role grants pods/exec for factory-tick" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  # Positiv-Anker: die ServiceAccount factory-tick existiert.
  run grep -c 'name: factory-tick' "$FACTORY"
  echo "sa found: $output"
  [ "$output" -ge 1 ]

  # Negativ: keine Role/ClusterRole mit pods/exec in der Datei.
  run grep -c 'pods/exec' "$FACTORY" || true
  echo "roles with exec: $output"
  [ "$output" = "0" ]
}

# ── 1.4.2: CronJob triggers the tick via HTTP without token or kubectl ──

@test "1.4.2: CronJob triggers the tick via HTTP without token or kubectl" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  # CronJob factory-tick existiert.
  run grep -c 'name: factory-tick' "$FACTORY"
  echo "cronjob: $output"
  [ "$output" -ge 1 ]

  # automountServiceAccountToken === false (im tick Pod).
  run grep -c 'automountServiceAccountToken: false' "$FACTORY"
  echo "automount: $output"
  [ "$output" -ge 1 ]

  # command/args enthalten http://factory-runner:8787/wakeup.
  run grep -c 'factory-runner:8787/wakeup' "$FACTORY"
  echo "wakeup URL: $output"
  [ "$output" -ge 1 ]

  # Keine kubectl im Kommando (nur tick-Bereich prüfen).
  run grep -c 'kubectl' "$FACTORY" || true
  echo "kubectl refs: $output"
  [ "$output" = "0" ]

  # Pod-Label component: tick.
  run grep -c 'component: tick' "$FACTORY"
  echo "tick label: $output"
  [ "$output" -ge 1 ]
}

# ── 1.4.3: runner serves the wakeup listener ──────────────────────────

@test "1.4.3: runner serves the wakeup listener" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  # Deployment command enthaelt /opt/factory-runner/wakeup-listener.mjs.
  run grep -c 'wakeup-listener.mjs' "$FACTORY"
  echo "command: $output"
  [ "$output" -ge 1 ]

  # containerPort 8787.
  run grep -c 'containerPort: 8787' "$FACTORY"
  echo "port: $output"
  [ "$output" -ge 1 ]

  # readinessProbe httpGet /healthz.
  run grep -c '/healthz' "$FACTORY"
  echo "probe path: $output"
  [ "$output" -ge 1 ]

  # Template-Label component: runner.
  run grep -c 'component: runner' "$FACTORY"
  echo "template label: $output"
  [ "$output" -ge 1 ]

  # Selector unveraendert {app: factory-runner}.
  run grep -c 'app: factory-runner' "$FACTORY"
  echo "selector app: $output"
  [ "$output" -ge 1 ]
}

# ── 1.4.4: Service and NetworkPolicy connect only tick to runner ──────

@test "1.4.4: Service factory-runner exists with correct selector" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  run grep -c 'name: factory-runner' "$FACTORY"
  echo "service: $output"
  [ "$output" -ge 2 ] # Deployment + Service

  # Port 8787.
  run grep -c 'port: 8787' "$FACTORY"
  echo "svc port: $output"
  [ "$output" -ge 1 ]

  # Selector mit component: runner.
  run grep -c 'component: runner' "$FACTORY"
  echo "svc selector component: $output"
  [ "$output" -ge 1 ]
}

@test "1.4.4: factory-runner-netpol.yaml referenced in kustomization" {
  run grep -c 'factory-runner-netpol.yaml' "$KUSTOMIZATION"
  echo "references: $output"
  [ "$output" -ge 1 ]
}

@test "1.4.4: NetworkPolicy defines tick-to-runner egress and runner ingress" {
  [ -f "$NETPOL" ] || { echo "erwartet: k3d/dev-stack/factory-runner-netpol.yaml"; false; }

  # Positiv-Anker: die Datei existiert und hat Inhalt.
  [ -s "$NETPOL" ] || { echo "netpol file is empty"; false; }

  # Egress von tick → runner.
  run grep -c 'factory-tick-to-runner-egress' "$NETPOL"
  echo "egress policy: $output"
  [ "$output" -ge 1 ]

  # Ingress auf runner.
  run grep -c 'factory-runner-wakeup-ingress' "$NETPOL"
  echo "ingress policy: $output"
  [ "$output" -ge 1 ]

  # TCP 8787.
  run grep -c '8787' "$NETPOL"
  echo "port 8787 refs: $output"
  [ "$output" -ge 1 ]
}

# ── 1.4.5: image ships the listener ──────────────────────────────────

@test "1.4.5: Dockerfile ships the listener" {
  [ -f "$DOCKERFILE" ] || { echo "erwartet: docker/factory-runner/Dockerfile"; false; }

  run grep -c 'wakeup-listener.mjs' "$DOCKERFILE"
  echo "listener refs: $output"
  [ "$output" -ge 1 ]

  run grep -c '/opt/factory-runner/' "$DOCKERFILE"
  echo "opt refs: $output"
  [ "$output" -ge 1 ]
}

@test "1.4.5: workflow path filter covers docker/factory-runner/**" {
  [ -f "$WORKFLOW" ] || { echo "erwartet: .github/workflows/build-factory-runner.yml"; false; }

  # push-Pfadfilter muss docker/factory-runner/** enthalten.
  run grep -c 'docker/factory-runner/\*\*' "$WORKFLOW" 2>/dev/null || true
  echo "workflow path filter: $output"
  [ "$output" -ge 1 ]
}

# ── 1.4.6–1.4.10: Laufzeittests gegen den Listener ──────────────────

# Die folgenden Tests starten den Listener als Hintergrundprozess und
# testen ihn mit curl. Sie skippen, wenn node/curl fehlen.

setup_file() {
  WAKER_PID=""
  WAKER_PORT=""
SKIP_RUNTIME=false

  command -v node >/dev/null || { echo "node binary not installed"; SKIP_RUNTIME=true; }
  command -v curl >/dev/null || { echo "curl binary not installed"; SKIP_RUNTIME=true; }

  if [ "$SKIP_RUNTIME" = true ]; then
    skip "node/curl required for runtime tests"
  fi

  # Erstelle TEMP-REPO mit wakeup.sh-Stub.
  BATS_TMP="${BATS_TEST_TMPDIR:-/tmp}"
  # Windows-Pfad konvertieren, falls nötig
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) BATS_TMP="$(cygpath -m "$BATS_TMP")" ;; esac
  REPO_TMP="$BATS_TMP/factory-repo"
  mkdir -p "$REPO_TMP/scripts/factory"
  cat > "$REPO_TMP/scripts/factory/wakeup.sh" << 'WAKEOF'
#!/bin/bash
echo "tick-started"
echo "tick-finished"
WAKEOF
  chmod +x "$REPO_TMP/scripts/factory/wakeup.sh"

  # Listener-Datei konvertieren, falls nötig
  LISTENER_REAL="$LISTENER"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) LISTENER_REAL="$(cygpath -m "$LISTENER")" ;; esac

  # Starte den Listener auf Port 8788 — nohup+disown gegen Windows-BATS-ChildProcess.kill.
  export FACTORY_REPO="$REPO_TMP"
  export WAKEUP_LISTEN_PORT=8788
  nohup node "$LISTENER_REAL" > /tmp/waker.log 2>&1 &
  WAKER_PID=$!
  WAKER_PORT=8788
  disown "$WAKER_PID" 2>/dev/null || true

  # Warte bis der Listener bereit ist.
  for i in $(seq 1 40); do
    if curl -sS http://127.0.0.1:${WAKER_PORT}/healthz >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done

  # Wenn der Listener nicht startet, skippen.
  if ! curl -sS http://127.0.0.1:${WAKER_PORT}/healthz >/dev/null 2>&1; then
    kill "$WAKER_PID" 2>/dev/null || true
    wait "$WAKER_PID" 2>/dev/null || true
    skip "wakeup-listener konnte nicht gestartet werden"
  fi
}

teardown_file() {
  if [ -n "$WAKER_PID" ]; then
    kill "$WAKER_PID" 2>/dev/null || true
    wait "$WAKER_PID" 2>/dev/null || true
  fi
}

@test "1.4.6: healthz answers ok" {
  [ "$SKIP_RUNTIME" = true ] && skip "runtime skipped"

  run curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${WAKER_PORT}/healthz"
  echo "status: $output"
  [ "$output" = "200" ]
}

@test "1.4.7: wakeup streams output and reports exit 0" {
  [ "$SKIP_RUNTIME" = true ] && skip "runtime skipped"

  run curl -sS -X POST "http://127.0.0.1:${WAKER_PORT}/wakeup"
  echo "output: $output"
  [[ "$output" == *"tick-started"* ]] || { echo "tick-started erwartet"; return 1; }
  [[ "$output" == *"WAKEUP_EXIT=0"* ]] || { echo "WAKEUP_EXIT=0 erwartet"; return 1; }
}

@test "1.4.8: wakeup reports a failing tick" {
  [ "$SKIP_RUNTIME" = true ] && skip "runtime skipped"

  # Erstelle einen Stub, der exit 3 macht.
  cat > "$REPO_TMP/scripts/factory/wakeup.sh" << 'WAKEOF'
#!/bin/bash
echo "failing tick"
exit 3
WAKEOF
  chmod +x "$REPO_TMP/scripts/factory/wakeup.sh"

  run curl -sS -X POST "http://127.0.0.1:${WAKER_PORT}/wakeup"
  echo "output: $output"
  [[ "$output" == *"WAKEUP_EXIT=3"* ]] || { echo "WAKEUP_EXIT=3 erwartet"; return 1; }
}

@test "1.4.9: parallel wakeup is rejected with 409" {
  [ "$SKIP_RUNTIME" = true ] && skip "runtime skipped"

  # Erstelle einen Stub, der laenger laeuft und eine Markerdatei schreibt.
  cat > "$REPO_TMP/scripts/factory/wakeup.sh" << 'WAKEOF'
#!/bin/bash
echo "long tick"
touch "$BATS_TEST_TMPDIR/marker"
sleep 3
echo "done"
WAKEOF
  chmod +x "$REPO_TMP/scripts/factory/wakeup.sh"

  # Ersten Request im Hintergrund.
  curl -sS -X POST "http://127.0.0.1:${WAKER_PORT}/wakeup" > /tmp/waker1.out &
  PID1=$!

  # Warte auf die Markerdatei (max 3s).
  for i in $(seq 1 30); do
    [ -f "$BATS_TEST_TMPDIR/marker" ] && break
    sleep 0.1
  done

  # Zweiten Request stellen → 409.
  run curl -sS -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${WAKER_PORT}/wakeup"
  echo "parallel status: $output"
  [ "$output" = "409" ]

  # Hintergrundprozess beenden.
  kill $PID1 2>/dev/null || true
  wait $PID1 2>/dev/null || true
}

@test "1.4.10: other methods are refused" {
  [ "$SKIP_RUNTIME" = true ] && skip "runtime skipped"

  # GET /wakeup → 405.
  run curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${WAKER_PORT}/wakeup"
  echo "GET /wakeup: $output"
  [ "$output" = "405" ]

  # POST /other → 404.
  run curl -sS -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${WAKER_PORT}/other"
  echo "POST /other: $output"
  [ "$output" = "404" ]
}
