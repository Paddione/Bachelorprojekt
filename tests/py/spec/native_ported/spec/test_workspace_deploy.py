"""Native migration of tests/spec/workspace-deploy.bats."""

# (T001396, T001400, T001411, T001652, T001853)

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

# Literal text of the re-quoting sed stage (T001411) as it appears in the Taskfiles.
REQUOTE_SED = r's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'
REQUOTE_RE = re.compile(r": \$\{([a-zA-Z0-9_]+)\}[ \t]*$")


def sed_ranges(text, start, end):
    """Emulate `sed -n '/START/,/END/p'` with literal start/end substrings (END checked after START)."""
    out, active = [], False
    for line in text.splitlines():
        if not active:
            if start in line:
                active = True
                out.append(line)
                # sed checks the end pattern starting with the line after START.
            continue
        out.append(line)
        if end in line:
            active = False
    return "\n".join(out)


@pytest.fixture
def tf(repo_root):
    return {
        "ws": (repo_root / "taskfiles" / "Taskfile.workspace.yml").read_text(encoding="utf-8"),
        "web": (repo_root / "taskfiles" / "Taskfile.web.yml").read_text(encoding="utf-8"),
        "root": repo_root,
    }


def _ws_deploy(tf):
    return sed_ranges_regex(tf["ws"], r"^  workspace:deploy:$", r"^  workspace:partial-deploy:$")


def sed_ranges_regex(text, start_re, end_re):
    """sed -n '/START_RE/,/END_RE/p' with regex patterns (end checked from the line after START)."""
    out, active = [], False
    for line in text.splitlines():
        if not active:
            if re.search(start_re, line):
                active = True
                out.append(line)
            continue
        out.append(line)
        if re.search(end_re, line):
            active = False
    return "\n".join(out)


def _envsubst_lines(block):
    return [l for l in block.splitlines() if re.match(r"^\s*ENVSUBST_VARS=", l)]


def _partial_block(tf):
    return sed_ranges_regex(tf["ws"], r"^  workspace:partial-deploy:$", r"^  workspace:fix-tickets-grants:$")


def test_workspace_deploy_prod_envsubst_vars_includes_smtp_user(tf):
    assert any("$SMTP_USER" in l for l in _envsubst_lines(_ws_deploy(tf)))


def test_workspace_deploy_prod_envsubst_vars_includes_pocket_id_smtp_tls(tf):
    assert any("$POCKET_ID_SMTP_TLS" in l for l in _envsubst_lines(_ws_deploy(tf)))


def test_workspace_deploy_prod_envsubst_vars_includes_smtp_port(tf):
    assert any("$SMTP_PORT" in l for l in _envsubst_lines(_ws_deploy(tf)))


def test_workspace_partial_deploy_envsubst_vars_includes_smtp_user(tf):
    assert any("$SMTP_USER" in l for l in _envsubst_lines(_partial_block(tf)))


def test_workspace_partial_deploy_envsubst_vars_includes_smtp_port(tf):
    assert any("$SMTP_PORT" in l for l in _envsubst_lines(_partial_block(tf)))


def test_workspace_partial_deploy_envsubst_vars_includes_pocket_id_smtp_tls(tf):
    assert any("$POCKET_ID_SMTP_TLS" in l for l in _envsubst_lines(_partial_block(tf)))


def test_k3d_pocket_id_yaml_wires_an_smtp_tls_container_env(tf):
    text = (tf["root"] / "k3d" / "pocket-id.yaml").read_text(encoding="utf-8")
    assert len(re.findall(r"name: SMTP_TLS", text)) >= 1


def test_workspace_deploy_dev_branch_envsubsts_studio_image_t001799(tf):
    block = sed_ranges_regex(_ws_deploy(tf), r"kustomize build k3d/", r"kubectl apply")
    assert "$STUDIO_IMAGE" in block


def test_workspace_deploy_dev_branch_still_envsubsts_smtp_user_no_regression(tf):
    block = sed_ranges_regex(_ws_deploy(tf), r"kustomize build k3d/", r"kubectl apply")
    assert "$SMTP_USER" in block


