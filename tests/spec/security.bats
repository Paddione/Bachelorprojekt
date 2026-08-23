#!/usr/bin/env bats
# tests/spec/security.bats
# SSOT: openspec/specs/security.md
#
# Covers: Hybrid-auth model, secret rotation, ingress paths, NetworkPolicy exclusion.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Ingress configuration ─────────────────────────────────────────────

@test "k3d/ingress.yaml exists" {
  [ -f "$REPO/k3d/ingress.yaml" ]
}

@test "ingress.yaml is a valid Kubernetes Ingress manifest" {
  run grep -q 'apiVersion: networking.k8s.io' "$REPO/k3d/ingress.yaml"
  [ "$status" -eq 0 ]
}

@test "ingress.yaml defines workspace backend services" {
  run grep -q 'backend:' "$REPO/k3d/ingress.yaml"
  [ "$status" -eq 0 ]
}

# ── Secret rotation ───────────────────────────────────────────────────

@test "secret-rotate.sh script exists" {
  [ -f "$REPO/scripts/secret-rotate.sh" ]
}

@test "secret-rotate.sh is executable" {
  [ -x "$REPO/scripts/secret-rotate.sh" ]
}

# ── SealedSecrets infrastructure ──────────────────────────────────────

@test "environments/.secrets/ directory structure exists" {
  [ -d "$REPO/environments/.secrets" ] || skip "secrets dir not in worktree"
}

@test "env:seal task is declared in Taskfile" {
  run grep -q 'env:seal' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
}

# ── Security agent exists ─────────────────────────────────────────────

@test "bachelorprojekt-security agent file exists" {
  [ -f "$REPO/.claude/agents/bachelorprojekt-security.md" ]
}

# ── Run-as-non-root baseline (T015293) ────────────────────────────────
# SSOT: openspec/specs/security.md (Delta: changes/runasnonroot-hardening-followup)
# Gehardenede Deployments tragen pod-level runAsNonRoot + RuntimeDefault-Seccomp;
# ihre Container zusätzlich runAsNonRoot/runAsUser:1000/APE:false. Ausnahme-
# Container benötigen den maschinenlesbaren Marker '# runAsNonRoot-Ausnahme:'.

@test "run-as-non-root baseline: hardened Deployments tragen pod-level sc" {
  command -v python3 >/dev/null 2>&1 || skip "python3 nicht verfügbar"
  run python3 - "$REPO" <<'PYEOF'
import sys, yaml
repo = sys.argv[1]
targets = [
    ("k3d/coturn-stack/janus.yaml", "janus"),
    ("k3d/default/claude-code-mcp-monolith-deploy.yaml", "claude-code-mcp-monolith"),
    ("k3d/dev-stack/brett-dev.yaml", "brett"),
    ("k3d/dev-stack/website-dev.yaml", "website"),
    ("k3d/staging-stack/website-staging.yaml", "website"),
]
fails = []
for rel, dep in targets:
    docs = [d for d in yaml.safe_load_all(open(f"{repo}/{rel}")) if d]
    depdoc = next((d for d in docs if d.get("kind") == "Deployment"
                   and d["metadata"]["name"] == dep), None)
    if depdoc is None:
        fails.append(f"{rel}: Deployment {dep} fehlt")
        continue
    sc = depdoc["spec"]["template"]["spec"].get("securityContext") or {}
    if sc.get("runAsNonRoot") is not True:
        fails.append(f"{rel}:{dep}: pod-level runAsNonRoot != true")
    secc = (sc.get("seccompProfile") or {}).get("type")
    if secc != "RuntimeDefault":
        fails.append(f"{rel}:{dep}: pod-level seccompProfile.type != RuntimeDefault (ist {secc!r})")
if fails:
    print("\n".join(fails))
    sys.exit(1)
PYEOF
  [ "$status" -eq 0 ]
}

