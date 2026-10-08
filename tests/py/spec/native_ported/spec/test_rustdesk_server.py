"""Native migration of tests/spec/rustdesk-server.bats."""

import re
import shutil
import xml.dom.minidom
from pathlib import Path

import pytest


def _has(text: str, pattern: str) -> bool:
    """grep -qE <pattern>: Treffer in mindestens einer Zeile."""
    return any(re.search(pattern, line) for line in text.splitlines())


def _count(text: str, pattern: str) -> int:
    """grep -cE <pattern>: Anzahl Treffer-Zeilen."""
    return sum(1 for line in text.splitlines() if re.search(pattern, line))


def _awk_range(text: str, start: str, end: str) -> str:
    """awk '/start/,/end/' — Bereich inklusive Start- und Endzeile (Ende ab der Folgezeile geprueft)."""
    out, in_range = [], False
    for line in text.splitlines():
        if not in_range and re.search(start, line):
            in_range = True
            out.append(line)
            continue
        if in_range:
            out.append(line)
            if re.search(end, line):
                in_range = False
    return "\n".join(out)


def _awk_first_block(text: str, start: str, end: str) -> str:
    """awk '/start/{f=1} f{print} f&&/end/{exit}' — erster Block bis zur Endzeile (inklusive)."""
    out, f = [], False
    for line in text.splitlines():
        if re.search(start, line):
            f = True
        if f:
            out.append(line)
            if re.search(end, line):
                break
    return "\n".join(out)


@pytest.fixture
def rd(repo_root):
    return {
        "root": repo_root,
        "stack": repo_root / "k3d" / "rustdesk-stack",
        "k3d": repo_root / "k3d",
        "workflow": repo_root / ".github" / "workflows" / "build-rustdesk-installer.yml",
    }


def _kustomize(run_cmd, path, *extra):
    if shutil.which("kustomize") is None:
        pytest.skip("kustomize not installed")
    r = run_cmd(["kustomize", "build", str(path), *extra])
    assert r.returncode == 0, r.output
    return r.stdout


def _kubectl_kustomize(run_cmd, path):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    r = run_cmd(["kubectl", "kustomize", str(path)])
    assert r.returncode == 0, r.output
    return r.stdout


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# ── Stack-Render (kustomize) ───────────────────────────────────────────

def test_rustdesk_kustomize_build_k3d_rustdesk_stack_succeeds_no_broken_refs(run_cmd, rd):
    if shutil.which("kustomize") is None:
        pytest.skip("kustomize not installed")
    r = run_cmd(["kustomize", "build", str(rd["stack"])])
    assert r.returncode == 0, r.output


