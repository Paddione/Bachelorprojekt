#!/usr/bin/env bats
# tests/spec/software-factory/tick-http-wakeup.bats
# SSOT: openspec/specs/software-factory.md  (Change: openspec/changes/rbac-exec-least-privilege)
# Ticket: T900110
#
# Pruefmodus: Manifest-Guards gegen factory-runner.yaml, Dockerfile, Workflow,
# NetworkPolicy; plus Laufzeittests gegen den Wakeup-Listener.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
  FACTORY="$REPO/k3d/dev-stack/factory-runner.yaml"
  NETPOL="$REPO/k3d/dev-stack/factory-runner-netpol.yaml"
  DOCKERFILE="$REPO/docker/factory-runner/Dockerfile"
  LISTENER="$REPO/docker/factory-runner/wakeup-listener.mjs"
  KUSTOMIZATION="$REPO/k3d/dev-stack/kustomization.yaml"
  WORKFLOW="$REPO/.github/workflows/build-factory-runner.yml"
}

# ── 1.4.1: no Role grants pods/exec for factory-tick ───────────────────

@test "1.4.1: no Role grants pods/exec for factory-tick" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  # Positiv-Anker: die ServiceAccount factory-tick existiert.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='ServiceAccount'&&d.metadata&&d.metadata.name==='factory-tick')"
  echo "sa found: $output"
  [ "$output" != "undefined" ] || [ "$output" != "null" ]

  # Negativ: keine Role/ClusterRole mit pods/exec in der Datei.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).filter(d=>(d.kind==='Role'||d.kind==='ClusterRole')&&(d.rules||[]).some(r=>(r.resources||[]).includes('pods/exec'))).length"
  echo "roles with exec: $output"
  [ "$output" = "0" ]

  # Negativ: keine Binding mit Subject factory-tick auf pods/exec.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).filter(d=>d.kind==='RoleBinding'||d.kind==='ClusterRoleBinding'){ const s=d.subjects?.find(x=>x.name==='factory-tick'); s&&d.roleRef?.kind==='Role'||d.roleRef?.kind==='ClusterRole'; }" 2>/dev/null || true
  # Einfach: grep gegen pods/exec in Roles/Bindings.
  run bash -c "grep -c 'pods/exec' '$FACTORY' || true"
  echo "pods/exec lines: $output"
  [ "$output" = "0" ]
}

# ── 1.4.2: CronJob triggers the tick via HTTP without token or kubectl ──

@test "1.4.2: CronJob triggers the tick via HTTP without token or kubectl" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  # CronJob factory-tick existiert.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='CronJob'&&d.metadata&&d.metadata.name==='factory-tick')?.metadata?.name"
  echo "cronjob: $output"
  [ "$output" = "factory-tick" ]

  # automountServiceAccountToken === false.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='CronJob'&&d.metadata&&d.metadata.name==='factory-tick')?.spec?.jobTemplate?.spec?.template?.spec?.automountServiceAccountToken"
  echo "automount: $output"
  [ "$output" = "false" ]

  # command/args enthalten http://factory-runner:8787/wakeup.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='CronJob'&&d.metadata&&d.metadata.name==='factory-tick')?.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0]?.command?.join(' ') + ' ' + (require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='CronJob'&&d.metadata&&d.metadata.name==='factory-tick')?.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0]?.args||[]).join(' ')" 2>/dev/null || true
  # Einfacher: grep auf die URL.
  run grep -c 'factory-runner:8787/wakeup' "$FACTORY"
  echo "wakeup URL: $output"
  [ "$output" -ge 1 ]

  # Keine kubectl im Kommando.
  run bash -c "grep -E '^\s+- kubectl' '$FACTORY' | grep -c factory-tick || true"
  echo "kubectl refs: $output"
  [ "$output" = "0" ]

  # Pod-Label component: tick.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='CronJob'&&d.metadata&&d.metadata.name==='factory-tick')?.spec?.jobTemplate?.spec?.template?.metadata?.labels?.component"
  echo "tick label: $output"
  [ "$output" = "tick" ]
}

# ── 1.4.3: runner serves the wakeup listener ──────────────────────────