def test_workspace_deploy_dev_branch_re_quotes_kustomize_stripped_var_placeholders_before_envsubst_t001411(tf):
    block = sed_ranges_regex(_ws_deploy(tf), r"kustomize build k3d/", r"kubectl apply")
    assert block
    assert REQUOTE_SED in block


def test_workspace_deploy_prod_branch_re_quotes_kustomize_stripped_var_placeholders_before_envsubst_t001411(tf):
    block = sed_ranges_regex(_ws_deploy(tf), r'kustomize build "\$overlay/"', r"kubectl --context")
    assert block
    assert REQUOTE_SED in block


def test_prod_fleet_mentolder_overlay_renders_pocket_id_smtp_port_as_a_quoted_string_after_the_full_deploy_pipeline_t001411(run_cmd, repo_root):
    if shutil.which("kustomize") is None or shutil.which("envsubst") is None:
        pytest.skip("kustomize/envsubst nicht verfuegbar")
    env = {
        "SMTP_PORT": "587", "SMTP_HOST": "smtp.example.org", "SMTP_USER": "x", "POCKET_ID_SMTP_TLS": "starttls",
        "POCKET_ID_FRONTEND_URL": "https://auth.example", "POCKET_ID_URL": "http://pocket-id:1411",
        "POCKET_ID_DOMAIN": "id.example",
    }
    script = (
        f"set -o pipefail; kustomize build '{repo_root}/prod-fleet/mentolder' --load-restrictor=LoadRestrictionsNone"
        f" | sed -E '{REQUOTE_SED}'"
        " | envsubst '$SMTP_PORT $SMTP_HOST $SMTP_USER $POCKET_ID_SMTP_TLS $POCKET_ID_FRONTEND_URL $POCKET_ID_URL $POCKET_ID_DOMAIN'"
        " | grep -A1 'name: SMTP_PORT'"
    )
    r = run_cmd(["bash", "-c", script], env=env)
    assert r.returncode == 0, r.output
    assert 'value: "587"' in r.output


def test_website_migrate_task_exists_in_taskfile_yml(tf):
    assert len(re.findall(r"^  website:migrate:$", tf["web"], re.M)) >= 1


def test_task_dry_run_website_migrate_env_dev_resolves_without_error(run_cmd, repo_root):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    r = run_cmd(["task", "-d", str(repo_root), "-n", "website:migrate", "ENV=dev"])
    assert r.returncode == 0


def test_workspace_deploy_dev_branch_runs_website_migrate_before_the_shared_db_dependent_kustomize_apply(tf):
    block = sed_ranges_regex(_ws_deploy(tf), re.escape('if [ "{{.ENV}}" = "dev" ]; then'), r"kustomize build k3d/")
    assert "task website:migrate ENV=" in block


def test_workspace_deploy_prod_branch_runs_website_migrate_before_the_overlay_apply(tf):
    block = sed_ranges_regex(_ws_deploy(tf), re.escape('rollout status deployment/shared-db -n "${_ws_ns}"'),
                             re.escape('overlay="${ENV_OVERLAY'))
    assert "task website:migrate ENV=" in block


def test_website_deploy_runs_website_migrate_before_website_build(tf):
    lines = sed_ranges_regex(tf["web"], r"^  website:deploy:$", r"^  [a-z]").splitlines()
    numbered = [(i + 1, l) for i, l in enumerate(lines) if "task website:migrate" in l or "task website:build" in l]
    migrate = next((n for n, l in numbered if "task website:migrate" in l), None)
    build = next((n for n, l in numbered if "task website:build" in l), None)
    assert migrate is not None and build is not None
    assert migrate < build


def test_every_kustomize_build_envsubst_pipeline_in_taskfile_yml_re_quotes_stripped_var_placeholders_t001411(tf):
    sed_marker = REQUOTE_SED
    pending, sed_seen, bad = False, False, 0
    for text in (tf["ws"], tf["web"]):
        for line in text.splitlines():
            if "kustomize build" in line:
                pending, sed_seen = True, False
                continue
            if pending and re.match(r"^\s*\|", line):
                if sed_marker in line:
                    sed_seen = True
                if "envsubst" in line:
                    if not sed_seen:
                        bad += 1
                    pending = False
                continue
            if pending:
                pending = False
    assert bad == 0


