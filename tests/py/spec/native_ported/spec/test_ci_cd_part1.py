"""Native migration of tests/spec/ci-cd.bats. (part 1/3)"""
import glob
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
import pytest
import yaml


def _lines_matching(text: str, pattern: str):
    """grep -n PATTERN: 1-based (line number, line) pairs for regex PATTERN."""
    rx = re.compile(pattern)
    return [(i, ln) for i, ln in enumerate(text.splitlines(), start=1) if rx.search(ln)]


def _first_line_no(text: str, pattern: str, after: int = 0):
    """grep -n PATTERN | head -1 | cut -d: -f1 (optionally only lines > after)."""
    for i, ln in _lines_matching(text, pattern):
        if i > after:
            return i
    return None


def _count_lines(text: str, pattern: str, regex: bool = False) -> int:
    """grep -c PATTERN (literal unless regex=True)."""
    if regex:
        return sum(1 for ln in text.splitlines() if re.search(pattern, ln))
    return sum(1 for ln in text.splitlines() if pattern in ln)


def _grep_q(text: str, pattern: str, regex: bool = True) -> bool:
    """grep -q PATTERN (default ERE-like regex; literal when regex=False)."""
    if regex:
        return re.search(pattern, text, re.M) is not None
    return pattern in text


def _run_py(run_cmd, code: str, *args, cwd=None, env=None):
    return run_cmd(["python3", "-c", code, *args], cwd=cwd, env=env)


def _jq_r(expr: str, path: Path) -> str:
    return subprocess.run(["jq", "-r", expr, str(path)], capture_output=True,
                          text=True).stdout.rstrip("\n")


def _ctx_lines(text: str, pattern: str, before: int = 0, after: int = 0) -> str:
    """grep -B<before> -A<after> PATTERN output (group separators omitted)."""
    lines = text.splitlines()
    out = []
    rx = re.compile(pattern)
    picked = set()
    for i, ln in enumerate(lines):
        if rx.search(ln):
            for j in range(max(0, i - before), min(len(lines), i + after + 1)):
                picked.add(j)
    return "\n".join(lines[j] for j in sorted(picked))


@pytest.fixture
def ci(repo_root):
    """setup(): REPO_ROOT and the workflow paths; FIND_CHANGED_TESTS_FILES is unset."""
    os.environ.pop("FIND_CHANGED_TESTS_FILES", None)
    return {
        "repo": repo_root,
        "wf": repo_root / ".github/workflows/post-merge.yml",
        "build_wf": repo_root / ".github/workflows/build-website.yml",
        "e2e_wf": repo_root / ".github/workflows/e2e.yml",
    }


def _node_modules_fresh(d: Path) -> bool:
    """node_modules_fresh() of tests/lib/guard-preconditions.sh."""
    mod = d / "node_modules/.modules.yaml"
    if not mod.is_file():
        return False
    if not (d / "pnpm-lock.yaml").stat().st_mtime < mod.stat().st_mtime:
        return False
    if not (d / "package.json").stat().st_mtime < mod.stat().st_mtime:
        return False
    return True


def _schema_env_vars(repo: Path) -> set:
    """awk env_vars-Block | grep '- name: X' | awk '{print $3}' | sort -u"""
    out = []
    f = False
    for line in (repo / "environments/schema.yaml").read_text().splitlines():
        if line.startswith("env_vars:"):
            f = True
            continue
        if line.startswith("secrets:"):
            f = False
        if f:
            out.append(line)
    names = set()
    for line in out:
        if re.search(r"^[ \t]+- name: [A-Z0-9_]+", line):
            fields = line.split()
            if len(fields) >= 3:
                names.add(fields[2])
    return names


def _envsubst_names(text: str) -> set:
    """grep -oE '\\\\\\$[A-Z0-9_]+' | tr -d '\\\\$' | sort -u (literal backslash-dollar tokens)."""
    return {m[2:] for m in re.findall(r"\\\$[A-Z0-9_]+", text)}


