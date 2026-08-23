#!/usr/bin/env bats
# tests/spec/collabora-integration.bats
# SSOT: openspec/specs/collabora-integration.md
# Mode: Manifest-Guard — das Sicherheitsversprechen manifestiert sich im
# Deployment-Quelltext, daher ist der YAML-Parse hier das angemessene Mittel.
# Ticket T014549 [SA-GR-06]: collabora container runAsNonRoot hardening.
# allowPrivilegeEscalation:false bleibt bewusst UNGESETZT (design.md D2):
# das setcap/user-namespace-Design braucht effektive File-Caps beim exec.

COLLABORA_YAML="k3d/office-stack/collabora.yaml"

@test "collabora container declares runAsNonRoot with intact setcap capability set" {
  command -v python3 >/dev/null 2>&1 || skip "python3 not available"
  run python3 -c 'import yaml'
  [ "$status" -eq 0 ] || skip "PyYAML not available"
  [ -f "$COLLABORA_YAML" ]

  run python3 - "$COLLABORA_YAML" <<'PYEOF'
import sys

import yaml

with open(sys.argv[1]) as fh:
    doc = next(d for d in yaml.safe_load_all(fh) if d.get("kind") == "Deployment")

errs = []
containers = doc["spec"]["template"]["spec"]["containers"]
collabora = next((c for c in containers if c.get("name") == "collabora"), None)
if collabora is None:
    errs.append("container 'collabora' not found in Deployment")
else:
    sc = collabora.get("securityContext")
    if not isinstance(sc, dict):
        errs.append("container securityContext missing")
    else:
        if sc.get("runAsNonRoot") is not True:
            errs.append(
                f"securityContext.runAsNonRoot must be true, got {sc.get('runAsNonRoot')!r}"
            )
        caps = sc.get("capabilities", {}).get("add") or []
        for cap in ("SYS_ADMIN", "MKNOD", "SETUID", "SETGID"):
            if cap not in caps:
                errs.append(f"capabilities.add regression: {cap} missing")
        if sc.get("allowPrivilegeEscalation") is False:
            errs.append(
                "allowPrivilegeEscalation=false breaks the setcap/user-namespace "
                "design (design.md D2) - must not be set to false"
            )

if errs:
    sys.stderr.write("\n".join(errs) + "\n")
    sys.exit(1)
PYEOF

  [ "$status" -eq 0 ] || {
    echo "$output"
    false
  }
}