# ── T001853: k3d-Basis-Drift ──

def _affinity_violations(d):
    hits = []
    for f in sorted(Path(d).glob("*.yaml")):
        for n, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if re.search(r"gekko-hetzner|pk-hetzner", line) and not re.match(r"^\s*#", line):
                hits.append(f"{f}:{n}:{line}")
    return hits


def test_t001853_k3d_base_manifests_carry_no_prod_remote_host_affinities_gekko_pk_hetzner(tmp_path, repo_root):
    probe = tmp_path / "probe"
    probe.mkdir()
    (probe / "real.yaml").write_text("spec:\n  nodeName: pk-hetzner-8\n")
    (probe / "commented.yaml").write_text("# Vorfall-Notiz zu pk-hetzner-8\nspec:\n  nodeName: k3d\n")
    hits = _affinity_violations(probe)
    assert len(hits) > 0
    assert sum(1 for h in hits if "real.yaml" in h) == 1
    assert sum(1 for h in hits if "commented.yaml" in h) == 0
    assert _affinity_violations(repo_root / "k3d") == []


def test_t001853_k3d_base_manifests_use_website_namespace_not_website_website_svc_literal(repo_root):
    hits = [str(p) for p in (repo_root / "k3d").glob("*.yaml") if "website.website.svc" in p.read_text(encoding="utf-8", errors="replace")]
    assert hits == []


def test_t001853_k3d_secrets_yaml_provides_sessions_cron_token(repo_root):
    text = (repo_root / "k3d" / "secrets.yaml").read_text(encoding="utf-8")
    assert re.search(r"^\s+SESSIONS_CRON_TOKEN:", text, re.M)


def test_t001853_k3d_secrets_yaml_provides_studio_db_url(repo_root):
    text = (repo_root / "k3d" / "secrets.yaml").read_text(encoding="utf-8")
    assert re.search(r"^\s+STUDIO_DB_URL:", text, re.M)


def test_t001853_website_dev_secrets_yaml_covers_all_website_referenced_keys(repo_root):
    text = (repo_root / "k3d" / "website-dev-secrets.yaml").read_text(encoding="utf-8")
    keys = ["INTERNAL_API_TOKEN", "ANTHROPIC_API_KEY", "BRETT_OIDC_SECRET", "DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY_PK",
            "IPV64_API_KEY", "LLM_ROUTER_API_KEY", "SEPA_CREDITOR_BIC", "SEPA_CREDITOR_IBAN", "SEPA_CREDITOR_ID",
            "VOYAGE_API_KEY", "SESSIONS_CRON_TOKEN"]
    missing = [k for k in keys if not re.search(rf"^\s+{k}:", text, re.M)]
    assert missing == []


def test_t001853_website_dev_secrets_yaml_namespace_is_envsubst_parameterized_not_hardcoded(repo_root):
    text = (repo_root / "k3d" / "website-dev-secrets.yaml").read_text(encoding="utf-8")
    assert not re.search(r"^\s+namespace: website$", text, re.M)
    assert "namespace: ${WEBSITE_NAMESPACE}" in text


def test_t001853_dev_only_apiserver_netpol_exists_in_base_and_is_stripped_by_prod_overlay(repo_root):
    assert "network-policies-dev.yaml" in (repo_root / "k3d" / "kustomization.yaml").read_text(encoding="utf-8")
    assert "allow-apiserver-egress-k3d" in (repo_root / "k3d" / "network-policies-dev.yaml").read_text(encoding="utf-8")
    assert "allow-apiserver-egress-k3d" in (repo_root / "prod" / "kustomization.yaml").read_text(encoding="utf-8")


def test_t001853_studio_server_base_manifest_uses_image_pull_policy_if_not_present(repo_root):
    text = (repo_root / "k3d" / "studio.yaml").read_text(encoding="utf-8")
    assert not re.search(r"imagePullPolicy:[ \t]*Always", text)
    assert re.search(r"imagePullPolicy:[ \t]*IfNotPresent", text)