def _taskfile_envsubst_list(repo: Path, task: str) -> set:
    """ENVSUBST_VARS-Zeilen eines Taskfile-Tasks (bis zur naechsten Task-Definition)."""
    in_task = False
    out = []
    header = f"  {task}:"
    for line in (repo / "taskfiles/Taskfile.workspace.yml").read_text().splitlines():
        if line == header:
            in_task = True
            continue
        if in_task and re.match(r"^  [a-zA-Z0-9:_-]+:$", line):
            break
        if in_task and "ENVSUBST_VARS=" in line:
            out.append(line)
    return _envsubst_names("\n".join(out))


def _website_deploy_list(repo: Path) -> set:
    """Union ueber ALLE envsubst-Aufrufe des website:deploy-Tasks."""
    in_task = False
    out = []
    for line in (repo / "taskfiles/Taskfile.web.yml").read_text().splitlines():
        if line == "  website:deploy:":
            in_task = True
            continue
        if in_task and re.match(r"^  [a-zA-Z0-9:_-]+:$", line):
            break
        if in_task and 'envsubst "' in line:
            out.append(line)
    return _envsubst_names("\n".join(out))


def _render_placeholders(run_cmd, repo: Path, overlay: str) -> set:
    """kubectl kustomize OVERLAY ... | grep -oE '\\$\\{[A-Za-z0-9_]+\\}' | tr -d '${}' | sort -u"""
    res = run_cmd(["kubectl", "kustomize", str(repo / overlay),
                   "--load-restrictor=LoadRestrictionsNone"])
    found = re.findall(r"\$\{[A-Za-z0-9_]+\}", res.stdout)
    return {m.strip("${}") for m in found}


def _assert_no_config_drift(run_cmd, repo: Path, overlay: str, allowlist: set):
    """Kern-Assertion: (Platzhalter - Allowlist) ∩ Schema-env_vars muss leer sein."""
    ph = _render_placeholders(run_cmd, repo, overlay)
    if not ph:
        pytest.skip(f"kustomize render leer/nicht verfuegbar fuer {overlay}")
    drift = sorted((ph - allowlist) & _schema_env_vars(repo))
    assert not drift, f"envsubst-Allowlist-Drift in {overlay} — fehlende Config-Vars: {' '.join(drift)}"



def test_g_e2e02_e2e_yml_has_an_always_guarded_post_run_test_data_purge_step(ci):
    text = ci["e2e_wf"].read_text()
    assert _count_lines(text, "if: always()") >= 1
    # run grep -B5 'purge-all-test-data' "$E2E_WF"
    ctx = _ctx_lines(text, r"purge-all-test-data", before=5)
    assert _lines_matching(text, r"purge-all-test-data")
    assert "always()" in ctx



def test_t002272_m2_dev_flow_execute_merge_gate_requests_auto_merge_before_the_ci_watch_loop(repo_root):
    exec_skill = repo_root / ".claude/skills/dev-flow-execute/SKILL.md"
    text = exec_skill.read_text()
    gate = _first_line_no(text, r"^## Schritt 3.8: Merge-Gate")
    assert gate is not None
    merge_line = _first_line_no(text, r"gh pr merge --auto", after=gate)
    watch_line = _first_line_no(text, r"devflow-ci-watch\.sh", after=gate)
    assert merge_line is not None and watch_line is not None
    assert merge_line < watch_line



def test_g_e2e02_e2e_yml_post_run_purge_step_posts_x_cron_secret_against_the_matrix_website_url(ci):
    text = ci["e2e_wf"].read_text()
    assert _lines_matching(text, r"purge-all-test-data")
    ctx = _ctx_lines(text, r"purge-all-test-data", after=6)
    assert "X-Cron-Secret" in ctx
    assert "matrix.website_url" in ctx



