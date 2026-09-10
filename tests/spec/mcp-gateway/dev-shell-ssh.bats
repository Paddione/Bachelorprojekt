#!/usr/bin/env bats
# tests/spec/mcp-gateway/dev-shell-ssh.bats
# SSOT: openspec/specs/mcp-gateway.md  (Change: openspec/changes/dev-pod-ssh)
# Ticket: T900108
#
# Pruefmodus: Gegenstand dieser Guards sind Kubernetes-Manifeste, der Build-
# Workflow, die sshd-Konfiguration und das Dockerfile des dev-shell-Images.
# Fuer Manifeste und Workflow wird der Output eines Parsers (node + yaml)
# geprueft, nicht ein Grep ueber Prosa — die Zusicherungen haengen an der
# Semantik (Mount-Modus, sysctl-Wert, Ports), nicht an der Formatierung.
# Fuer sshd_config und Dockerfile IST die Datei das Resultat: dort wird die
# Direktive selbst geprueft (Kommentarzeilen zaehlen nicht, weil die Muster
# am Zeilenanfang ankern).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  # Windows/MSYS: node braucht C:/... statt /c/... (siehe tests/spec/mcp-gateway.bats).
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
  DEPLOY="$REPO/k3d/dev-pod/deployment.yaml"
  SVC="$REPO/k3d/dev-pod/service.yaml"
  HOME_PVC="$REPO/k3d/dev-pod/home-pvc.yaml"
  KEYS="$REPO/k3d/dev-pod/authorized-keys.yaml"
  KUST="$REPO/k3d/dev-pod/kustomization.yaml"
  ENVF="$REPO/environments/mentolder.yaml"
  SSHD="$REPO/docker/dev-shell/sshd_config"
  DF="$REPO/docker/dev-shell/Dockerfile"
  WF="$REPO/.github/workflows/build-dev-pod.yml"
}

# Laedt ein Manifest und wertet einen JS-Ausdruck ueber dem geparsten Dokument aus.
# `d` ist das erste Dokument der Datei.
y() {  # <datei> <js-ausdruck ueber d>
  node -e "
    const fs=require('fs'), yaml=require('yaml');
    const docs=yaml.parseAllDocuments(fs.readFileSync(process.argv[1],'utf8'))
      .map(x=>x.toJS()).filter(Boolean);
    const d=docs[0];
    const out=($2);
    console.log(typeof out==='string'?out:JSON.stringify(out));
  " "$1"
}

# Zaehlt Zeilen einer Datei, die exakt dem Muster entsprechen (CR-tolerant).
count_lines() {  # <datei> <ERE>
  tr -d '\r' < "$1" | grep -cE "$2" || true
}

# ── Container und Identitaet ──────────────────────────────────────────

@test "dev-shell container exists with the dev-shell image" {
  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').map(c=>c.image).join(',')"
  echo "image: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == ghcr.io/paddione/dev-shell* ]]
}

@test "dev-shell runs as uid 1000 and the pod stays runAsNonRoot" {
  run y "$DEPLOY" "String(d.spec.template.spec.securityContext.runAsNonRoot)"
  echo "pod runAsNonRoot: $output"
  [ "$output" = "true" ]

  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').map(c=>c.securityContext.runAsUser+'/'+c.securityContext.allowPrivilegeEscalation).join(',')"
  echo "dev-shell runAsUser/allowPrivilegeEscalation: $output"
  [ "$output" = "1000/false" ]
}

@test "pod skips the recursive fsGroup chown when the volume root already matches" {
  # Positiv-Anker: fsGroup ist gesetzt (sonst waere die Policy bedeutungslos).
  run y "$DEPLOY" "String(d.spec.template.spec.securityContext.fsGroup)"
  echo "fsGroup: $output"
  [ "$output" = "1000" ]

  run y "$DEPLOY" "String(d.spec.template.spec.securityContext.fsGroupChangePolicy)"
  echo "fsGroupChangePolicy: $output"
  [ "$output" = "OnRootMismatch" ]
}

@test "dev-shell has no readinessProbe that could mark the pod NotReady" {
  # Nur die readinessProbe ist ausgeschlossen. Ein nicht laufender dev-shell
  # (CrashLoop, ImagePullBackOff) macht den Pod weiterhin NotReady — siehe
  # openspec/changes/dev-pod-ssh/design.md, Abschnitt Verfuegbarkeit.
  # Positiv-Anker: mcp-node gatet die Service-Endpunkte mit einer readinessProbe.
  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='mcp-node'&&c.readinessProbe).length"
  echo "mcp-node mit readinessProbe: $output"
  [ "$output" = "1" ]

  # dev-shell ist optional: keine readinessProbe, stattdessen eine livenessProbe auf :22.
  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').map(c=>String(c.readinessProbe===undefined)).join(',')"
  echo "dev-shell ohne readinessProbe: $output"
  [ "$output" = "true" ]

  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').map(c=>((c.livenessProbe||{}).exec||{command:[]}).command.join(' ')).join(',')"
  echo "dev-shell livenessProbe: $output"
  [[ "$output" == *"nc -z 127.0.0.1 22"* ]]
}