def test_t001853_pocket_id_db_init_bootstraps_seed_deploy_api_key_idempotently(repo_root):
    text = (repo_root / "k3d" / "pocket-id.yaml").read_text(encoding="utf-8")
    assert "INSERT INTO api_keys" in text
    assert "ON CONFLICT" in text


def test_t001853_website_deploy_dev_branch_targets_current_context_no_env_context_kubectl(repo_root):
    block = sed_ranges_regex((repo_root / "taskfiles" / "Taskfile.web.yml").read_text(encoding="utf-8"),
                             r"^  website:deploy:$", r"^  website:dev:$")
    assert any(re.search(r'!= "dev" \] && CTX_ARG=', l) for l in block.splitlines())


# ── T002083: fluxcd-gitops ──

FLUX_KEYS = (
    "PROD_DOMAIN|BRAND_NAME|CONTACT_EMAIL|INFRA_NAMESPACE|TLS_SECRET_NAME|SMTP_FROM|SMTP_HOST|SMTP_PORT|SMTP_USER|"
    "MAIL_FROM_LOCAL|MAIL_FROM_DOMAIN|POCKET_ID_SMTP_TLS|WEBSITE_IMAGE|BRETT_IMAGE|TURN_PUBLIC_IP|TURN_NODE|"
    "TURN_OVERLAY_IP|TERMINAL_OVERLAY_IP|BRAND_ID|KC_USER1_USERNAME|KC_USER1_EMAIL|KC_USER2_USERNAME|KC_USER2_EMAIL|"
    "BRETT_DOMAIN|BRAIN_EXTERNAL_URL|RECOVER_DOMAIN|OTEL_DOMAIN|STUDIO_DOMAIN|STUDIO_IMAGE|STUDIO_IMAGE_DIGEST|"
    "WHISPER_URL|WORKSPACE_NAMESPACE|WEBSITE_NAMESPACE|SYSTEMTEST_LOOP_ENABLED|LLM_HOST_IP|LLM_ENABLED|"
    "LLM_RERANK_ENABLED|LLM_ROUTER_URL|LLM_EMBED_URL|COMFY_HOST_IP|COMFY_PORT|RIGGER_HOST_IP|RIGGER_PORT|"
    "NTFY_BASE_URL|AGENT_PUSH_API|AGENT_PUSH_LINK_BASE|DEV_DOMAIN|DEV_NODE|DEV_WEBSITE_HOST|DEV_BRETT_HOST|"
    "POCKET_ID_DOMAIN|POCKET_ID_FRONTEND_URL|POCKET_ID_URL"
)
FLUX_LEFTOVER_RE = re.compile(r"\$\{(" + FLUX_KEYS + r")\}")
FLUX_ENV = {
    "SMTP_PORT": "587", "SMTP_HOST": "smtp.example.org", "SMTP_USER": "x", "POCKET_ID_SMTP_TLS": "starttls",
    "POCKET_ID_FRONTEND_URL": "https://auth.example", "POCKET_ID_URL": "http://pocket-id:1411",
    "POCKET_ID_DOMAIN": "id.example",
    # T004041: Fixture-Digests (fail-closed Guard gegen Placeholder-Digests).
    "WEBSITE_IMAGE_DIGEST": "sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41",
    "BRETT_IMAGE_DIGEST": "sha256:9090909090909090909090909090909090909090909090909090909090909090",
}

VALUE_KEY_PREAMBLE = (
    "import yaml\n"
    "yaml.SafeLoader.add_constructor(\n"
    "    'tag:yaml.org,2002:value', lambda loader, node: loader.construct_scalar(node))\n"
)


@pytest.fixture
def flux(repo_root):
    script = repo_root / "scripts" / "flux-render-artifact.sh"
    return {"script": script, "cluster": repo_root / "flux" / "clusters" / "fleet", "root": repo_root}


def test_t002083_scripts_flux_render_artifact_sh_exists_and_is_executable(flux):
    assert flux["script"].is_file()
    assert os.access(flux["script"], os.X_OK)