def test_g_cd02_post_merge_yml_deklariert_eine_top_level_concurrency_group(ci):
    assert _grep_q(ci["wf"].read_text(), r"^concurrency:")



def test_g_cd02_concurrency_bricht_laufende_deploys_nicht_ab(ci):
    assert _grep_q(ci["wf"].read_text(), r"cancel-in-progress:[^\S\n]*false")



def test_g_cd02_post_merge_yml_schreibt_keinen_ticket_status_mehr_t002626(ci):
    # Positiv-Anker zuerst (T002356-M1)
    assert ci["wf"].is_file()
    text = ci["wf"].read_text()
    assert "render-artifact:" in text
    # T900810: keine ausfuehrbare Ticket-Schreibzeile mehr (Kommentare zaehlen nicht).
    assert _count_lines(text, r"^[^#]*scripts/ticket\.sh[^\S\n]+update-status", regex=True) == 0



def test_g_cq03_components_website_eslint_config_js_exists(repo_root):
    assert (repo_root / "components/website/eslint.config.js").is_file()



def test_g_cq03_website_package_json_has_a_lint_script_with_max_warnings_0(repo_root):
    value = _jq_r('.scripts.lint // ""', repo_root / "components/website/package.json")
    assert "eslint" in value
    assert "--max-warnings 0" in value



def test_g_cq03_ci_yml_wires_an_eslint_gate_step(repo_root):
    text = (repo_root / ".github/workflows/ci.yml").read_text()
    assert re.search(r"eslint|lint", text)
    assert "--max-warnings 0" in text



def test_g_cq03_eslint_runs_clean_0_warnings_when_deps_are_installed(run_cmd, ci):
    web = ci["repo"] / "components/website"
    eslint = web / "node_modules/.bin/eslint"
    if not (eslint.is_file() and os.access(eslint, os.X_OK)):
        pytest.skip("website deps not installed in this context — enforced by CI vitest-website job")
    # [T900653] require_fresh_node_modules: installiert != frisch
    if not _node_modules_fresh(web):
        pytest.skip(f"{web}/node_modules aelter als Lockfile/package.json — 'pnpm install' im "
                    "Haupt-Checkout (nie im Worktree mit verlinkten Modulen; Umgebung, kein "
                    "Produktfehler; T900653)")
    result = run_cmd(["./node_modules/.bin/eslint", ".", "--max-warnings", "0", "--cache"],
                     cwd=web)
    assert result.returncode == 0



def test_g_cd01_build_website_yml_hat_einen_build_image_job_mit_image_sha_tag_outputs(ci):
    jobs = (yaml.safe_load(ci["build_wf"].read_text()) or {}).get("jobs", {})
    assert "build-image" in jobs, "kein build-image Job"
    outs = jobs["build-image"].get("outputs") or {}
    assert "image" in outs, "build-image hat kein image output"
    assert "sha_tag" in outs, "build-image hat kein sha_tag output"



def test_g_cd01_build_website_yml_hat_keinen_deploy_mentolder_mehr_flux_only_t900810(ci):
    jobs = (yaml.safe_load(ci["build_wf"].read_text()) or {}).get("jobs", {})
    assert "deploy-mentolder" not in jobs, "deploy-mentolder (pre-Flux) ist zurueckgekehrt"
    assert "render-artifact" in jobs, "kein render-artifact Job (Flux-Pfad fehlt)"



def test_g_cd01_deploy_korczewski_needs_build_image_und_nicht_deploy_mentolder(ci):
    jobs = (yaml.safe_load(ci["build_wf"].read_text()) or {}).get("jobs", {})
    assert "deploy-korczewski" in jobs, "kein deploy-korczewski Job"
    needs = jobs["deploy-korczewski"].get("needs", [])
    if isinstance(needs, str):
        needs = [needs]
    assert "build-image" in needs, "deploy-korczewski muss build-image brauchen"
    assert "deploy-mentolder" not in needs, \
        "deploy-korczewski muss unabhaengig von deploy-mentolder sein"



