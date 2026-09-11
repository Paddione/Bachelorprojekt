#!/usr/bin/env bats
# tests/spec/security/website-clusterrole-least-privilege.bats
# SSOT: openspec/specs/security.md (Change: website-clusterrole-least-privilege)
# Ticket: T900114

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
}

y() {
  local _expr="$2"
  local _tmpf="$(mktemp /tmp/y_XXXXXX.js)"
  printf '%s' "$_expr" > "$_tmpf"
  node -e "
    const fs=require('fs'), yaml=require('yaml');
    const expr=fs.readFileSync(0,'utf8').trim();
    const file=process.argv[1];
    const docs=yaml.parseAllDocuments(fs.readFileSync(file,'utf8'))
      .map(x=>x.toJS()).filter(Boolean);
    const d=docs.find(x=>x.kind==='ClusterRole'&&x.metadata?.name?.endsWith('-monitoring-reader')) || docs[0];
    const out=eval('(' + expr + ')');
    console.log(typeof out==='string'?out:JSON.stringify(out));
  " "$1" < "$_tmpf"
  rm -f "$_tmpf"
}

# --- 1.1: ClusterRole is pure read-only ---

@test "1.1.1: website ClusterRole contains only read verbs (get, list)" {
  # Positive anchor: ClusterRole exists
  run y "$REPO/k3d/website.yaml" "(d.kind==='ClusterRole'&&d.metadata&&d.metadata.name&&d.metadata.name.endsWith('-monitoring-reader'))"
  [ "$status" -eq 0 ]
  [ "$output" = "true" ]

  # All verbs must be get or list
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).flatMap(r=>r.verbs||[]).filter(v=>!['get','list'].includes(v)).length"
  echo "non-read verbs count: $output"
  [ "$output" = "0" ]
}

@test "1.1.2: website ClusterRole has no delete verb on pods" {
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).filter(r=>(r.resources||[]).includes('pods')&&(r.verbs||[]).includes('delete')).length"
  echo "pods:delete rules: $output"
  [ "$output" = "0" ]
}

@test "1.1.3: website ClusterRole has no patch verb on deployments" {
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).filter(r=>(r.resources||[]).includes('deployments')&&(r.verbs||[]).includes('patch')).length"
  echo "deployments:patch rules: $output"
  [ "$output" = "0" ]
}

@test "1.1.4: website ClusterRole has no create verb on jobs or cronjobs" {
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).filter(r=>((r.resources||[]).includes('jobs')||(r.resources||[]).includes('cronjobs'))&&(r.verbs||[]).includes('create')).length"
  echo "jobs/cronjobs:create rules: $output"
  [ "$output" = "0" ]
}

@test "1.1.5: website ClusterRole does not reference obsolete argoproj.io" {
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).filter(r=>(r.apiGroups||[]).some(g=>g.includes('argoproj.io'))).length"
  echo "argoproj rules: $output"
  [ "$output" = "0" ]
}

@test "1.1.6: website ClusterRole retains read access to pods, deployments and jobs" {
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).some(r=>(r.resources||[]).includes('pods')&&(r.verbs||[]).includes('list'))"
  [ "$output" = "true" ]
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).some(r=>(r.resources||[]).includes('deployments')&&(r.verbs||[]).includes('list'))"
  [ "$output" = "true" ]
  run y "$REPO/k3d/website.yaml" "(d.rules||[]).some(r=>(r.resources||[]).includes('jobs')&&(r.verbs||[]).includes('list'))"
  [ "$output" = "true" ]
}

# --- 1.2: Namespaced Roles grant required write access ---

@test "1.2.1: Role website-self-exec grants deployments:patch in website namespace" {
  run y "$REPO/k3d/website.yaml" "docs.find(d=>d.kind==='Role'&&d.metadata?.name==='website-self-exec')?.rules?.filter(r=>(r.resources||[]).includes('deployments')&&(r.verbs||[]).includes('patch')).length"
  echo "deployments:patch in website-self-exec: $output"
  [ "$output" -ge 1 ]
}

@test "1.2.2: Role website-test-runner-exec grants deployments:patch in workspace" {
  run y "$REPO/k3d/website-test-runner-rbac.yaml" "docs.find(d=>d.kind==='Role'&&d.metadata?.name==='website-test-runner-exec')?.rules?.filter(r=>(r.resources||[]).includes('deployments')&&(r.verbs||[]).includes('patch')).length"
  echo "deployments:patch in workspace: $output"
  [ "$output" -ge 1 ]
}

@test "1.2.3: Role website-test-runner-exec grants jobs:create in workspace" {
  run y "$REPO/k3d/website-test-runner-rbac.yaml" "docs.find(d=>d.kind==='Role'&&d.metadata?.name==='website-test-runner-exec')?.rules?.filter(r=>(r.resources||[]).includes('jobs')&&(r.verbs||[]).includes('create')).length"
  echo "jobs:create in workspace: $output"
  [ "$output" -ge 1 ]
}