def test_t002083_flux_render_artifact_sh_is_shellcheck_clean(run_cmd, flux):
    if shutil.which("shellcheck") is None:
        pytest.skip("shellcheck not installed in this context")
    r = run_cmd(["shellcheck", "-S", "warning", str(flux["script"])])
    assert r.returncode == 0


def test_t002236_flux_render_artifact_sh_validation_gate_accepts_yaml_1_1_value_key_scalars(run_cmd, flux, tmp_path):
    out = tmp_path / "render"
    out.mkdir()
    r = run_cmd(["bash", str(flux["script"]), "--out", str(out)], env=FLUX_ENV)
    assert r.returncode == 0
    assert "validation gate passed" in r.output
    assert "VALIDATION FAILED" not in r.output
    assert "could not determine a constructor" not in r.output


def test_t002236_the_validation_gate_still_rejects_a_manifest_doc_without_api_version(run_cmd):
    code = VALUE_KEY_PREAMBLE + (
        "docs = list(yaml.safe_load_all('kind: ConfigMap\\nmetadata:\\n  name: x\\n'))\n"
        "import sys\n"
        "for i, doc in enumerate(docs):\n"
        "    if doc is None:\n"
        "        continue\n"
        "    if not doc.get('apiVersion'):\n"
        "        print('ERROR: doc %d has no apiVersion' % i, file=sys.stderr)\n"
        "        sys.exit(1)\n"
    )
    r = run_cmd(["python3", "-c", code])
    assert r.returncode != 0
    assert "no apiVersion" in r.output


def test_t002236_the_value_key_constructor_parses_the_upstream_match_type_enum(run_cmd):
    code = VALUE_KEY_PREAMBLE + (
        "doc = yaml.safe_load('''\n"
        "apiVersion: v1\n"
        "matchType:\n"
        "  enum:\n"
        "  - '!='\n"
        "  - =\n"
        "  - =~\n"
        "  - '!~'\n"
        "''')\n"
        "vals = doc['matchType']['enum']\n"
        "assert len(vals) == 4, vals\n"
        "print('parsed:', vals)\n"
    )
    r = run_cmd(["python3", "-c", code])
    assert r.returncode == 0
    assert "parsed:" in r.output


def test_t002083_flux_render_artifact_sh_renders_a_placeholder_free_tree_no_bare_var(run_cmd, flux, tmp_path):
    out = tmp_path / "render"
    out.mkdir()
    r = run_cmd(["bash", str(flux["script"]), "--out", str(out)], env=FLUX_ENV)
    assert r.returncode == 0
    leftover = []
    for p in sorted(out.rglob("*")):
        if p.is_file():
            for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
                if FLUX_LEFTOVER_RE.search(line):
                    leftover.append(f"{p}:{line}")
    assert leftover == []


def test_t002083_flux_clusters_fleet_manifests_all_parse_as_valid_yaml(flux):
    import yaml

    files = list(flux["cluster"].rglob("*.yaml")) + list(flux["cluster"].rglob("*.yml"))
    assert files, "no manifests under flux/clusters/fleet"
    errs = []
    for f in files:
        try:
            list(yaml.safe_load_all(f.read_text()))
        except yaml.YAMLError as e:
            errs.append(f"{f.name}: {e}")
    assert not errs, "YAML parse errors: " + "; ".join(errs)


def _flux_instance_files(flux):
    out = []
    for p in sorted(flux["cluster"].rglob("*")):
        if p.is_file() and re.search(r"kind:[ \t]*FluxInstance", p.read_text(encoding="utf-8", errors="replace")):
            out.append(p)
    return out


def test_t002083_flux_instance_is_fluxcd_controlplane_io_v1_kind_flux_instance_name_flux(flux):
    files = _flux_instance_files(flux)
    assert files, "kein FluxInstance gefunden"
    text = files[0].read_text(encoding="utf-8")
    assert re.search(r"^apiVersion:[ \t]*fluxcd\.controlplane\.io/v1", text, re.M)
    assert re.search(r"^[ \t]*name:[ \t]*flux[ \t]*$", text, re.M)