def test_g_cd01_der_verbliebene_deploy_job_liest_den_image_tag_aus_build_image_outputs(ci):
    text = ci["build_wf"].read_text()
    assert _grep_q(text, r"needs.build-image.outputs.image")
    assert _grep_q(text, r"needs.build-image.outputs.sha_tag")



def test_g_cd01_components_website_dockerfile_referenziert_pnpm_lock_yaml_nicht_package_lock_json(repo_root):
    dockerfile = (repo_root / "components/website/Dockerfile").read_text()
    assert _grep_q(dockerfile, r"pnpm-lock\.yaml")
    non_comment = "\n".join(ln for ln in dockerfile.splitlines()
                            if not re.match(r"^\s*#", ln))
    assert not re.search(r"package-lock\.json", non_comment)



def test_g_cd01_components_website_dockerfile_benutzt_pnpm_install_nicht_npm_ci(repo_root):
    dockerfile = (repo_root / "components/website/Dockerfile").read_text()
    assert _grep_q(dockerfile, r"pnpm install")
    assert not re.search(r"^[^#]*\bnpm ci\b", dockerfile, re.M)



def test_g_cd01_goals_md_referenziert_keine_github_workflows_yml_datei_die_nicht_existiert(repo_root):
    text = (repo_root / ".claude/lib/goals.md").read_text()
    wf_dir = repo_root / ".github/workflows"
    missing = []
    for m in re.finditer(r"--workflow\s+([A-Za-z0-9_.-]+\.ya?ml)", text):
        fname = m.group(1)
        if not (wf_dir / fname).is_file():
            missing.append(fname)
    assert not missing, f"goals.md referenziert geloeschte Workflow-Dateien: {sorted(set(missing))}"



def test_g_ci01_a_freshness_regen_yml_enthaelt_keinen_ghaction_import_gpg_verweis(repo_root):
    path = repo_root / ".github/workflows/freshness-regen.yml"
    # run grep -c ... ; [ status -ne 0 ] || [ output -eq 0 ]  (grep status 2 = file missing)
    if not path.is_file():
        return
    count = _count_lines(path.read_text(), "ghaction-import-gpg")
    assert count == 0



def test_g_ci01_b_dockerfile_copy_zeile_referenziert_pnpm_lock_yaml_nicht_package_lock_json(repo_root):
    # Hinweis: die BATS-Zeile `! grep -q "package-lock.json"` steht nicht als letzte Zeile
    # und wird von bats nicht ausgewertet (Negation ohne errexit). Nur das finale
    # grep wird hier als Assertion uebernommen (siehe Report).
    text = (repo_root / "components/website/Dockerfile").read_text()
    assert _grep_q(text, r"pnpm-lock\.yaml")



def test_g_ci01_c_dockerfile_nutzt_pnpm_install_frozen_lockfile_nicht_npm_ci(repo_root):
    # Hinweis: `! grep -q "npm ci"` steht nicht als letzte Zeile und wird von bats nicht
    # als Assertion gewertet (siehe Report). Final geprueft: pnpm install --frozen-lockfile.
    text = (repo_root / "components/website/Dockerfile").read_text()
    assert "pnpm install --frozen-lockfile" in text



def test_g_ci01_d_components_website_pnpm_lock_yaml_existiert_package_lock_json_existiert_nicht(repo_root):
    assert (repo_root / "components/website/pnpm-lock.yaml").is_file()
    assert not (repo_root / "components/website/package-lock.json").is_file()



def test_g_ci01_e_freshness_regen_yml_bot_commit_enthaelt_skip_ci(repo_root):
    text = (repo_root / ".github/workflows/freshness-regen.yml").read_text()
    assert _count_lines(text, "[skip ci]") >= 1



