#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-registry-cache.bats — Cache an beiden Standorten [T012177]
#
# PRUEFMODUS: gemischt. fleet-Seite per Struktur-Inspektion (kubectl kustomize +
# yaml.safe_load_all, kein Cluster-Zugriff, gleiche Basis wie
# gitlab-runner-fleet-guardrails.bats). Lokale Seite per Output-Verifikation
# (scripts/gitlab-runner-cache.sh wird tatsaechlich mit --dry-run ausgefuehrt und
# $status/$output geprueft — analog tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats,
# T002448-M4). Kein Test ruft echtes `docker run` auf.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  STACK_DIR="${REPO_ROOT}/k3d/gitlab-runner-stack"
  CACHE_SH="${REPO_ROOT}/scripts/gitlab-runner-cache.sh"
  RENDERED_FILE="$(mktemp)"
}

teardown() {
  rm -f "$RENDERED_FILE"
}

_render_to_file() {
  if [ ! -d "$STACK_DIR" ]; then
    echo "erwartetes Verzeichnis fehlt: $STACK_DIR" >&2
    return 1
  fi
  if ! kubectl kustomize "$STACK_DIR" --load-restrictor=LoadRestrictionsNone >"$RENDERED_FILE" 2>/tmp/gitlab-registry-cache.err.$$; then
    echo "kubectl kustomize $STACK_DIR ist fehlgeschlagen:" >&2
    cat /tmp/gitlab-registry-cache.err.$$ >&2
    rm -f /tmp/gitlab-registry-cache.err.$$
    return 1
  fi
  rm -f /tmp/gitlab-registry-cache.err.$$
}

@test "gitlab-registry-cache: registry-cache-Deployment existiert im gerenderten Manifest (Positiv-Anker)" {
  _render_to_file

  # Positiv-Anker [T002356-M1]: erst Existenz belegen, bevor der Env-Inhalt geprueft wird.
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

hit = any(
    d.get("kind") == "Deployment" and (d.get("metadata") or {}).get("name") == "registry-cache"
    for d in docs
)
print("OK" if hit else "MISSING")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: registry-cache-Deployment ist im Proxy-Modus gegen Docker Hub konfiguriert" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

deploys = [
    d for d in docs
    if d.get("kind") == "Deployment" and (d.get("metadata") or {}).get("name") == "registry-cache"
]
if not deploys:
    print("MISSING")
    sys.exit()

containers = ((deploys[0].get("spec") or {}).get("template") or {}).get("spec", {}).get("containers") or []
found = False
for c in containers:
    for env in c.get("env") or []:
        if env.get("name") == "REGISTRY_PROXY_REMOTEURL" and env.get("value") == "https://registry-1.docker.io":
            found = True
print("OK" if found else "MISSING_ENV")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: registry-cache-Service exponiert Port 5000" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

svcs = [
    d for d in docs
    if d.get("kind") == "Service" and (d.get("metadata") or {}).get("name") == "registry-cache"
]
if not svcs:
    print("MISSING")
    sys.exit()

ports = (svcs[0].get("spec") or {}).get("ports") or []
hit = any(p.get("port") == 5000 for p in ports)
print("OK" if hit else "WRONG_PORT")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: registry-cache-data PVC referenziert die longhorn-StorageClass" {
  _render_to_file

  # local-path waere hier bewusst falsch: kein allowVolumeExpansion und
  # node-lokaler hostPath-Speicher, der bei Pod-Umzug auf den anderen Worker
  # nicht mitwandert (p3-cache.md, StorageClass-Entscheidung).
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

pvcs = [
    d for d in docs
    if d.get("kind") == "PersistentVolumeClaim" and (d.get("metadata") or {}).get("name") == "registry-cache-data"
]
if not pvcs:
    print("MISSING")
    sys.exit()

sc = (pvcs[0].get("spec") or {}).get("storageClassName")
print("OK" if sc == "longhorn" else "WRONG_SC:" + str(sc))
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: lokales Cache-Skript existiert und --dry-run gibt den Registry-Container-Befehl aus, Exit 0" {
  if [ ! -f "$CACHE_SH" ]; then
    echo "erwartete Datei fehlt: $CACHE_SH" >&2
    false
  fi

  run bash "$CACHE_SH" --dry-run
  [ "$status" -eq 0 ]

  # Nur spezifische Cache-Tokens pruefen, kein unqualifizierter $output-Match auf
  # $0/Skriptpfad — der Worktree-Name "gitlab-k8s-runner" darf keinen Treffer
  # erzeugen koennen (Konventionsliste in p4-tests.md).
  echo "$output" | grep -qe 'REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io'
  echo "$output" | grep -qF -- 'registry:2'
}

@test "gitlab-registry-cache: --dry-run beruehrt weder Docker noch Dateisystem und braucht kein installiertes docker" {
  if [ ! -f "$CACHE_SH" ]; then
    echo "erwartete Datei fehlt: $CACHE_SH" >&2
    false
  fi

  # PATH ohne docker fuer den Skript-internen `command -v docker`-Check. `bash`
  # selbst wird als ABSOLUTER Pfad uebergeben, damit `env` es nicht erst ueber die
  # (leere) neue PATH suchen muss — sonst waere der Testaufbau selbst kaputt,
  # unabhaengig davon, ob das Skript funktioniert.
  real_bash="$(command -v bash)"
  empty_path_dir="$(mktemp -d)"
  run env PATH="$empty_path_dir" "$real_bash" "$CACHE_SH" --dry-run
  rm -rf "$empty_path_dir"
  [ "$status" -eq 0 ]
}

@test "gitlab-registry-cache: Echtlauf ohne installiertes docker bricht ab und benennt die fehlende Voraussetzung" {
  if [ ! -f "$CACHE_SH" ]; then
    echo "erwartete Datei fehlt: $CACHE_SH" >&2
    false
  fi

  real_bash="$(command -v bash)"
  empty_path_dir="$(mktemp -d)"
  run env PATH="$empty_path_dir" "$real_bash" "$CACHE_SH"
  rm -rf "$empty_path_dir"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qe 'docker'
}
