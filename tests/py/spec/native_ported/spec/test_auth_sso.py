"""Native migration of tests/spec/auth-sso.bats."""

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def rendered(repo_root):
    """Render both prod overlays once (mirrors setup_file). Output kept even on kubectl error."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not available")

    def _render(overlay: str) -> str:
        res = subprocess.run(
            ["kubectl", "kustomize", str(repo_root / "prod-fleet" / overlay),
             "--load-restrictor=LoadRestrictionsNone"],
            capture_output=True, text=True, timeout=180,
        )
        return res.stdout

    return {"mentolder": _render("mentolder"), "korczewski": _render("korczewski")}


def _count_lines(text: str, needle: str) -> int:
    """Equivalent of `grep -c -- <needle>` (fixed-string match per line)."""
    return sum(1 for line in text.splitlines() if needle in line)


def _read(path: Path) -> str:
    """Read a file; a missing file behaves like grep on a missing file (no match)."""
    return path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""


# ── prod render (mentolder / korczewski) ──────────────────────────────────

def test_prod_render_mentolder_no_ssl_insecure_skip_verify_anywhere(rendered):
    assert "--ssl-insecure-skip-verify" not in rendered["mentolder"], (
        "FAIL: ssl-insecure-skip-verify still rendered"
    )


def test_prod_render_mentolder_no_insecure_oidc_allow_unverified_email_anywhere(rendered):
    assert "--insecure-oidc-allow-unverified-email" not in rendered["mentolder"], (
        "FAIL: insecure-oidc-allow-unverified-email still rendered"
    )


def test_prod_render_mentolder_every_email_domain_gate_is_group_restricted(rendered):
    # T001851: --email-domain=* is deliberate; authorization comes from --allowed-group.
    render = rendered["mentolder"]
    wildcard = _count_lines(render, "--email-domain=*")
    groups = _count_lines(render, "- --allowed-group=")
    assert wildcard >= 1, "FAIL: expected wildcard email-domain gates (v7.9.0 startup requirement), got 0"
    assert wildcard == groups, f"FAIL: {wildcard} wildcard gates but {groups} allowed-group restrictions"


def test_prod_render_mentolder_exactly_7_gates_carry_allowed_group_workspace_users(rendered):
    count = _count_lines(rendered["mentolder"], "- --allowed-group=workspace-users")
    assert count == 7, f"FAIL: expected 7 allowed-group gates, got {count}"


def test_prod_render_mentolder_exactly_8_gates_carry_oidc_groups_claim_groups(rendered):
    count = _count_lines(rendered["mentolder"], "- --oidc-groups-claim=groups")
    assert count == 8, f"FAIL: expected 8 oidc-groups-claim gates, got {count}"


def test_prod_render_mentolder_exactly_8_gates_request_the_groups_scope(rendered):
    count = _count_lines(rendered["mentolder"], "- --scope=openid email profile groups")
    assert count == 8, f"FAIL: expected 8 gates with groups scope, got {count}"


def test_prod_render_mentolder_the_4_allowlist_gates_keep_authenticated_emails_file(rendered):
    count = _count_lines(rendered["mentolder"], "- --authenticated-emails-file")
    assert count == 4, f"FAIL: expected 3 authenticated-emails-file gates, got {count}"


def test_prod_render_korczewski_no_insecure_flags_anywhere(rendered):
    render = rendered["korczewski"]
    assert not re.search(r"--(ssl-insecure-skip-verify|insecure-oidc-allow-unverified-email)", render), (
        "FAIL: insecure flag rendered on korczewski"
    )
    wildcard = _count_lines(render, "--email-domain=*")
    groups = _count_lines(render, "- --allowed-group=")
    assert wildcard == groups, (
        f"FAIL: {wildcard} wildcard gates but {groups} allowed-group restrictions on korczewski"
    )


def test_pocket_id_seed_job_provisions_the_workspace_users_group_idempotently(repo_root):
    text = _read(repo_root / "k3d/pocket-id-client-seed.yaml")
    assert "workspace-users" in text, "FAIL: workspace-users group missing in seed job"
    assert "/api/user-groups" in text, "FAIL: user-groups API call missing in seed job"
    assert "ensure_group" in text, "FAIL: ensure_group helper missing in seed job"


def test_orphaned_templates_brain_prod_korczewski_subtree_is_gone(repo_root):
    assert not (repo_root / "templates/brain/prod-korczewski").is_dir(), (
        "FAIL: templates/brain/prod-korczewski still exists"
    )


# ── T002122 ───────────────────────────────────────────────────────────────

def test_t002122_gerendertes_mentolder_overlay_nutzt_kein_skip_auth_routes(rendered):
    # The BATS case also required the render to succeed (status 0).
    assert rendered["mentolder"], "render produced no output"
    assert "--skip-auth-routes" not in rendered["mentolder"]


def test_t002122_gerendertes_korczewski_overlay_nutzt_kein_skip_auth_routes(rendered):
    assert rendered["korczewski"], "render produced no output"
    assert "--skip-auth-routes" not in rendered["korczewski"]


def test_t002122_oauth2_proxy_brett_behaelt_den_healthz_bypass_singular(rendered):
    assert rendered["mentolder"], "render produced no output"
    assert "--skip-auth-route=GET=^/healthz" in rendered["mentolder"]


# ── T002154 ───────────────────────────────────────────────────────────────

def _taskfile_sources(repo_root: Path):
    files = [repo_root / "Taskfile.yml"]
    tf_dir = repo_root / "taskfiles"
    if tf_dir.is_dir():
        files += [p for p in tf_dir.rglob("*") if p.is_file()]
    return files


def test_t002154_kein_bare_kurzname_als_pocket_id_url_fallback_im_taskfile(repo_root):
    hits = [
        str(p.relative_to(repo_root))
        for p in _taskfile_sources(repo_root)
        if "POCKET_ID_URL:-http://pocket-id:1411" in _read(p)
    ]
    assert not hits, (
        "FAIL: bare Kurzname 'pocket-id:1411' als Fallback — cross-namespace nicht auflösbar: "
        + ", ".join(hits)
    )


def test_t002154_jeder_pocket_id_url_fallback_rendert_zu_einem_fqdn(run_cmd, repo_root):
    assign_re = re.compile(r'POCKET_ID_URL="[^"]*"')
    found = set()
    for p in _taskfile_sources(repo_root):
        found.update(assign_re.findall(_read(p)))
    assignments = sorted(found)
    if not assignments:
        pytest.skip("keine POCKET_ID_URL-Zuweisung im Taskfile")

    for a in assignments:
        # Evaluate as the deploy would: POCKET_ID_URL unset, WORKSPACE_NAMESPACE empty.
        res = run_cmd(
            ["bash", "-c",
             'unset POCKET_ID_URL; WORKSPACE_NAMESPACE=""; eval "$1"; echo "$POCKET_ID_URL"',
             "_", a],
        )
        resolved = res.stdout.strip()
        assert ".svc.cluster.local" in resolved, (
            f"FAIL: '{a}' rendert zu '{resolved}' — kein FQDN, cross-namespace nicht auflösbar"
        )
        assert "pocket-id..svc" not in resolved, (
            f"FAIL: '{a}' rendert zu '{resolved}' — leeres Namespace-Segment"
        )


def test_t002154_website_pod_template_traegt_eine_checksum_config_annotation(repo_root):
    text = _read(repo_root / "k3d/website.yaml")
    assert "checksum/config" in text, (
        "FAIL: k3d/website.yaml hat keine checksum/config-Annotation im Pod-Template"
    )


# ── T002156 ───────────────────────────────────────────────────────────────

def test_t002156_website_config_sha_helper_existiert_und_ist_ausfuehrbar(repo_root):
    helper = repo_root / "scripts/website-config-sha.sh"
    assert helper.is_file() and os.access(helper, os.X_OK), (
        "FAIL: scripts/website-config-sha.sh fehlt oder ist nicht ausfuehrbar"
    )


def _run_helper(repo_root: Path, text: str) -> str:
    res = subprocess.run(
        ["bash", str(repo_root / "scripts/website-config-sha.sh")],
        input=text + "\n", capture_output=True, text=True, timeout=60,
    )
    return res.stdout.strip()


_BASE_MANIFEST = """apiVersion: v1
kind: ConfigMap
metadata:
  name: website-config
