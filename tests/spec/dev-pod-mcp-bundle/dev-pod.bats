#!/usr/bin/env bats
# tests/spec/dev-pod-mcp-bundle/dev-pod.bats
# SSOT: openspec/specs/mcp-gateway.md  (Change: openspec/changes/dev-pod-mcp-bundle)
# Ticket: T900107
#
# Pruefmodus: Der Gegenstand dieser Guards sind Kubernetes-Manifeste und
# Dockerfiles — Artefakte, deren "Resultat" sich ausschliesslich in ihrem Inhalt
# manifestiert. Geprueft wird deshalb der Output eines Parsers ueber das Manifest
# (node + yaml), nicht ein Grep ueber Prosa: die Zusicherungen haengen an der
# Semantik (Container-Zahl, Mount-Modus, Service-Typ), nicht an der Formatierung.
# Ausnahme sind die Dockerfile-Guards: dort IST die Bauanweisung das Resultat.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  # Windows/MSYS: node braucht C:/... statt /c/... (siehe tests/spec/mcp-gateway.bats).
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
  DEPLOY="$REPO/k3d/dev-pod/deployment.yaml"
  SVC="$REPO/k3d/dev-pod/service.yaml"
  PVC="$REPO/k3d/dev-pod/pvc.yaml"
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

# ── Deployment: drei Container, keiner mehr ───────────────────────────

@test "dev-pod deployment manifest exists" {
  [ -f "$DEPLOY" ] || { echo "erwartet: k3d/dev-pod/deployment.yaml"; false; }
}

@test "dev-pod carries exactly the three declared containers" {
  run y "$DEPLOY" "d.spec.template.spec.containers.map(c=>c.name).sort().join(',')"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "mcp-kubernetes,mcp-node,repo-sync" ]
}

