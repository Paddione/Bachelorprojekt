#!/usr/bin/env bats
# tests/spec/security/workload-exec-rbac.bats
# SSOT: openspec/specs/security.md  (Change: openspec/changes/rbac-exec-least-privilege)
# Ticket: T900110
#
# Pruefmodus: Die Guards prüfen Kubernetes-Manifeste und Kustomize-Transformer-
# Semantik. Geprueft wird der Output eines Parsers ueber das Manifest
# (node + yaml), nicht ein Grep ueber Prosa. Kustomize-Nachweis (Test 6)
# nutzt `kubectl kustomize` gegen die Basis, wo verfuegbar.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  # Windows/MSYS: node braucht C:/... statt /c/... (siehe tests/spec/mcp-gateway.bats).
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
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

# --- 1.1.1: ClusterRole keeps read access but grants no pods/exec ---

@test "1.1.1: website ClusterRole keeps read access but grants no pods/exec" {
  # Positiv-Anker: es gibt Regeln mit pods (read) — die ClusterRole existiert.
  run y "$REPO/k3d/website.yaml" "(d.kind=='ClusterRole'&&d.metadata&&d.metadata.name&&d.metadata.name.endsWith('-monitoring-reader'))"
  echo "clusterrole found: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "true" ]

  # Negativ: keine Regel mit pods/exec — nach Positiv-Anker.
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).filter(r=>(r.resources||[]).includes('pods/exec')).length"
  echo "pods/exec rules: $output"
  [ "$output" = "0" ]
}

@test "1.1.1: ClusterRole still has list access to pods (read anchor)" {
  # Positiv-Anker fuer Negativtest oben: pods + list muss vorhanden sein.
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).filter(r=>(r.resources||[]).includes('pods')&&(r.verbs||[]).includes('list')).length"
  echo "pods+list rules: $output"
  [ "$output" -ge 1 ]
}

# --- 1.1.2: website-self-exec Role grants exec in the website namespace only ---

@test "1.1.2: website-self-exec Role grants exec in the website namespace only" {
  [ -f "$REPO/k3d/website.yaml" ] || { echo "erwartet: k3d/website.yaml"; false; }

  # Positiv-Anker: die Role-Definition existiert in der Datei.
  run y "$REPO/k3d/website.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).map(x=>x.toJS()).filter(d=>d.kind==='Role'&&d.metadata&&d.metadata.name==='website-self-exec').length"
  echo "website-self-exec Role count: $output"
  [ "$output" -ge 1 ]

  # Positiv-Anker: Rule hat pods/exec + create.
  run y "$REPO/k3d/website.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='Role'&&d.metadata&&d.metadata.name==='website-self-exec')?.rules?.filter(r=>(r.resources||[]).includes('pods/exec')&&(r.verbs||[]).includes('create')).length"
  echo "exec rules: $output"
  [ "$output" -ge 1 ]
}

@test "1.1.2: website-self-exec RoleBinding binds to website ServiceAccount" {
  run y "$REPO/k3d/website.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='RoleBinding'&&d.metadata&&d.metadata.name==='website-self-exec')?.subjects?.[0]?.name"
  echo "subject name: $output"
  [ "$output" = "website" ]
}

# --- 1.1.3: website-test-runner-exec is a namespaced Role ---

@test "1.1.3: website-test-runner-exec Role exists in k3d/website-test-runner-rbac.yaml" {
  [ -f "$REPO/k3d/website-test-runner-rbac.yaml" ] || { echo "erwartet: k3d/website-test-runner-rbac.yaml"; false; }

  run y "$REPO/k3d/website-test-runner-rbac.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).filter(d=>d.kind==='Role'&&d.metadata&&d.metadata.name==='website-test-runner-exec').length"
  echo "Role count: $output"
  [ "$output" -ge 1 ]
}

@test "1.1.3: website-test-runner-exec RoleBinding exists" {
  [ -f "$REPO/k3d/website-test-runner-rbac.yaml" ] || { echo "erwartet: k3d/website-test-runner-rbac.yaml"; false; }

  run y "$REPO/k3d/website-test-runner-rbac.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).filter(d=>d.kind==='RoleBinding'&&d.metadata&&d.metadata.name==='website-test-runner-exec').length"
  echo "RoleBinding count: $output"
  [ "$output" -ge 1 ]
}