data:
  POCKET_ID_URL: "http://pocket-id.workspace.svc.cluster.local:1411"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
spec:
  template:
    spec:
      containers:
        - name: website
          image: ghcr.io/paddione/website:IMGTAG"""


def test_t002156_hash_ignoriert_den_image_tag_pfadunabhaengig(repo_root):
    helper = repo_root / "scripts/website-config-sha.sh"
    if not (helper.is_file() and os.access(helper, os.X_OK)):
        pytest.skip("Helper noch nicht vorhanden")
    a = _run_helper(repo_root, _BASE_MANIFEST.replace("IMGTAG", "sha-aaaaaaa"))
    b = _run_helper(repo_root, _BASE_MANIFEST.replace("IMGTAG", "sha-bbbbbbb"))
    assert a == b, (
        f"FAIL: Hash haengt vom Image-Tag ab ({a} != {b}) — die Render-Pfade wuerden "
        "sich gegenseitig ueberschreiben und Rollouts ausloesen."
    )
    assert a, "FAIL: Hash ist leer"


def test_t002156_hash_reagiert_auf_eine_geaenderte_config(repo_root):
    helper = repo_root / "scripts/website-config-sha.sh"
    if not (helper.is_file() and os.access(helper, os.X_OK)):
        pytest.skip("Helper noch nicht vorhanden")
    tmpl = (
        'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: website-config\ndata:\n'
        '  POCKET_ID_URL: "VALUE"'
    )
    a = _run_helper(repo_root, tmpl.replace("VALUE", "http://pocket-id:1411"))
    b = _run_helper(repo_root, tmpl.replace("VALUE", "http://pocket-id.workspace.svc.cluster.local:1411"))
    assert a != b, f"FAIL: Hash aendert sich nicht bei geaenderter Config ({a}) — kein Rollout-Trigger."


def test_t002156_flux_renderer_setzt_checksum_config_primaerer_deploy_pfad(repo_root):
    assert "WEBSITE_CONFIG_SHA" in _read(repo_root / "scripts/flux-render-artifact.sh"), (
        "FAIL: scripts/flux-render-artifact.sh kennt WEBSITE_CONFIG_SHA nicht."
    )


def test_t002156_flux_renderer_lehnt_eine_leer_substituierte_checksum_config_ab(repo_root):
    text = _read(repo_root / "scripts/flux-render-artifact.sh")
    assert re.search(r'checksum/config: *""|checksum_config_empty|EMPTY_CHECKSUM', text), (
        "FAIL: Der fail-closed-Check prueft nur auf UEBRIG GEBLIEBENE ${VAR}, nicht auf LEER substituierte."
    )


def test_t002156_alle_drei_render_pfade_nutzen_den_gemeinsamen_helper(repo_root):
    missing = []
    if "website-config-sha.sh" not in _read(repo_root / "scripts/flux-render-artifact.sh"):
        missing.append("flux-render-artifact.sh")
    if not any("website-config-sha.sh" in _read(p) for p in _taskfile_sources(repo_root)):
        missing.append("Taskfile-suite")
    if "website-config-sha.sh" not in _read(repo_root / ".github/workflows/build-website.yml"):
        missing.append("build-website.yml")
    assert not missing, f"FAIL: Pfade ohne gemeinsamen Helper: {' '.join(missing)}"


# ── T002205: Keycloak-Abschaltung vollstaendig ────────────────────────────

def test_t002205_realm_import_skripte_und_helper_existieren_nicht_mehr(repo_root):
    found = [
        f for f in (
            "scripts/import-entrypoint.sh",
            "prod/import-entrypoint.sh",
            "scripts/lib/keycloak-helpers.sh",
        )
        if (repo_root / f).exists()
    ]
    assert not found, f"FAIL: Keycloak-Realm-Import-Artefakte wieder da: {' '.join(found)}"


def test_t002205_deploy_sh_legt_keine_keycloak_import_script_configmap_an(repo_root):
    text = _read(repo_root / "k3d/deploy.sh")
    assert not re.search(r"keycloak-import-script|import-entrypoint\.sh", text), (
        "FAIL: k3d/deploy.sh verdrahtet wieder den Keycloak-Realm-Import."
    )


def test_t002205_kustomize_bases_referenzieren_keine_keycloak_generatoren(repo_root):
    bad = []
    for f in (
        "k3d/kustomization.yaml",
        "prod/kustomization.yaml",
        "prod-mentolder/kustomization.yaml",
        "prod-korczewski/kustomization.yaml",
        "prod-fleet/staging/kustomization.yaml",
    ):
        if re.search(r"realm-template|keycloak-import-script", _read(repo_root / f)):
            bad.append(f)
    assert not bad, f"FAIL: Keycloak-Generator-Referenzen in: {' '.join(bad)}"


def _is_grep_text(data: bytes) -> bool:
    """Approximates `grep -Iq .`: binary (NUL) files and files without any non-empty line are skipped."""
    if b"\x00" in data:
        return False
    return any(line.strip() for line in data.decode("utf-8", "replace").splitlines())


def test_t002205_keycloak_keys_sind_aus_schema_und_secrets_entfernt(repo_root):
    candidates = [repo_root / "environments/schema.yaml"]
    secrets_dir = repo_root / "environments/.secrets"
    if secrets_dir.is_dir():
        candidates += sorted(secrets_dir.glob("*.yaml"))
    bad = []
    pat = re.compile(r"^[ \t]*KEYCLOAK_(DB|ADMIN)_PASSWORD:", re.MULTILINE)
    for f in candidates:
        if not f.is_file():
            continue
        data = f.read_bytes()
        # git-crypt-locked files are binary blobs and cannot be evaluated.
        if not _is_grep_text(data):
            continue
        if pat.search(data.decode("utf-8", "replace")):
            bad.append(f.name)
    assert not bad, (
        f"FAIL: KEYCLOAK_*_PASSWORD wieder vorhanden in: {' '.join(bad)} — "
        "Keycloak ist decommissioned, Key nicht re-seeden (siehe environments/schema.yaml)."
    )


def test_t002205_backup_restore_kennt_kein_keycloak_ziel_mehr(repo_root):
    bad = [
        f for f in ("scripts/backup-restore-lib.sh", "scripts/backup-restore-db.sh", "scripts/backup-restore.sh")
        if "keycloak" in _read(repo_root / f).lower()
    ]
    assert not bad, f"FAIL: keycloak-Backup-Ziel noch verdrahtet in: {' '.join(bad)}"


def test_t002205_shared_db_exportiert_keinen_keycloak_db_alias_service(repo_root):
    text = _read(repo_root / "k3d/shared-db.yaml")
    assert not re.search(r"^[ \t]*name:[ \t]*keycloak-db[ \t]*$", text, re.MULTILINE), (
        "FAIL: Alias-Service keycloak-db in k3d/shared-db.yaml wieder vorhanden."
    )


# ── T002187: pocket-id-client-seed Fix (RC-1 bis RC-4) ────────────────────

def test_t002187_kein_nacktes_do_block_in_command_block_von_k3d_pocket_id_yaml(repo_root):
    # Naked "DO $$" in a command: block is expanded by the container shell (RC-2).
    assert "DO $$" not in _read(repo_root / "k3d/pocket-id.yaml"), (
        "FAIL: DO $$ in command:-Block von k3d/pocket-id.yaml — SQL in ConfigMap auslagern (T002187)."
    )


def test_t002187_db_init_nutzt_on_error_stop_1_fuer_den_db_rollen_block(repo_root):
    f = repo_root / "k3d/pocket-id.yaml"
    if not f.is_file():
        pytest.skip("pocket-id.yaml nicht gefunden")
    assert "ON_ERROR_STOP=0" not in f.read_text(encoding="utf-8"), (
        "FAIL: k3d/pocket-id.yaml enthält ON_ERROR_STOP=0 — SQL-Fehler werden verschluckt (RC-3)."
    )


def test_t002187_pocket_id_client_seed_job_traegt_flux_force_annotation(repo_root):
    f = repo_root / "k3d/pocket-id-client-seed.yaml"
    if not f.is_file():
        pytest.skip("pocket-id-client-seed.yaml nicht gefunden")
    assert re.search(r"kustomize\.toolkit\.fluxcd\.io/force:.*enabled", f.read_text(encoding="utf-8")), (
        'FAIL: k3d/pocket-id-client-seed.yaml hat keine kustomize.toolkit.fluxcd.io/force: "enabled" '
        "Annotation — Flux scheitert an immutablem Job.spec.template (RC-1)."
    )


def test_t002187_admin_bootstrap_enthaelt_keine_hardcodierte_uuid_a0000000(repo_root):
    bad = [
        Path(f).name
        for f in (repo_root / "k3d/pocket-id.yaml", repo_root / "k3d/pocket-id-db-init-sql.yaml")
        if "a0000000-0000-4000-8000" in _read(f)
    ]
    assert not bad, (
        f"FAIL: hardcodierte Admin-UUID a0000000-... gefunden in: {' '.join(bad)} — "
        "gegen SELECT id FROM users WHERE username = :admin_user auflösen (RC-4)."
    )
