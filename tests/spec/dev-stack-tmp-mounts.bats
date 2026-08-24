#!/usr/bin/env bats
# tests/spec/dev-stack-tmp-mounts.bats
# SSOT: openspec/changes/wsl-exit-brett-dev-tmp/specs/fleet-operations.md [T016424]
#
# Dev-Stack-Deployments mit runAsUser != 0 brauchen ein schreibbares /tmp
# (emptyDir), sonst crashen Images beim Start (brett: mkdir '/tmp/tsx-1000'
# ENOENT → CrashLoopBackOff, flux-dev rot).

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  DEV_STACK_DIR="${REPO_ROOT}/k3d/dev-stack"
}

@test "non-root dev-stack deployments mount writable /tmp emptyDir" {
  if ! command -v python3 >/dev/null 2>&1; then
    skip "python3 is not installed"
  fi

  run python3 - "${DEV_STACK_DIR}" <<'PY'
import glob
import sys

import yaml

# Bilder mit nachweislich keinem /tmp-Schreibzugriff (read-only rootfs läuft
# seit Monaten ohne /tmp-Mount). Jeder neue Eintrag braucht eine Begründung.
ALLOWLIST = {
    "oauth2-proxy": "image schreibt nicht nach /tmp (kein tsx/npm-Laufzeitpfad)",
}


def tmp_emptydir_missing(doc):
    pod = (doc.get("spec") or {}).get("template", {}).get("spec", {})
    volumes = {v.get("name"): v for v in pod.get("volumes") or []}
    problems = []
    for container in pod.get("containers") or []:
        sec = container.get("securityContext") or {}
        uid = sec.get("runAsUser")
        if uid in (None, 0):
            continue
        label = f"container={container.get('name')} runAsUser={uid}"
        has_tmp = any(
            m.get("mountPath", "").rstrip("/") == "/tmp"
            and volumes.get(m.get("name"), {}).get("emptyDir") is not None
            for m in container.get("volumeMounts") or []
        )
        if has_tmp:
            continue
        if container.get("name") in ALLOWLIST:
            continue
        problems.append(label)
    return problems


problems = []
for path in sorted(glob.glob(f"{sys.argv[1]}/*.yaml")):
    with open(path) as fh:
        docs = yaml.safe_load_all(fh)
        for doc in docs or []:
            if not isinstance(doc, dict) or doc.get("kind") != "Deployment":
                continue
            for label in tmp_emptydir_missing(doc):
                problems.append(f"{path}: {label}: no /tmp emptyDir volumeMount")

if problems:
    print("\n".join(problems))
    sys.exit(1)
PY

  if [ "$status" -ne 0 ]; then
    echo "$output"
  fi
  [ "$status" -eq 0 ]
}