@test "pod declares ip_unprivileged_port_start=0" {
  run y "$DEPLOY" "(d.spec.template.spec.securityContext.sysctls||[]).filter(s=>s.name==='net.ipv4.ip_unprivileged_port_start').map(s=>s.value).join(',')"
  echo "sysctl: [$output]"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# ── Port 22 nur ueber kubectl exec ────────────────────────────────────

@test "port 22 is neither a containerPort nor a service port" {
  # Positiv-Anker: der sshd-Traeger dev-shell ist Teil der geprueften Container,
  # der Service traegt ueberhaupt Ports, die Container deklarieren ueberhaupt
  # containerPorts — sonst waere "22 fehlt" vakuos (und im RED-Lauf gruen).
  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').length"
  echo "dev-shell containers: $output"
  [ "$output" = "1" ]
  run y "$SVC" "(d.spec.ports||[]).length"
  echo "service ports: $output"
  [ "$output" -ge 1 ]
  run y "$DEPLOY" "d.spec.template.spec.containers.flatMap(c=>(c.ports||[]).map(p=>p.containerPort)).length"
  echo "container ports: $output"
  [ "$output" -ge 1 ]

  run y "$DEPLOY" "d.spec.template.spec.containers.flatMap(c=>(c.ports||[]).map(p=>p.containerPort)).filter(p=>String(p)==='22').length"
  echo "containerPort 22: $output"
  [ "$output" = "0" ]
  run y "$SVC" "(d.spec.ports||[]).flatMap(p=>[p.port,p.targetPort]).filter(p=>String(p)==='22').length"
  echo "service port 22: $output"
  [ "$output" = "0" ]
}

@test "sshd listens on loopback only and disables password and root login" {
  [ -f "$SSHD" ] || { echo "erwartet: docker/dev-shell/sshd_config"; false; }
  # Positiv-Anker: die Datei ist eine sshd-Konfiguration mit Port 22.
  run count_lines "$SSHD" '^Port 22$'
  echo "Port 22: $output"
  [ "$output" = "1" ]

  for directive in 'ListenAddress 127.0.0.1' 'PasswordAuthentication no' \
                   'KbdInteractiveAuthentication no' 'PermitRootLogin no' \
                   'AllowUsers patrick gekko'; do
    run count_lines "$SSHD" "^${directive}\$"
    echo "$directive: $output"
    [ "$output" = "1" ]
  done

  # Keine weitere ListenAddress (z. B. 0.0.0.0 oder ::).
  run bash -c "tr -d '\r' < '$SSHD' | grep -E '^ListenAddress' | grep -vc '^ListenAddress 127.0.0.1\$' || true"
  echo "fremde ListenAddress: $output"
  [ "$output" = "0" ]
}

@test "sshd denies agent, socket, tunnel and gateway forwarding" {
  [ -f "$SSHD" ] || { echo "erwartet: docker/dev-shell/sshd_config"; false; }
  # Positiv-Anker: lokales TCP-Forwarding (ssh -L auf die MCP-Ports) bleibt erlaubt.
  run count_lines "$SSHD" '^AllowTcpForwarding local$'
  echo "AllowTcpForwarding local: $output"
  [ "$output" = "1" ]

  # Beide Login-Namen teilen uid 1000: ein weitergeleiteter Agent-Socket waere
  # fuer den anderen Namen und jeden mit pods/exec nutzbar.
  for opt in AllowAgentForwarding AllowStreamLocalForwarding PermitTunnel \
             GatewayPorts PermitUserEnvironment; do
    run count_lines "$SSHD" "^${opt} no\$"
    echo "$opt no: $output"
    [ "$output" = "1" ]
    run count_lines "$SSHD" "^${opt} "
    echo "$opt gesamt: $output"
    [ "$output" = "1" ]
  done
}

@test "ssh sessions reach the API server and do not self-update claude code" {
  [ -f "$SSHD" ] || { echo "erwartet: docker/dev-shell/sshd_config"; false; }
  # sshd reicht die Container-Umgebung nicht weiter; ohne KUBERNETES_SERVICE_*
  # faellt kubectl auf localhost:8080 (= mcp-kubernetes im selben Pod).
  run count_lines "$SSHD" '^SetEnv '
  echo "SetEnv-Zeilen: $output"
  [ "$output" = "1" ]

  setenv="$(tr -d '\r' < "$SSHD" | grep -E '^SetEnv ' | cut -d' ' -f2- | tr ' ' '\n' | sort | tr '\n' ' ')"
  echo "SetEnv: [$setenv]"
  for kv in KUBERNETES_SERVICE_HOST=kubernetes.default.svc KUBERNETES_SERVICE_PORT=443 \
            DISABLE_AUTOUPDATER=1; do
    run bash -c "printf '%s' '$setenv' | tr ' ' '\n' | grep -cxF -e '$kv' || true"
    echo "$kv: $output"
    [ "$output" = "1" ]
  done
}

@test "each login name is configured with only its own authorized_keys file" {
  [ -f "$SSHD" ] || { echo "erwartet: docker/dev-shell/sshd_config"; false; }
  # Positiv-Anker: genau eine AuthorizedKeysFile-Direktive.
  run count_lines "$SSHD" '^AuthorizedKeysFile '
  echo "AuthorizedKeysFile-Zeilen: $output"
  [ "$output" = "1" ]

  value="$(tr -d '\r' < "$SSHD" | grep -E '^AuthorizedKeysFile ' | cut -d' ' -f2-)"
  echo "Wert: [$value]"
  # Ein einziges Ziel (kein Leerzeichen = kein zweites Ziel wie .ssh/authorized_keys).
  [ -n "$value" ]
  [[ "$value" != *" "* ]]
  # Absolut, pro Name (%u), nicht im gemeinsamen Home (%h).
  [[ "$value" == /* ]]
  [[ "$value" == */%u ]]
  [[ "$value" != *%h* ]]
}

@test "authorized keys match the environment registry" {
  [ -f "$KEYS" ] || { echo "erwartet: k3d/dev-pod/authorized-keys.yaml"; false; }
  run y "$KEYS" "d.kind+'/'+d.metadata.name"
  echo "keys manifest: $output"
  [ "$output" = "ConfigMap/dev-pod-authorized-keys" ]

  for u in patrick gekko; do
    U="$(printf '%s' "$u" | tr '[:lower:]' '[:upper:]')"
    cm="$(y "$KEYS" "String((d.data||{})['$u']||'').trim()")"
    reg="$(y "$ENVF" "String((d.setup_vars||{})['${U}_SSH_PUBLIC_KEY']||'').trim()")"
    echo "$u configmap: [$cm]"
    echo "$u registry:  [$reg]"
    [ -n "$cm" ]
    [ -n "$reg" ]
    [ "$cm" = "$reg" ]
  done
}

# ── Persistenz und Checkout ───────────────────────────────────────────

@test "dev-shell mounts dev-pod-home at /home/dev" {
  [ -f "$HOME_PVC" ] || { echo "erwartet: k3d/dev-pod/home-pvc.yaml"; false; }
  run y "$HOME_PVC" "d.kind+'/'+d.metadata.name"
  echo "pvc: $output"
  [ "$output" = "PersistentVolumeClaim/dev-pod-home" ]

  volname="$(y "$DEPLOY" "(d.spec.template.spec.volumes||[]).filter(v=>v.persistentVolumeClaim&&v.persistentVolumeClaim.claimName==='dev-pod-home').map(v=>v.name)[0]||''")"
  echo "volume: [$volname]"
  [ -n "$volname" ]

  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').flatMap(c=>(c.volumeMounts||[]).filter(m=>m.name==='$volname').map(m=>m.mountPath)).join(',')"
  echo "mountPath: $output"
  [ "$output" = "/home/dev" ]
}

@test "dev-shell mounts the checkout read-only" {
  volname="$(y "$DEPLOY" "(d.spec.template.spec.volumes||[]).filter(v=>v.persistentVolumeClaim&&v.persistentVolumeClaim.claimName==='dev-pod-repo').map(v=>v.name)[0]||''")"
  [ -n "$volname" ] || { echo "kein PVC-Volume dev-pod-repo im Deployment"; false; }

  # Positiv-Anker: dev-shell mountet das Checkout ueberhaupt.
  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').flatMap(c=>(c.volumeMounts||[]).filter(m=>m.name==='$volname')).length"
  echo "dev-shell checkout mounts: $output"
  [ "$output" -ge 1 ]

  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').flatMap(c=>(c.volumeMounts||[]).filter(m=>m.name==='$volname').map(m=>String(m.readOnly===true))).join(',')"
  echo "readOnly: $output"
  [ "$output" = "true" ]
}

@test "new manifests are part of the kustomization" {
  run y "$KUST" "['home-pvc.yaml','authorized-keys.yaml'].filter(f=>(d.resources||[]).includes(f)).join(',')"
  echo "resources: $output"
  [ "$output" = "home-pvc.yaml,authorized-keys.yaml" ]
}

# ── Image und Build ───────────────────────────────────────────────────

@test "dev-shell image carries its toolchain at build time" {
  [ -f "$DF" ] || { echo "erwartet: docker/dev-shell/Dockerfile"; false; }
  # RUN-Bloecke inklusive Fortsetzungszeilen zu je einer Zeile zusammenfassen,
  # Kommentarzeilen verwerfen; danach sind nur Bauanweisungen uebrig.
  printf '%s' "$(tr -d '\r' < "$DF" | grep -vE '^[[:space:]]*#' | sed -e ':a' -e '/\\$/N; s/\\\n/ /; ta')" \
    > "$BATS_TEST_TMPDIR/df.flat"

  # Exakt gepinnte Versionen (Lieferkette, T900108-Review F7).
  for arg in KUBECTL_VERSION CLAUDE_CODE_VERSION TASK_VERSION GH_VERSION PNPM_VERSION; do
    run bash -c "grep -cE '^ARG ${arg}=v?[0-9]+\.[0-9]+\.[0-9]+\$' '$BATS_TEST_TMPDIR/df.flat' || true"
    echo "ARG $arg gepinnt: $output"
    [ "$output" = "1" ]
  done

  # Werkzeuge aus konkreten Artefakten, nicht aus Installer-Skripten.
  for tool in openssh-server '/bin/linux/amd64/kubectl' '@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}' \
              'task_linux_amd64.tar.gz' 'gh_${GH_VERSION}_linux_amd64.tar.gz' 'pnpm@${PNPM_VERSION}'; do
    run bash -c "grep -E '^RUN ' '$BATS_TEST_TMPDIR/df.flat' | grep -cF -e '$tool' || true"
    echo "RUN mit $tool: $output"
    [ "$output" -ge 1 ]
  done

  # Heruntergeladene Binaerartefakte (task, kubectl, gh) werden gegen Pruefsummen geprueft.
  run bash -c "grep -E '^RUN ' '$BATS_TEST_TMPDIR/df.flat' | grep -oF -e 'sha256sum -c' | wc -l"
  echo "sha256sum -c: $output"
  [ "$output" -ge 3 ]
  run bash -c "grep -cF -e 'taskfile.dev/install.sh' '$BATS_TEST_TMPDIR/df.flat' || true"
  echo "taskfile.dev/install.sh: $output"
  [ "$output" = "0" ]

  run bash -c "grep -E '^(CMD|ENTRYPOINT)' '$BATS_TEST_TMPDIR/df.flat' | wc -l"
  echo "CMD/ENTRYPOINT: $output"
  [ "$output" -ge 1 ]
  run bash -c "grep -E '^(CMD|ENTRYPOINT)' '$BATS_TEST_TMPDIR/df.flat' | grep -cE 'apt-get|apk|npm install' || true"
  echo "Paketmanager im CMD/ENTRYPOINT: $output"
  [ "$output" = "0" ]

  # Der echte Startpfad ist entrypoint.sh (Positiv-Anker: er startet sshd).
  EP="$REPO/docker/dev-shell/entrypoint.sh"
  tr -d '\r' < "$EP" | grep -vE '^[[:space:]]*#' > "$BATS_TEST_TMPDIR/ep.flat"
  run bash -c "grep -cE '^exec /usr/sbin/sshd ' '$BATS_TEST_TMPDIR/ep.flat' || true"
  echo "entrypoint startet sshd: $output"
  [ "$output" = "1" ]
  run bash -c "grep -cE 'apt-get|apk |npm (install|i )|pnpm (add|install)|pip install|curl |wget ' '$BATS_TEST_TMPDIR/ep.flat' || true"
  echo "Paketmanager/Download im entrypoint: $output"
  [ "$output" = "0" ]
}

@test "build workflow builds the dev-shell image" {
  run y "$WF" "(d.jobs.build.strategy.matrix.include||[]).filter(m=>m.image==='dev-shell'&&m.context==='docker/dev-shell').length"
  echo "matrix dev-shell: $output"
  [ "$output" = "1" ]

  run y "$WF" "String(((d.on||d[true]||{}).push||{}).paths.includes('docker/dev-shell/**'))"
  echo "push path filter: $output"
  [ "$output" = "true" ]
}