def _grep_files(root, pattern, glob="*"):
    """Return files under root (recursive over glob) whose text matches the regex pattern."""
    hits = []
    for p in sorted(Path(root).rglob(glob)):
        if p.is_file() and re.search(pattern, p.read_text(encoding="utf-8", errors="replace"), re.M):
            hits.append(p)
    return hits


def _kustomization_docs(flux):
    import yaml

    docs = []
    for f in list(flux["cluster"].rglob("*.yaml")) + list(flux["cluster"].rglob("*.yml")):
        for doc in yaml.safe_load_all(f.read_text()):
            if doc:
                docs.append(doc)
    return docs


def test_t002083_flux_instance_and_oci_repository_exist_in_cluster_dir(flux):
    assert _grep_files(flux["cluster"], r"kind:[ \t]*FluxInstance")
    assert _grep_files(flux["cluster"], r"kind:[ \t]*OCIRepository")


def test_t002083_cluster_crs_form_a_kustomization_depends_on_chain(flux):
    ks = [d for d in _kustomization_docs(flux)
          if d.get("kind") == "Kustomization" and str(d.get("apiVersion", "")).startswith("kustomize.toolkit.fluxcd.io")]
    names = {(k.get("metadata") or {}).get("name") for k in ks}
    sealed = {n for n in names if n and n.startswith("flux-sealed-secrets")}
    assert sealed, f"no flux-sealed-secrets* Kustomization (have {sorted(n for n in names if n)})"
    assert "flux-infra-controllers" in names, \
        f"flux-infra-controllers Kustomization missing (have {sorted(n for n in names if n)})"
    assert any((k.get("spec") or {}).get("dependsOn") for k in ks), "no Kustomization declares dependsOn"


def test_t002083_flux_sealed_secrets_kustomization_sets_prune_false_secrets_never_auto_pruned(flux):
    found = [d for d in _kustomization_docs(flux)
             if d.get("kind") == "Kustomization" and ((d.get("metadata") or {}).get("name") or "").startswith("flux-sealed-secrets")]
    assert found, "no flux-sealed-secrets* Kustomization found"
    offenders = [(d.get("metadata") or {}).get("name") for d in found
                 if (d.get("spec") or {}).get("prune") is not False]
    assert not offenders, f"these flux-sealed-secrets* Kustomizations must set spec.prune: false — {offenders}"


def test_t002083_flux_clusters_fleet_crs_carry_no_unsubstituted_var_placeholders(flux):
    leftover = [p for p in sorted(flux["cluster"].glob("*.yaml"))
                if "${" in p.read_text(encoding="utf-8", errors="replace")]
    assert leftover == []


def test_t002083_flux_cli_schema_validates_the_cluster_manifests_when_the_subcommand_exists(run_cmd, flux):
    if shutil.which("flux") is None:
        pytest.skip("flux CLI not installed in this context")
    cluster = str(flux["cluster"])
    if run_cmd(["flux", "schema", "validate", "--help"]).returncode == 0:
        r = run_cmd(["flux", "schema", "validate", cluster, "--skip-missing-schemas"])
    elif run_cmd(["flux", "schema", "--help"]).returncode == 0:
        r = run_cmd(["flux", "schema", "validate", "--path", cluster])
    elif run_cmd(["flux", "validate", "--help"]).returncode == 0:
        r = run_cmd(["flux", "validate", "--path", cluster])
    else:
        pytest.skip("installed flux CLI has no schema/validate subcommand")
    assert r.returncode == 0


# ── Image-Tag reaches the rendered manifest (T002209) ──

def test_website_manifest_does_not_hardcode_the_image_tag(repo_root):
    text = (repo_root / "k3d" / "website.yaml").read_text(encoding="utf-8")
    count = sum(1 for l in text.splitlines() if "image: ghcr.io/paddione/${WEBSITE_IMAGE}:latest" in l)
    assert count == 0


def test_website_manifest_templates_the_image_tag(repo_root):
    assert "WEBSITE_IMAGE_TAG" in (repo_root / "k3d" / "website.yaml").read_text(encoding="utf-8")