@test "dev-pod declares no init container that installs software" {
  # Der Monolith zog sein github-Binary in einem Init-Container aus dem Netz.
  run y "$DEPLOY" "(d.spec.template.spec.initContainers||[]).length"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# ── Playwright bleibt draussen ────────────────────────────────────────

@test "playwright is absent from the bundle" {
  # Positiv-Anker zuerst: es gibt ueberhaupt Container mit Images (T002356-M1).
  run y "$DEPLOY" "d.spec.template.spec.containers.map(c=>c.image).filter(Boolean).length"
  echo "images: $output"
  [ "$status" -eq 0 ]
  [ "$output" -ge 3 ]

  # Geprueft wird die Container-Deklaration, nicht der Prosa-Text der Datei:
  # der Kommentar darf (und soll) begruenden, WARUM playwright draussen bleibt.
  run y "$DEPLOY" "d.spec.template.spec.containers.concat(d.spec.template.spec.initContainers||[]).filter(c=>/playwright/i.test(c.name+' '+(c.image||''))).map(c=>c.name).join(',')"
  echo "playwright container: [$output]"
  [ -z "$output" ]
}

# ── Checkout: ein Schreiber, alle anderen read-only ───────────────────

@test "checkout volume is backed by the dev-pod-repo PVC" {
  [ -f "$PVC" ] || { echo "erwartet: k3d/dev-pod/pvc.yaml"; false; }
  run y "$PVC" "d.kind+'/'+d.metadata.name"
  echo "output: $output"
  [ "$output" = "PersistentVolumeClaim/dev-pod-repo" ]

  run y "$DEPLOY" "(d.spec.template.spec.volumes||[]).filter(v=>v.persistentVolumeClaim&&v.persistentVolumeClaim.claimName==='dev-pod-repo').map(v=>v.name).join(',')"
  echo "volume: $output"
  [ -n "$output" ]
}

@test "only repo-sync mounts the checkout writable" {
  volname="$(y "$DEPLOY" "(d.spec.template.spec.volumes||[]).filter(v=>v.persistentVolumeClaim&&v.persistentVolumeClaim.claimName==='dev-pod-repo').map(v=>v.name)[0]||''")"
  [ -n "$volname" ] || { echo "kein PVC-Volume dev-pod-repo im Deployment"; false; }

  # Positiv-Anker: mindestens ein Container mountet das Volume ueberhaupt.
  run y "$DEPLOY" "d.spec.template.spec.containers.flatMap(c=>(c.volumeMounts||[]).filter(m=>m.name==='$volname').map(m=>c.name)).join(',')"
  echo "mounters: $output"
  [ -n "$output" ] || { echo "niemand mountet das Checkout — der Negativtest waere vakuos"; false; }

  # Genau ein Schreiber, und der heisst repo-sync.
  run y "$DEPLOY" "d.spec.template.spec.containers.flatMap(c=>(c.volumeMounts||[]).filter(m=>m.name==='$volname'&&m.readOnly!==true).map(m=>c.name)).join(',')"
  echo "writers: $output"
  [ "$output" = "repo-sync" ]
}

# ── Keine Paketinstallation zur Laufzeit ──────────────────────────────

@test "no container installs packages at startup" {
  run y "$DEPLOY" "JSON.stringify(d.spec.template.spec.containers.map(c=>[c.command||[],c.args||[]]))"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" > "$BATS_TEST_TMPDIR/cmds.json"
  run bash -c "grep -ciE 'apk add|apt-get install|npm install|pip install' '$BATS_TEST_TMPDIR/cmds.json' || true"
  echo "runtime installs: $output"
  [ "$output" = "0" ]
}

@test "mcp-node image is built from a Dockerfile that carries its dependencies" {
  df="$REPO/docker/mcp-node/Dockerfile"
  [ -f "$df" ] || { echo "erwartet: docker/mcp-node/Dockerfile"; false; }
  # Positiv-Anker: das Image installiert seine Abhaengigkeiten zur BAUZEIT.
  run bash -c "grep -cE '^RUN .*(apk add|npm install|npm ci)' '$df' || true"
  echo "build-time installs: $output"
  [ "$output" -ge 1 ]
  # ... und nicht im Startpfad.
  run bash -c "grep -E '^(CMD|ENTRYPOINT)' '$df' | grep -cE 'apk add|npm install' || true"
  echo "startup installs: $output"
  [ "$output" = "0" ]
}

@test "repo-sync image is built from a Dockerfile" {
  [ -f "$REPO/docker/repo-sync/Dockerfile" ] || { echo "erwartet: docker/repo-sync/Dockerfile"; false; }
}

# ── Kein oeffentlicher Endpunkt ───────────────────────────────────────

@test "dev-pod service is a plain ClusterIP" {
  [ -f "$SVC" ] || { echo "erwartet: k3d/dev-pod/service.yaml"; false; }
  run y "$SVC" "(d.spec.type||'ClusterIP')"
  echo "type: $output"
  [ "$output" = "ClusterIP" ]
}

@test "no Ingress, IngressRoute or LoadBalancer exposes the dev-pod" {
  # Positiv-Anker: das Overlay-Verzeichnis existiert und traegt Manifeste.
  run bash -c "ls '$REPO/k3d/dev-pod'/*.yaml | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -ge 3 ]

  # Repo-weit: kein Manifest bringt dev-pod mit einem exponierenden Kind zusammen.
  run bash -c "grep -rl dev-pod '$REPO/k3d' '$REPO/prod-fleet' --include=*.yaml \
    | xargs -r grep -lE '^kind: (Ingress|IngressRoute)\$|type: LoadBalancer' || true"
  echo "exposing manifests: $output"
  [ -z "$output" ]
}

# ── Flux-Zustellung statt manuellem Apply ─────────────────────────────

@test "dev-pod overlay is referenced by a Flux Kustomization" {
  ks="$REPO/flux/clusters/fleet/ks-dev-pod.yaml"
  [ -f "$ks" ] || { echo "erwartet: flux/clusters/fleet/ks-dev-pod.yaml"; false; }
  run y "$ks" "d.kind+' '+d.spec.path"
  echo "output: $output"
  [ "$output" = "Kustomization ./dev-pod" ]

  [ -f "$REPO/prod-fleet/dev-pod/kustomization.yaml" ] \
    || { echo "erwartet: prod-fleet/dev-pod/kustomization.yaml"; false; }
  run grep -q 'k3d/dev-pod' "$REPO/prod-fleet/dev-pod/kustomization.yaml"
  [ "$status" -eq 0 ]
}

@test "the render pipeline emits the dev-pod overlay into the artifact tree" {
  # Ohne Render-Eintrag liegt das Overlay im Repo, aber nie im OCI-Artefakt —
  # die Flux-Kustomization stuende dauerhaft auf "path not found".
  run grep -q 'prod-fleet/dev-pod' "$REPO/scripts/flux-render-artifact.sh"
  [ "$status" -eq 0 ]
}

# ── Requests am gemessenen Verbrauch, nicht an den Altwerten ──────────

@test "memory requests stay well below the monolith's 960Mi declaration" {
  # Monolith: 960Mi deklariert bei 341Mi realem Verbrauch (proposal.md).
  run y "$DEPLOY" "d.spec.template.spec.containers.reduce((s,c)=>s+parseInt(String(c.resources.requests.memory).replace('Mi','')),0)"
  echo "sum(requests.memory) = ${output}Mi"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
  [ "$output" -lt 960 ]
}

@test "every container declares a memory limit" {
  run y "$DEPLOY" "d.spec.template.spec.containers.filter(c=>!(c.resources&&c.resources.limits&&c.resources.limits.memory)).map(c=>c.name).join(',')"
  echo "ohne Limit: [$output]"
  [ -z "$output" ]
}