def test_rustdesk_namespace_enforces_privileged_psa(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    assert _has(out, r"kind:[ \t]+Namespace")
    assert _has(out, r"pod-security.kubernetes.io/enforce:[ \t]*privileged")


def test_rustdesk_hbbs_hbbr_run_on_hostnetwork_pinned_to_turn_node(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    assert _count(out, r"^kind:[ \t]+Deployment") == 2
    assert _has(out, r"hostNetwork:[ \t]*true")
    assert _has(out, r"kubernetes.io/hostname:[ \t]*\$\{TURN_NODE\}")


def test_rustdesk_hbbs_exposes_21115_tcp_and_21116_tcp_udp(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    assert _has(out, r"hostPort:[ \t]*21115")
    assert _has(out, r"hostPort:[ \t]*21116")
    # 21116 muss fuer TCP und UDP erscheinen.
    assert _count(out, r"containerPort:[ \t]*21116") >= 2


def test_rustdesk_hbbr_exposes_21117_tcp(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    assert _has(out, r"hostPort:[ \t]*21117")


def test_rustdesk_web_hbbs_adds_web_client_port_21118_tcp_hbbr_adds_21119_tcp(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    assert _has(out, r"hostPort:[ \t]*21118")
    assert _has(out, r"hostPort:[ \t]*21119")


def test_rustdesk_web_bridge_services_are_selector_less_with_matching_endpoints_to_turn_overlay_ip(run_cmd, rd):
    # rustdesk-web-bridge.yaml ist prod-only; daher den prod-Overlay bauen.
    out = _kustomize(run_cmd, rd["root"] / "prod", "--load-restrictor=LoadRestrictionsNone")
    assert _has(out, r"name:[ \t]*rustdesk-web-hbbs")
    assert _has(out, r"name:[ \t]*rustdesk-web-hbbr")
    assert _has(out, r"kind:[ \t]*Endpoints")
    assert _has(out, r'ip:[ \t]*"?\$\{TURN_OVERLAY_IP\}"?')
    # Die Bridge-Services duerfen KEIN selector tragen (manuell gepflegte Endpoints).
    svc_block = _awk_range(out, r"name: rustdesk-web-hbbs", r"^---")
    assert not _has(svc_block, r"^\s*selector:")


def test_rustdesk_web_oauth2_proxy_rustdesk_web_fronts_the_bridges_downloads_pattern(run_cmd, rd):
    out = _kustomize(run_cmd, rd["k3d"], "--load-restrictor=LoadRestrictionsNone")
    assert _has(out, r"name:[ \t]*oauth2-proxy-rustdesk-web")
    assert _has(out, r"client-id=rustdesk-web")
    assert _has(out, r"rustdesk-web-hbbs:21118")
    assert _has(out, r"rustdesk-web-hbbr:21119")


def test_rustdesk_web_dev_ingress_routes_remote_localhost_to_the_proxy(run_cmd, rd):
    out = _kustomize(run_cmd, rd["k3d"], "--load-restrictor=LoadRestrictionsNone")
    assert _has(out, r"host:[ \t]*remote\.localhost")


def test_rustdesk_web_every_ufw_21118_21119_rule_is_overlay_restricted_10_20_0_0_16(repo_root):
    for rel in ("prod/cloud-init.yaml",
                "scripts/hetzner/cloud-init.yaml.tmpl",
                "scripts/hetzner/cloud-init-server.yaml.tmpl"):
        path = repo_root / rel
        text = _read(path)
        # Die Port-Regel muss existieren.
        assert _has(text, r"2111[89]"), rel
        # Keine 21118/21119-Zeile darf das Overlay-CIDR vermissen.
        lines = [line for line in text.splitlines() if re.search(r"2111[89]", line)]
        assert not any(not re.search(r"10\.20\.0\.0/16", line) for line in lines), rel


def test_rustdesk_image_is_digest_pinned(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    assert _has(out, r"image:[ \t]*rustdesk/rustdesk-server:[^@]+@sha256:[0-9a-f]{64}")


# ── RustDesk MSI installer + SSO-gated downloads (T001378) ─────────────

def test_rustdesk_client_k3d_base_builds_with_downloads_oauth2_proxy_downloads(run_cmd, rd):
    out = _kubectl_kustomize(run_cmd, rd["k3d"])
    assert _has(out, r"^  name: downloads$")
    assert _has(out, r"^  name: oauth2-proxy-downloads$")


def test_rustdesk_client_downloads_ingress_routes_through_the_oauth2_proxy_sso_gate_req_003(run_cmd, rd):
    out = _kubectl_kustomize(run_cmd, rd["k3d"])
    lines = out.splitlines()
    windows = []
    for i, line in enumerate(lines):
        if "host: downloads.localhost" in line:
            windows.extend(lines[i:i + 9])
    assert any("oauth2-proxy-downloads" in line for line in windows)


def test_rustdesk_client_prod_overlay_wires_downloads_for_fleet_reachability(run_cmd, rd):
    out = _kubectl_kustomize(run_cmd, rd["root"] / "prod")
    assert "workspace-ingress-downloads" in out
    assert "oauth2-proxy-downloads" in out


def test_rustdesk_client_no_brand_domain_literal_in_downloads_manifests_s3(rd):
    files = [
        rd["root"] / "k3d" / "downloads.yaml",
        rd["root"] / "k3d" / "oauth2-proxy-downloads.yaml",
        rd["root"] / "prod" / "patch-oauth2-proxy-downloads.yaml",
    ]
    hits = []
    for f in files:
        if not f.is_file():
            continue
        for line in _read(f).splitlines():
            if re.search(r"mentolder\.de|korczewski\.de", line):
                hits.append(f"{f}:{line}")
    assert not hits, "\n".join(hits)


def test_rustdesk_client_downloads_uses_the_prod_domain_pattern_in_prod_like_docs(rd):
    assert "downloads.${PROD_DOMAIN}" in _read(rd["root"] / "prod" / "configmap-domains.yaml")
    assert "downloads.${PROD_DOMAIN}" in _read(rd["root"] / "prod" / "ingress.yaml")


def test_rustdesk_client_downloads_oidc_client_is_seeded_in_pocket_id(rd):
    assert "downloads|SECRET_downloads" in _read(rd["root"] / "k3d" / "pocket-id-client-seed.yaml")
    assert "POCKET_ID_DOWNLOADS_SECRET" in _read(rd["root"] / "environments" / "schema.yaml")


def test_rustdesk_client_build_workflow_is_workflow_dispatch_only_no_push_trigger_req_004(rd):
    assert rd["workflow"].is_file()
    text = _read(rd["workflow"])
    assert _has(text, r"^\s*workflow_dispatch:")
    # Kein push-Trigger im on:-Block.
    assert not _has(text, r"^\s*push:")


def test_rustdesk_client_msi_is_never_uploaded_as_a_workflow_artifact_req_003(rd):
    assert rd["workflow"].is_file()
    assert not _has(_read(rd["workflow"]),
                    r"actions/upload-artifact|upload-release-asset|softprops/action-gh-release")


def test_rustdesk_client_workflow_hard_fails_if_downloads_content_package_is_public_req_003_backstop(rd):
    assert rd["workflow"].is_file()
    text = _read(rd["workflow"])
    assert "Verify downloads-content package is private" in text
    assert _has(text, r"visibility.*!=.*private")


def test_rustdesk_client_official_rustdesk_msi_is_version_sha256_pinned(rd):
    assert rd["workflow"].is_file()
    text = _read(rd["workflow"])
    assert _has(text, r'RUSTDESK_MSI_SHA256:\s*"[0-9a-f]{64}"')
    assert _has(text, r"RUSTDESK_MSI_URL:.*rustdesk.*\.msi")


# ── hbbs subPath Secret-Rotation (T001382) ─────────────────────────────

def test_rustdesk_hbbs_keypair_mount_still_uses_subpath_runbook_premise_guard(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    assert _has(out, r"subPath:[ \t]*id_ed25519$")
    assert _has(out, r"subPath:[ \t]*id_ed25519\.pub$")


def test_rustdesk_client_wix_wrapper_source_is_well_formed_xml(rd):
    xml.dom.minidom.parse(str(rd["root"] / "rustdesk-installer" / "Bundle.wxs"))
    xml.dom.minidom.parse(str(rd["root"] / "rustdesk-installer" / "rustdesk-installer.wixproj"))


def test_rustdesk_client_provision_cmd_keeps_secret_placeholders_no_committed_secret(rd):
    text = _read(rd["root"] / "rustdesk-installer" / "provision.cmd")
    assert "__RUSTDESK_CONFIG__" in text
    assert "__RUSTDESK_PASSWORD__" in text


# ── Manifest-Hardening (T014553) ───────────────────────────────────────

def test_rustdesk_hbbs_pod_spec_declares_run_as_non_root(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    block = _awk_first_block(out, r"^  name: hbbs$", r"^---$")
    assert _has(block, r"runAsNonRoot:[ \t]*true")
    assert _has(block, r"runAsUser:[ \t]*65534")
    assert _has(block, r"seccompProfile:")
    assert _has(block, r"type:[ \t]*RuntimeDefault")
    assert _has(block, r"allowPrivilegeEscalation:[ \t]*false")


def test_rustdesk_hbbr_pod_spec_declares_run_as_non_root(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    block = _awk_first_block(out, r"^  name: hbbr$", r"^---$")
    assert _has(block, r"runAsNonRoot:[ \t]*true")
    assert _has(block, r"runAsUser:[ \t]*65534")
    assert _has(block, r"seccompProfile:")
    assert _has(block, r"type:[ \t]*RuntimeDefault")
    assert _has(block, r"allowPrivilegeEscalation:[ \t]*false")


def test_rustdesk_working_dir_ist_nicht_root(run_cmd, rd):
    out = _kustomize(run_cmd, rd["stack"])
    # Positiv-Anker: workingDir zeigt auf das non-root-Verzeichnis.
    assert _has(out, r"workingDir:[ \t]*/var/lib/rustdesk")
    # Negativ: /root darf nicht mehr als workingDir vorkommen.
    assert _count(out, r"workingDir:[ \t]*/root") == 0


def test_rustdesk_readme_dokumentiert_netpol_ausnahme(rd):
    readme = _read(rd["root"] / "k3d" / "README.md")
    assert _has(readme, r"^## hostNetwork-Pods")
    assert "NetworkPolicy" in readme
    assert "${TURN_NODE}" in readme