def test_flux_render_script_reads_website_image_tag_from_the_environment(repo_root):
    assert "WEBSITE_IMAGE_TAG" in (repo_root / "scripts" / "flux-render-artifact.sh").read_text(encoding="utf-8")


def test_flux_render_script_reads_brett_image_digest_from_the_environment(repo_root):
    assert "BRETT_IMAGE_DIGEST" in (repo_root / "scripts" / "flux-render-artifact.sh").read_text(encoding="utf-8")


def test_every_envsubst_list_carrying_website_image_also_carries_website_image_tag(repo_root):
    sources = [repo_root / "Taskfile.yml"] + [p for p in sorted((repo_root / "taskfiles").rglob("*")) if p.is_file()]
    lines = []
    for src in sources:
        for line in src.read_text(encoding="utf-8", errors="replace").splitlines():
            if "WEBSITE_IMAGE" in line and re.search(r"ENVSUBST_VARS|envsubst", line):
                lines.append(line)
    missing = [l for l in lines if "$WEBSITE_IMAGE_TAG" not in l]
    assert missing == [], "MISSING WEBSITE_IMAGE_TAG in: " + " | ".join(m[:110] for m in missing)


def test_the_tag_placeholder_always_has_a_value_so_it_never_renders_empty(repo_root):
    text = (repo_root / "scripts" / "flux-render-artifact.sh").read_text(encoding="utf-8")
    assert re.search(r"WEBSITE_IMAGE_TAG:?[=-]", text)


# ── Blast-Radius-Eingrenzung (T002207) ──

def test_t002207_brand_kustomization_does_not_set_bare_wait_true_requires_health_checks(flux):
    for ks in ("ks-mentolder.yaml", "ks-korczewski.yaml"):
        text = (flux["cluster"] / ks).read_text(encoding="utf-8")
        assert not re.search(r"^\s*wait:\s*true$", text, re.M), f"FAIL: {ks} still sets bare wait:true without healthChecks"


def test_t002207_brand_kustomization_declares_health_checks_list(flux):
    for ks in ("ks-mentolder.yaml", "ks-korczewski.yaml"):
        text = (flux["cluster"] / ks).read_text(encoding="utf-8")
        assert "healthChecks:" in text, f"FAIL: {ks} has no healthChecks"


def test_t002207_jobs_kustomization_exists_for_each_brand(flux):
    for ks in ("ks-jobs-mentolder.yaml", "ks-jobs-korczewski.yaml"):
        assert (flux["cluster"] / ks).is_file(), f"FAIL: {flux['cluster'] / ks} does not exist"


def test_t002207_jobs_kustomization_has_depends_on_flux_brand_and_force_true(flux):
    for brand in ("mentolder", "korczewski"):
        ks = flux["cluster"] / f"ks-jobs-{brand}.yaml"
        if not ks.is_file():
            continue  # BATS: skip if not yet created
        text = ks.read_text(encoding="utf-8")
        assert "dependsOn:" in text, f"FAIL: {ks} missing dependsOn"
        assert re.search(r"force:\s*true", text), f"FAIL: {ks} missing force:true"


def _render(run_cmd, flux, out_dir):
    # BATS: bash "$RENDER" --out "$out" 2>/dev/null || true
    return run_cmd(["bash", str(flux["script"]), "--out", str(out_dir)])


def test_t002207_no_kind_job_in_rendered_brand_component_trees(run_cmd, flux, tmp_path):
    out = tmp_path / "render"
    out.mkdir()
    _render(run_cmd, flux, out)
    for brand in ("mentolder", "korczewski"):
        manifest = out / brand / f"{brand}.yaml"
        if manifest.is_file():
            count = sum(1 for l in manifest.read_text(encoding="utf-8").splitlines() if l.startswith("kind: Job"))
            assert count == 0, f"FAIL: {brand} overlay contains {count} Job(s) — should be 0"