def test_g_commit_vs_diff_scripts_check_commit_vs_diff_sh_exists(repo_root):
    assert (repo_root / "scripts/check-commit-vs-diff.sh").is_file()



def test_g_commit_vs_diff_githooks_commit_msg_exists_and_is_executable(repo_root):
    hook = repo_root / ".githooks/commit-msg"
    assert hook.is_file() and os.access(hook, os.X_OK)



def test_g_commit_vs_diff_githooks_commit_msg_delegates_to_check_commit_vs_diff_sh(repo_root):
    assert "check-commit-vs-diff.sh" in (repo_root / ".githooks/commit-msg").read_text()



def test_g_commit_vs_diff_secrets_install_hooks_chmod_s_the_commit_msg_hook(repo_root):
    # awk '/^  secrets:install-hooks:/{flag=1; next} flag && /^  [a-z]/{flag=0} flag'
    flag = False
    block = []
    for line in (repo_root / "taskfiles/Taskfile.platform.yml").read_text().splitlines():
        if line.startswith("  secrets:install-hooks:"):
            flag = True
            continue
        if flag and re.match(r"^  [a-z]", line):
            flag = False
        if flag:
            block.append(line)
    assert _grep_q("\n".join(block), r"chmod \+x .githooks/commit-msg")



def test_g_commit_vs_diff_dev_flow_plan_skill_md_uses_chore_plans_for_stage_commit_not_fix_scope(repo_root):
    text = (repo_root / ".claude/skills/dev-flow-plan/SKILL.md").read_text()
    stage_line = next((ln for ln in text.splitlines()
                       if re.search(r'git commit -m "[^"]*add failing test', ln)), "")
    assert stage_line
    assert "chore(plans):" in stage_line
    assert "fix(<scope>):" not in stage_line



def test_g_commit_vs_diff_unit_tests_in_tests_unit_check_commit_vs_diff_bats_cover_all_branches(repo_root):
    bats_file = repo_root / "tests/unit/check-commit-vs-diff.bats"
    assert bats_file.is_file()
    text = bats_file.read_text()
    assert _grep_q(text, r"allows:.*real-code")
    assert _grep_q(text, r"blocks:.*T001434")
    assert _grep_q(text, r"blocks:.*plan-only")
    assert _grep_q(text, r"SKIP_COMMIT_VS_DIFF", regex=False)



def test_t001446_build_website_pre_rollout_secret_check_skips_optional_secret_key_refs_deploy_korczewski(ci):
    wf = ci["build_wf"]
    assert wf.is_file()
    assert _count_lines(wf.read_text(), "and not v.get('optional')") == 1



def test_t001446_secret_check_filter_behaves_correctly_against_a_fixture_manifest(run_cmd):
    code = r'''
import yaml, io
doc = """
spec:
  template:
    spec:
      containers:
        - name: website
          env:
            - name: REQ
              valueFrom: {secretKeyRef: {name: website-secrets, key: REQ}}
            - name: OPT
              valueFrom: {secretKeyRef: {name: website-secrets, key: OPT, optional: true}}
"""
for d in yaml.safe_load_all(io.StringIO(doc)):
    if not d: continue
    for c in (d.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[]) or []):
        for e in (c.get('env',[]) or []):
            v = (e.get('valueFrom') or {}).get('secretKeyRef') or {}
            if v.get('name') == 'website-secrets' and v.get('key') and not v.get('optional'):
                print(v['key'])
'''
    result = _run_py(run_cmd, code)
    assert result.stdout.rstrip("\n") == "REQ"



def test_t001453_e2e_yml_setzt_skip_db_purge_nicht_mehr_purge_bracket_aktiv(ci):
    assert "SKIP_DB_PURGE:" not in ci["e2e_wf"].read_text()