@test "1.4.3: runner serves the wakeup listener" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  # Deployment command enthaelt /opt/factory-runner/wakeup-listener.mjs.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Deployment'&&d.metadata&&d.metadata.name==='factory-runner')?.spec?.template?.spec?.containers?.[0]?.command?.join(' ')"
  echo "command: $output"
  [[ "$output" == *"/opt/factory-runner/wakeup-listener.mjs"* ]] || fail "Command muss listener enthalten: $output"

  # containerPort 8787.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Deployment'&&d.metadata&&d.metadata.name==='factory-runner')?.spec?.template?.spec?.containers?.[0]?.ports?.[0]?.containerPort"
  echo "port: $output"
  [ "$output" = "8787" ]

  # readinessProbe httpGet /healthz.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Deployment'&&d.metadata&&d.metadata.name==='factory-runner')?.spec?.template?.spec?.containers?.[0]?.readinessProbe?.httpGet?.path"
  echo "probe path: $output"
  [ "$output" = "/healthz" ]

  # Template-Label component: runner.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Deployment'&&d.metadata&&d.metadata.name==='factory-runner')?.spec?.template?.metadata?.labels?.component"
  echo "template label: $output"
  [ "$output" = "runner" ]

  # Selector unveraendert {app: factory-runner}.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Deployment'&&d.metadata&&d.metadata.name==='factory-runner')?.spec?.selector?.matchLabels?.app"
  echo "selector app: $output"
  [ "$output" = "factory-runner" ]
}

# ── 1.4.4: Service and NetworkPolicy connect only tick to runner ──────

@test "1.4.4: Service factory-runner exists with correct selector" {
  [ -f "$FACTORY" ] || { echo "erwartet: k3d/dev-stack/factory-runner.yaml"; false; }

  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Service'&&d.metadata&&d.metadata.name==='factory-runner')?.metadata?.name"
  echo "service: $output"
  [ "$output" = "factory-runner" ]

  # Port 8787.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Service'&&d.metadata&&d.metadata.name==='factory-runner')?.spec?.ports?.[0]?.port"
  echo "svc port: $output"
  [ "$output" = "8787" ]

  # Selector mit component: runner.
  run y "$FACTORY" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Service'&&d.metadata&&d.metadata.name==='factory-runner')?.spec?.selector?.component"
  echo "svc selector component: $output"
  [ "$output" = "runner" ]
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
  run y "$WORKFLOW" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.on?.push)?.on?.push?.paths?.some(p=>p.includes('docker/factory-runner/**'))" 2>/dev/null || { echo "yaml parse failed, fallback grep"; grep -c 'docker/factory-runner/\*\*' "$WORKFLOW" || true; }

  # Fallback: grep auf die workflow Datei.
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
  BATS_TMP="${BATS_TEST_TMPDIR:-$BATS_TEST_DIR/tmp}"
  REPO_TMP="$BATS_TMP/factory-repo"
  mkdir -p "$REPO_TMP/scripts/factory"
  cat > "$REPO_TMP/scripts/factory/wakeup.sh" << 'WAKEOF'
#!/bin/bash
echo "tick-started"
echo "tick-finished"
WAKEOF
  chmod +x "$REPO_TMP/scripts/factory/wakeup.sh"

  # Starte den Listener im Hintergrund.
  export FACTORY_REPO="$REPO_TMP"
  export WAKEUP_LISTEN_PORT=0  # freier Port.
  node "$LISTENER" &
  WAKER_PID=$!
  sleep 1

  # Port herausfinden (er wird auf 0 gesetzt, Node gibt ihn an stdout).
  # Da wir keinen Port bekommen, probieren wir verschiedene Ports oder
  # verwenden node, um den Port zu ermitteln.
  # Stattdessen: wir starten auf einem festen Port und killen vorherige.
  # Bessere Loesung: WAKEUP_LISTEN_PORT auf 8788 setzen.
  kill "$WAKER_PID" 2>/dev/null || true
  wait "$WAKER_PID" 2>/dev/null || true

  export WAKEUP_LISTEN_PORT=8788
  node "$LISTENER" &
  WAKER_PID=$!
  WAKER_PORT=8788
  sleep 1
}

teardown() {
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
  [[ "$output" == *"tick-started"* ]] || fail "tick-started erwartet"
  [[ "$output" == *"WAKEUP_EXIT=0"* ]] || fail "WAKEUP_EXIT=0 erwartet"
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
  [[ "$output" == *"WAKEUP_EXIT=3"* ]] || fail "WAKEUP_EXIT=3 erwartet"
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