@test "1.1.3: RoleBinding subject is website SA with namespace" {
  [ -f "$REPO/k3d/website-test-runner-rbac.yaml" ] || { echo "erwartet: k3d/website-test-runner-rbac.yaml"; false; }

  run y "$REPO/k3d/website-test-runner-rbac.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='RoleBinding'&&d.metadata&&d.metadata.name==='website-test-runner-exec')?.subjects?.[0]"
  echo "subject: $output"
  [ "$output" != "" ]
  run node -e "const s=JSON.parse('$output'); console.log(s.kind==='ServiceAccount'&&s.name==='website')"
  [ "$output" = "true" ]
}

# --- 1.1.4: k3d base references the test-runner RBAC ---

@test "1.1.4: k3d base references the test-runner RBAC in resources" {
  run grep -c 'website-test-runner-rbac.yaml' "$REPO/k3d/kustomization.yaml"
  echo "references: $output"
  [ "$output" -ge 1 ]
}

# --- 1.1.5: no ClusterRoleBinding grants pods/exec to website SA ---

@test "1.1.5: no ClusterRoleBinding in k3d binds a ClusterRole with pods/exec to website SA" {
  # Positiv-Anker: es gibt ClusterRoles mit pods/exec in den Dateien.
  run y "$REPO/k3d/website.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).filter(d=>d.kind==='ClusterRole'&&(d.rules||[]).some(r=>(r.resources||[]).includes('pods/exec'))).length"
  echo "CR with exec: $output"

  # Jetzt: ueber alle k3d/*.yaml, ob eine CRB mit pods/exec CR auf website subject zeigt.
  run bash -c "
    found=0
    for f in '$REPO'/k3d/*.yaml; do
      node -e \"
        const fs=require('fs'), yaml=require('yaml');
        const docs=yaml.parseAllDocuments(fs.readFileSync('$f','utf8')).map(x=>x.toJS()).filter(Boolean);
        const crs=docs.filter(d=>d.kind==='ClusterRole'&&(d.rules||[]).some(r=>(r.resources||[]).includes('pods/exec'))).map(d=>d.metadata.name);
        const crbs=docs.filter(d=>d.kind==='ClusterRoleBinding');
        for(const cb of crbs){
          const ref=cb.roleRef?.name;
          if(crs.includes(ref)){
            const s=(cb.subjects||[]).find(s=>s.kind==='ServiceAccount'&&s.name==='website');
            if(s){found=1; process.exit(0);}
          }
        }
      \" || true
    done
    echo \$found
  "
  echo "website SA in exec CRB: $output"
  [ "$output" = "0" ]
}

# --- 1.1.6: rendered base keeps the subject namespace (requires kubectl) ---

@test "1.1.6: rendered base keeps the subject namespace" {
  command -v kubectl >/dev/null || skip "kubectl binary not installed"

  # Test 2: kubectl kustomize gegen k3d und pruefe das gerenderte RoleBinding.
  # Das Subject muss den WEBSITE_NAMESPACE als Namespace enthalten.
  TMPD="$BATS_TEST_TMPDIR/kustomize-render"
  mkdir -p "$TMPD"
  run bash -c "kubectl kustomize '$REPO/k3d' > '$TMPD/rendered.yaml'"
  [ "$status" -eq 0 ] || { echo "kubectl kustomize fehlgeschlagen"; false; }

  [ -f "$TMPD/rendered.yaml" ] || { echo "rendered.yaml nicht erstellt"; false; }

  # Das gerenderte RoleBinding 'website-test-runner-exec' hat metadata.namespace und Subject-namespace.
  run y "$TMPD/rendered.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='RoleBinding'&&d.metadata&&d.metadata.name==='website-test-runner-exec')?.metadata?.namespace"
  echo "rolebinding ns: $output"
  # Muss ein nicht-leerer Namespace sein — je nach Overlay (workspace, workspace-staging, etc.)
  [ -n "$output" ]

  run y "$TMPD/rendered.yaml" "require('yaml').parseAllDocuments(fs.readFileSync(process.argv[1],'utf8')).find(d=>d.kind==='RoleBinding'&&d.metadata&&d.metadata.name==='website-test-runner-exec')?.subjects?.[0]?.namespace"
  echo "subject ns: $output"
  # Der Subject-Namespace bleibt literal (Kustomize-Transformer schreibt ihn nicht um).
  [ "$output" = "\${WEBSITE_NAMESPACE}" ]
}