def test_t001453_fa_10_t6_skippt_fail_closed_ohne_cron_secret(repo_root):
    text = (repo_root / "tests/e2e/specs/fa-10-website.spec.ts").read_text()
    assert _grep_q(text, r"test.skip\(!cronSecret")



def test_t001453_purge_fn_v5_re_markiert_unmarkierte_e2e_identitaeten(repo_root):
    purge_ts = (repo_root / "components/website/src/lib/tickets/purge-fn.ts").read_text()
    assert "tickets_remarked_unmarked" in purge_ts
    assert "inbox_remarked_unmarked" in purge_ts
    assert "tickets_remarked_unmarked" in (repo_root / "scripts/one-shot/purge-fn-v5.sql").read_text()



def test_t001562_alle_k3d_yaml_parsen_als_gueltiges_multi_document_yaml(repo_root):
    root = repo_root / "k3d"
    errors = []
    for fname in sorted(os.listdir(root)):
        if not fname.endswith((".yaml", ".yml")):
            continue
        fpath = root / fname
        try:
            with open(fpath) as fh:
                docs = list(yaml.safe_load_all(fh))
        except yaml.YAMLError as exc:
            errors.append(f"{fname}: {exc}")
            continue
        if not docs:
            errors.append(f"{fname}: empty (no documents)")
    assert not errors, "YAML parse errors:\n" + "\n".join(errors)



def test_t001873_preflight_pr_scope_akzeptiert_lowercase_ticket_id_im_branchnamen(run_cmd, ci):
    tmp = Path(tempfile.mkdtemp())
    try:
        fixture = tmp / "ci.yml"
        fixture.write_text(
            "jobs:\n"
            "  commit-lint:\n"
            "    steps:\n"
            "      - uses: amannn/action-semantic-pull-request@v5.5.3\n"
            "        with:\n"
            "          scopes: |\n"
            "            docs\n"
            "            test\n")
        # Isoliertes Fixture-Repo direkt auf dem lowercase-Branch aus dem Mishap-Report.
        fixture_repo = tmp / "fixture-repo"
        fixture_repo.mkdir()
        run_cmd(["git", "-C", str(fixture_repo), "init", "-q", "-b", "chore/foo-t999901"]).check()
        run_cmd(["git", "-C", str(fixture_repo), "config", "user.email", "test@example.invalid"]).check()
        run_cmd(["git", "-C", str(fixture_repo), "config", "user.name", "Test Fixture"]).check()
        run_cmd(["git", "-C", str(fixture_repo), "commit", "-q", "--allow-empty", "-m", "fixture"]).check()
        result = run_cmd(["bash", str(ci["repo"] / "scripts/preflight-pr-scope.sh"),
                          "chore(docs): x [T999901]", str(fixture)], cwd=fixture_repo)
        assert result.returncode == 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)



def test_t001994_taskfile_extraktion_liefert_nicht_leere_allowlists_guard_selbsttest(ci):
    repo = ci["repo"]
    assert len(_taskfile_envsubst_list(repo, "workspace:deploy")) > 20
    assert len(_taskfile_envsubst_list(repo, "workspace:partial-deploy")) > 20
    assert len(_website_deploy_list(repo)) > 20



def test_t001994_workspace_deploy_allowlist_deckt_prod_fleet_mentolder_ab(run_cmd, ci):
    _assert_no_config_drift(run_cmd, ci["repo"], "prod-fleet/mentolder",
                            _taskfile_envsubst_list(ci["repo"], "workspace:deploy"))



def test_t001994_workspace_deploy_allowlist_deckt_prod_fleet_korczewski_ab(run_cmd, ci):
    _assert_no_config_drift(run_cmd, ci["repo"], "prod-fleet/korczewski",
                            _taskfile_envsubst_list(ci["repo"], "workspace:deploy"))



def test_t001994_workspace_partial_deploy_allowlist_deckt_prod_fleet_mentolder_ab(run_cmd, ci):
    _assert_no_config_drift(run_cmd, ci["repo"], "prod-fleet/mentolder",
                            _taskfile_envsubst_list(ci["repo"], "workspace:partial-deploy"))