@test "run-as-non-root baseline: gehardenede Container-Level-sc" {
  command -v python3 >/dev/null 2>&1 || skip "python3 nicht verfügbar"
  run python3 - "$REPO" <<'PYEOF'
import sys, yaml
repo = sys.argv[1]
targets = [
    ("k3d/coturn-stack/janus.yaml", "janus", "janus", False),
    ("k3d/default/claude-code-mcp-monolith-deploy.yaml", "claude-code-mcp-monolith", "kubernetes", False),
    ("k3d/dev-stack/brett-dev.yaml", "brett", "brett", True),
    ("k3d/dev-stack/website-dev.yaml", "website", "website", False),
    ("k3d/staging-stack/website-staging.yaml", "website", "website", False),
]
fails = []
for rel, dep, cname, is_brett in targets:
    docs = [d for d in yaml.safe_load_all(open(f"{repo}/{rel}")) if d]
    spec = next((d["spec"]["template"]["spec"] for d in docs
                 if d.get("kind") == "Deployment" and d["metadata"]["name"] == dep), None)
    if spec is None:
        fails.append(f"{rel}: Deployment {dep} fehlt")
        continue
    conts = spec.get("containers", []) + (spec.get("initContainers") or [])
    c = next((c for c in conts if c["name"] == cname), None)
    if c is None:
        fails.append(f"{rel}: Container {cname} fehlt")
        continue
    sc = c.get("securityContext") or {}
    if sc.get("runAsNonRoot") is not True:
        fails.append(f"{rel}:{cname}: runAsNonRoot != true")
    if sc.get("runAsUser") != 1000:
        fails.append(f"{rel}:{cname}: runAsUser != 1000")
    if sc.get("allowPrivilegeEscalation") is not False:
        fails.append(f"{rel}:{cname}: allowPrivilegeEscalation != false")
    if is_brett:
        if sc.get("readOnlyRootFilesystem") is not True:
            fails.append(f"{rel}:{cname}: readOnlyRootFilesystem != true")
        drops = (sc.get("capabilities") or {}).get("drop") or []
        if drops != ["ALL"]:
            fails.append(f"{rel}:{cname}: capabilities.drop != ['ALL']")
if fails:
    print("\n".join(fails))
    sys.exit(1)
PYEOF
  [ "$status" -eq 0 ]
}

@test "run-as-non-root baseline: Ausnahme-Container tragen den Marker-Kommentar" {
  command -v python3 >/dev/null 2>&1 || skip "python3 nicht verfügbar"
  run python3 - "$REPO" <<'PYEOF'
import sys, re
repo = sys.argv[1]
exceptions = [
    ("k3d/default/claude-code-mcp-monolith-deploy.yaml",
     ["postgres", "playwright", "github", "github-binary"]),
    ("k3d/dev-stack/sish.yaml", ["sish"]),
    ("k3d/mentolder-web.yaml", ["mentolder-web"]),
]
fails = []
for rel, names in exceptions:
    lines = open(f"{repo}/{rel}").read().splitlines()
    for name in names:
        # Variante B: Annotations-Zeile (reine JSON-Manifeste haben keine Kommentare)
        marker_found = any(
            "# runAsNonRoot-Ausnahme:" in ln and re.search(re.escape(name) + r"\s*[:(]", ln)
            for ln in lines
        )
        start = None
        indent = ""
        for i, ln in enumerate(lines):
            m = re.match(r"^(\s*)- name: " + re.escape(name) + r"\s*$", ln)
            if m:
                start = i
                indent = m.group(1)
                break
        if start is None:
            if not marker_found:
                fails.append(f"{rel}: Container {name} nicht gefunden und Marker fehlt")
            continue
        for ln in lines[start + 1:]:
            stripped_len = len(ln) - len(ln.lstrip())
            if re.match(r"^\s*- name:", ln) and stripped_len <= len(indent):
                break
            if "# runAsNonRoot-Ausnahme:" in ln:
                marker_found = True
                break
        if not marker_found:
            fails.append(f"{rel}:{name}: Marker '# runAsNonRoot-Ausnahme:' fehlt")
if fails:
    print("\n".join(fails))
    sys.exit(1)
PYEOF
  [ "$status" -eq 0 ]
}