def test_t002207_rendered_jobs_component_trees_contain_kind_job(run_cmd, flux, tmp_path):
    out = tmp_path / "render"
    out.mkdir()
    _render(run_cmd, flux, out)
    for brand in ("mentolder", "korczewski"):
        manifest = out / f"{brand}-jobs" / f"{brand}-jobs.yaml"
        if manifest.is_file():
            count = sum(1 for l in manifest.read_text(encoding="utf-8").splitlines() if l.startswith("kind: Job"))
            assert count >= 1, f"FAIL: {brand}-jobs overlay contains 0 Jobs — expected at least 1"


def test_t002207_render_script_has_validation_gate_before_push(flux):
    assert re.search(r"validate|dry.?run|kubeval|schema", flux["script"].read_text(encoding="utf-8"))


def _flux_bootstrap_sealedsecrets(repo_root):
    d = repo_root / "flux" / "clusters" / "fleet" / "bootstrap"
    return sorted(p for p in d.glob("*sealedsecret*.yaml") if p.is_file())


def test_t002251_no_flux_bootstrap_sealed_secret_carries_a_placeholder_ciphertext(repo_root):
    found = []
    for f in _flux_bootstrap_sealedsecrets(repo_root):
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r":[ \t]*AgD_dummy", line):
                found.append(f"{f.name}:{n}: {line}")
    assert not found, "FAIL: Platzhalter-Ciphertext gefunden:\n" + "\n".join(found)


def test_t002251_every_flux_bootstrap_sealed_secret_declares_spec_template_metadata(repo_root):
    import yaml

    for f in _flux_bootstrap_sealedsecrets(repo_root):
        doc = yaml.safe_load(f.read_text())
        tmpl = ((doc or {}).get("spec") or {}).get("template") or {}
        md = tmpl.get("metadata") or {}
        missing = [k for k in ("name", "namespace") if not md.get(k)]
        assert not missing, f"FAIL: {f.name} — missing: " + ", ".join("spec.template.metadata." + m for m in missing)


def test_t002251_no_two_sealed_secrets_with_different_identities_share_a_ciphertext(repo_root):
    import subprocess
    from collections import defaultdict

    import yaml

    root = str(repo_root)
    # Explizit an ROOT gebunden: git ls-files waere sonst cwd-abhaengig.
    files = subprocess.run(["git", "-C", root, "ls-files", "-z", "*.yaml", "*.yml"],
                           capture_output=True, text=True, check=True).stdout.split("\0")
    scope_annotations = ("sealedsecrets.bitnami.com/namespace-wide", "sealedsecrets.bitnami.com/cluster-wide")
    identities = defaultdict(set)
    sites = defaultdict(list)
    unparseable = []

    for path in files:
        if not path:
            continue
        try:
            raw = open(os.path.join(root, path), encoding="utf-8").read()
        except (OSError, UnicodeDecodeError):
            continue
        if "SealedSecret" not in raw:
            continue  # billiger Vorfilter
        try:
            docs = list(yaml.safe_load_all(raw))
        except yaml.YAMLError as exc:
            unparseable.append(f"{path}: {type(exc).__name__}")
            continue
        for doc in docs:
            if not isinstance(doc, dict) or doc.get("kind") != "SealedSecret":
                continue
            md = doc.get("metadata") or {}
            ann = md.get("annotations") or {}
            if any(str(ann.get(a, "")).lower() == "true" for a in scope_annotations):
                continue  # non-strict scope
            ident = (md.get("namespace") or "<none>", md.get("name") or "<none>")
            for key, ct in ((doc.get("spec") or {}).get("encryptedData") or {}).items():
                if not isinstance(ct, str) or not ct:
                    continue
                identities[ct].add(ident)
                sites[ct].append(f"{path} [{ident[0]}/{ident[1]}] key={key}")

    assert not unparseable, "FAIL: Dateien mit SealedSecret-Bezug sind nicht parsebar:\n" + "\n".join(unparseable)
    shared = {ct: ids for ct, ids in identities.items() if len(ids) > 1}
    msgs = []
    for ct in shared:
        msgs.append("FAIL: derselbe Ciphertext unter verschiedenen Identitaeten:\n"
                    + "\n".join(f"  {s}" for s in sorted(set(sites[ct]))))
    assert not shared, "\n".join(msgs)