def test_t001994_workspace_partial_deploy_allowlist_deckt_prod_fleet_korczewski_ab(run_cmd, ci):
    _assert_no_config_drift(run_cmd, ci["repo"], "prod-fleet/korczewski",
                            _taskfile_envsubst_list(ci["repo"], "workspace:partial-deploy"))



def test_t001994_website_deploy_allowlist_deckt_prod_fleet_website_mentolder_ab(run_cmd, ci):
    _assert_no_config_drift(run_cmd, ci["repo"], "prod-fleet/website-mentolder",
                            _website_deploy_list(ci["repo"]))



def test_t001994_website_deploy_allowlist_deckt_prod_fleet_website_korczewski_ab(run_cmd, ci):
    _assert_no_config_drift(run_cmd, ci["repo"], "prod-fleet/website-korczewski",
                            _website_deploy_list(ci["repo"]))



def test_t001994_website_deploy_allowlist_deckt_k3d_website_yaml_dev_ab(ci):
    repo = ci["repo"]
    ph = {m.strip("${}") for m in re.findall(r"\$\{[A-Za-z0-9_]+\}",
                                             (repo / "k3d/website.yaml").read_text())}
    drift = sorted((ph - _website_deploy_list(repo)) & _schema_env_vars(repo))
    assert not drift, f"envsubst-Allowlist-Drift in k3d/website.yaml — fehlende Config-Vars: {' '.join(drift)}"



def test_t002083_deploy_sealed_secrets_yml_workflow_no_longer_exists(ci):
    assert not (ci["repo"] / ".github/workflows/deploy-sealed-secrets.yml").is_file()



def test_t002083_post_merge_yml_has_no_unguarded_task_workspace_deploy_in_deploy_manifests(ci):
    doc = yaml.safe_load(ci["wf"].read_text()) or {}
    job = (doc.get("jobs", {}) or {}).get("deploy-manifests", {}) or {}
    offenders = []
    for s in (job.get("steps", []) or []):
        run = s.get("run", "") or ""
        if re.search(r"task\s+workspace:deploy", run):
            guard = (s.get("if", "") or "") + run
            if "FLUX_ENABLED" not in guard:
                offenders.append(s.get("name", run[:40]))
    assert not offenders, f"unguarded workspace:deploy steps remain: {offenders}"



def test_t002083_render_fleet_artifact_yml_workflow_exists(ci):
    assert (ci["repo"] / ".github/workflows/render-fleet-artifact.yml").is_file()



def test_t002083_render_fleet_artifact_yml_pushes_an_oci_artifact_via_flux_push_artifact(ci):
    text = (ci["repo"] / ".github/workflows/render-fleet-artifact.yml").read_text()
    assert re.search(r"flux[^\S\n]+push[^\S\n]+artifact", text)



def test_t002083_render_fleet_artifact_yml_pings_the_flux_receiver_webhook_after_push(ci):
    text = (ci["repo"] / ".github/workflows/render-fleet-artifact.yml").read_text()
    assert re.search(r"flux-webhook|/hook/|receiver", text, re.I)



def test_t002083_build_website_yml_wires_render_artifact_job_for_fluxcd(ci):
    assert re.search(r"uses:[^\S\n]*\./\.github/workflows/render-fleet-artifact\.yml",
                     ci["build_wf"].read_text())



def test_t002083_build_brett_yml_wires_render_artifact_job_for_fluxcd(ci):
    brett = ci["repo"] / ".github/workflows/build-brett.yml"
    assert brett.is_file()
    assert re.search(r"uses:[^\S\n]*\./\.github/workflows/render-fleet-artifact\.yml",
                     brett.read_text())



def test_t002118_jeder_reusable_workflow_aufruf_deckt_die_permissions_des_callees(ci):
    wf_dir = ci["repo"] / ".github/workflows"
    rank = {"none": 0, "read": 1, "write": 2}
    declared = {}
    for f in glob.glob(str(wf_dir / "*.yml")):
        try:
            declared[os.path.basename(f)] = (yaml.safe_load(open(f)) or {}).get("permissions") or {}
        except Exception:
            pass
    bad = []
    for f in sorted(glob.glob(str(wf_dir / "*.yml"))):
        try:
            doc = yaml.safe_load(open(f)) or {}
        except Exception:
            continue
        top = doc.get("permissions")
        for job, spec in (doc.get("jobs") or {}).items():
            if not isinstance(spec, dict):
                continue
            uses = spec.get("uses", "")
            if not (isinstance(uses, str) and uses.startswith("./.github/workflows/")):
                continue
            jobperm = spec.get("permissions")
            if top is None and jobperm is None:
                continue
            have = {**(top or {}), **(jobperm or {})}
            need = declared.get(os.path.basename(uses), {})
            missing = {k: v for k, v in need.items()
                       if rank.get(have.get(k, "none"), 0) < rank.get(v, 0)}
            if missing:
                bad.append(f"{os.path.basename(f)} job '{job}' -> {os.path.basename(uses)}: fehlt {missing}")
    assert not bad, "Permissions-Konflikt (fuehrt zu startup_failure):\n" + "\n".join(bad)



def test_t002118_post_merge_yml_render_artifact_job_gewaehrt_packages_write(ci):
    d = yaml.safe_load(ci["wf"].read_text())
    p = d["jobs"]["render-artifact"].get("permissions") or {}
    assert p.get("packages") == "write"



def test_t002124_jeder_job_der_auch_indirekt_pnpm_braucht_richtet_es_ein(ci):
    root = ci["repo"]
    suite = [os.path.join(root, "Taskfile.yml")]
    suite += sorted(glob.glob(os.path.join(root, "taskfiles/Taskfile.*.yml")))
    suite += sorted(glob.glob(os.path.join(root, "taskfiles/Taskfile.*.yaml")))
    taskfile = "\n".join(open(f, encoding="utf-8").read() for f in suite)

    needs_pnpm = {"website:migrate"}
    starts = [(m.group(1), m.start())
              for m in re.finditer(r"^  ([a-z0-9:_-]+):\s*$", taskfile, re.M)]
    bodies = {}
    for i, (name, pos) in enumerate(starts):
        endpos = starts[i + 1][1] if i + 1 < len(starts) else len(taskfile)
        bodies[name] = taskfile[pos:endpos]

    changed = True
    while changed:
        changed = False
        for name, body in bodies.items():
            if name in needs_pnpm:
                continue
            if any(re.search(r"task\s+" + re.escape(t) + r"\b", body) for t in needs_pnpm):
                needs_pnpm.add(name)
                changed = True

    bad = []
    for f in sorted(glob.glob(os.path.join(root, ".github/workflows/*.yml"))):
        try:
            doc = yaml.safe_load(open(f, encoding="utf-8")) or {}
        except Exception:
            continue
        for job, spec in (doc.get("jobs") or {}).items():
            steps = spec.get("steps") if isinstance(spec, dict) else None
            if not steps:
                continue
            runs = " ".join(str(s.get("run", "")) for s in steps)
            hit = [t for t in needs_pnpm if re.search(r"task\s+" + re.escape(t) + r"\b", runs)]
            if not hit:
                continue
            uses = " ".join(str(s.get("uses", "")) for s in steps)
            if "pnpm/action-setup" not in uses:
                bad.append(f"{os.path.basename(f)} job '{job}' ruft {sorted(hit)} ohne pnpm-Setup")
    assert not bad, "Jobs brauchen pnpm (direkt oder ueber die Task-Kette), richten es aber nicht ein:\n" + "\n".join(bad)

