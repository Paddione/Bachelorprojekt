"""Native migration of tests/spec/ci-cd.bats. (part 2/3)"""
import os
import re
import shutil
import stat
from pathlib import Path
import pytest
import yaml


def _count_lines(text: str, pattern: str, regex: bool = False) -> int:
    """grep -c PATTERN (literal unless regex=True)."""
    if regex:
        return sum(1 for ln in text.splitlines() if re.search(pattern, ln))
    return sum(1 for ln in text.splitlines() if pattern in ln)


def _write_exec(path: Path, body: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


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


def _envsubst_names(text: str) -> set:
    """grep -oE '\\\\\\$[A-Z0-9_]+' | tr -d '\\\\$' | sort -u (literal backslash-dollar tokens)."""
    return {m[2:] for m in re.findall(r"\\\$[A-Z0-9_]+", text)}


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


def _awk_block_after(text: str, header_re: str, end_re: str) -> str:
    """awk '/HEADER/{flag=1; next} /END/ && flag {exit} flag' (header line excluded)."""
    flag = False
    out = []
    for line in text.splitlines():
        if re.search(header_re, line):
            flag = True
            continue
        if re.search(end_re, line) and flag:
            break
        if flag:
            out.append(line)
    return "\n".join(out)


def _g(run_cmd, cwd: Path, *args):
    """git -c user.email=t@t -c user.name=t <args> in cwd (failures fail the test)."""
    return run_cmd(["git", "-c", "user.email=t@t", "-c", "user.name=t", *args], cwd=cwd).check()


def _finder_repo(ci, tmp: Path) -> Path:
    """cp finder into tmp/scripts (the caller creates the other directories)."""
    (tmp / "scripts").mkdir(parents=True, exist_ok=True)
    shutil.copy(ci["repo"] / "scripts/find-changed-tests.sh", tmp / "scripts/find-changed-tests.sh")
    return tmp


def _init_base(run_cmd, tmp: Path, allow_empty_base: bool = True):
    run_cmd(["git", "init", "-q", "-b", "main", "."], cwd=tmp).check()
    if allow_empty_base:
        _g(run_cmd, tmp, "commit", "-q", "--allow-empty", "-m", "base")
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "tree")
    _g(run_cmd, tmp, "update-ref", "refs/remotes/origin/main", "HEAD")


def _finder(run_cmd, tmp: Path, *args):
    return run_cmd(["bash", "scripts/find-changed-tests.sh", *args], cwd=tmp)


def _awk_range_text(text: str, start_re: str, end_re: str) -> str:
    """awk '/START/,/END/' : inclusive ranges (end may match on the start line)."""
    out = []
    active = False
    for line in text.splitlines():
        if not active:
            if re.search(start_re, line):
                active = True
                out.append(line)
                if re.search(end_re, line):
                    active = False
            continue
        out.append(line)
        if re.search(end_re, line):
            active = False
    return "\n".join(out)



def test_t002626_post_merge_yml_hat_keine_unaufloesbaren_needs_kanten(ci):
    d = yaml.safe_load(ci["wf"].read_text())
    jobs = set(d["jobs"])
    for name, job in d["jobs"].items():
        needs = job.get("needs") or []
        if isinstance(needs, str):
            needs = [needs]
        for n in needs:
            assert n in jobs, f"{name} needs {n!r} which does not exist"
    # Positiv-Anker: es gibt ueberhaupt Jobs mit Abhaengigkeiten.
    assert any(j.get("needs") for j in d["jobs"].values())



def test_t002157_render_fleet_artifact_triggert_ohne_pfadfilter_auf_jedem_main_push(ci):
    text = (ci["repo"] / ".github/workflows/render-fleet-artifact.yml").read_text()
    assert re.search(r"^[^\S\n]+branches: \[main\]", text, re.M)
    # run grep -cE '^[[:space:]]+paths:' -> status 1 und output 0
    assert _count_lines(text, r"^[^\S\n]+paths:", regex=True) == 0



def test_t002157_render_fleet_artifact_ist_manuell_ausloesbar(ci):
    text = (ci["repo"] / ".github/workflows/render-fleet-artifact.yml").read_text()
    assert re.search(r"^\s*workflow_dispatch:", text, re.M), \
        "kein workflow_dispatch — ein Artefakt-Rebuild laesst sich nicht gezielt ausloesen"



def test_t002158_a_build_website_triggert_auf_die_repohealth_datenquelle_goals_md(ci):
    assert re.search(r"\.claude/lib/goals\.md", ci["build_wf"].read_text())



def test_t002158_b_freshness_regen_setzt_skip_ci_nicht_unbedingt_im_bot_commit(ci):
    wf = ci["repo"] / ".github/workflows/freshness-regen.yml"
    assert not re.search(r'git commit -m "[^"]*\[skip ci\]"', wf.read_text())



def test_t002158_b_freshness_regen_unterdrueckt_ci_ueberhaupt_nicht_mehr_t002889(ci):
    wf = ci["repo"] / ".github/workflows/freshness-regen.yml"
    assert wf.is_file()
    text = wf.read_text()
    assert _count_lines(text, "git commit") > 0
    non_comment = [ln for ln in text.splitlines() if not re.match(r"^[ \t]*#", ln)]
    assert sum(1 for ln in non_comment if "[skip ci]" in ln) == 0



def test_t002161_a_renovate_yml_praegt_den_token_via_create_github_app_token_sha_gepinnt(ci):
    text = (ci["repo"] / ".github/workflows/renovate.yml").read_text()
    assert re.search(r"uses: actions/create-github-app-token@[0-9a-f]{40}", text), \
        "kein SHA-gepinnter actions/create-github-app-token-Step in renovate.yml"



def test_t002161_a_renovate_yml_liest_die_app_identitaet_aus_renovate_app_id(ci):
    text = (ci["repo"] / ".github/workflows/renovate.yml").read_text()
    assert re.search(r"^\s+client-id: \$\{\{ secrets\.RENOVATE_APP_ID \}\}", text, re.M), \
        "create-github-app-token wird nicht mit client-id aus RENOVATE_APP_ID aufgerufen"
    assert re.search(r"^\s+private-key: \$\{\{ secrets\.RENOVATE_APP_PRIVATE_KEY \}\}", text, re.M), \
        "private-key liest nicht aus RENOVATE_APP_PRIVATE_KEY"



def test_t002161_b_renovate_yml_uebergibt_den_gepraegten_app_token_nicht_ein_statisches_secret(ci):
    text = (ci["repo"] / ".github/workflows/renovate.yml").read_text()
    assert re.search(r"steps\.[a-z-]+\.outputs\.token", text), \
        "renovatebot/github-action bekommt keinen Token aus dem create-github-app-token-Step"



def test_t002161_c_auto_enable_automerge_yml_nimmt_renovate_prs_dependencies_label_aus(ci):
    text = (ci["repo"] / ".github/workflows/auto-enable-automerge.yml").read_text()
    assert re.search(r"labels.\*.name", text) and "dependencies" in text, \
        "auto-enable-automerge.yml prueft das dependencies-Label nicht"



def test_t002161_d_renovate_json5_labelt_seine_prs_und_setzt_platformautomerge(ci):
    cfg = (ci["repo"] / "renovate.json5").read_text()
    assert re.search(r'"labels"\s*:\s*\[', cfg), "renovate.json5 setzt kein labels: [...]"
    assert re.search(r'"platformAutomerge"\s*:\s*true', cfg), \
        "renovate.json5 setzt platformAutomerge nicht explizit auf true"



def test_t002165_renovate_yml_gibt_renovate_die_repo_arbeitsliste_explizit_mit(ci):
    text = (ci["repo"] / ".github/workflows/renovate.yml").read_text()
    assert re.search(r"RENOVATE_REPOSITORIES: \$\{\{ github\.repository \}\}", text), \
        "renovate.yml setzt RENOVATE_REPOSITORIES nicht auf github.repository"



def test_t002165_renovate_json5_nutzt_kein_deprecated_matchpackagepatterns(ci):
    cfg = (ci["repo"] / "renovate.json5").read_text()
    assert not re.search(r'"matchPackagePatterns"', cfg), \
        "renovate.json5 verwendet noch matchPackagePatterns (deprecated)"



def test_t002165_renovate_json5_hat_keine_keycloak_regel_mehr_plattform_nutzt_pocket_id(ci):
    cfg = (ci["repo"] / "renovate.json5").read_text()
    assert not re.search(r'"matchPackageNames".*keycloak|"matchPackagePatterns".*keycloak', cfg), \
        "renovate.json5 gruppiert noch keycloak-Images"



def test_t002163_website_deploy_list_erfasst_alle_envsubst_aufrufe_des_tasks(ci):
    names = _website_deploy_list(ci["repo"])
    for v in ("WEBSITE_IMAGE", "WEBSITE_CONFIG_SHA", "WEBSITE_NAMESPACE"):
        assert v in names, f"{v} fehlt in der extrahierten website:deploy-Allowlist"



def test_t002163_ci_yml_fuehrt_alle_spec_tests_via_task_test_spec_in_einem_required_check(ci):
    text = (ci["repo"] / ".github/workflows/ci.yml").read_text()
    assert re.search(r"task test:spec|tests/spec/\*\.bats", text), \
        "ci.yml ruft task test:spec nicht auf (laedt alle spec-tests)"



def test_t002182_ci_yml_test_spec_job_uses_task_test_spec_full_glob(ci):
    text = (ci["repo"] / ".github/workflows/ci.yml").read_text()
    block = _awk_block_after(text, r"^  test-spec-shard:", r"^  [a-z]")
    assert re.search(r"task test:spec|tests/spec/\*\.bats", block), \
        "test-spec job does not use task test:spec or tests/spec/*.bats glob"
    non_comment = [ln for ln in block.splitlines() if not re.match(r"^[ \t]*#", ln)]
    assert not any(re.search(r"tests/spec/[a-z0-9_-]+\.bats", ln) for ln in non_comment), \
        "test-spec job still enumerates individual spec files"



def test_t002245_t002780_gescopte_spec_suite_behaelt_einen_erreichbaren_vollauf(ci):
    text = (ci["repo"] / ".github/workflows/ci.yml").read_text()
    block = _awk_block_after(text, r"^  test-spec-shard:", r"^  [a-z]")
    # Positiv-Anker (T002356-M1): der Job-Block muss gefunden worden sein.
    assert block, "Job-Block 'test-spec-shard:' in ci.yml nicht gefunden"

    if "task test:spec:changed" in block:
        assert "github.event_name == 'pull_request'" in block, \
            "scoped spec run is not gated on github.event_name == 'pull_request'"
        assert re.search(r"^\s+(task )?test:spec\s*$|task test:spec$", block, re.M), \
            "no bare 'task test:spec' fallback left in the test-spec job"
        assert re.search(r"^  schedule:", text, re.M), \
            "kein 'schedule:'-Trigger in ci.yml, obwohl die Spec-Suite gescopt wird"
        assert re.search(r"^\s+- cron: '", text, re.M), \
            "'schedule:' ohne cron-Eintrag — der Trigger feuert nie"

    assert re.search(r"origin \+?main:refs/remotes/origin/main", block), \
        "test-spec does not fetch origin/main — a diff-scoped run would select nothing"



def test_t002245_find_changed_tests_sh_spec_maps_plan_slugs_and_widens_on_harness_changes(run_cmd, ci, tmp_path):
    tmp = tmp_path / "finder-repo"
    (tmp / "tests/spec/helpers").mkdir(parents=True)
    (tmp / "docs/superpowers/specs/alpha").mkdir(parents=True)
    _finder_repo(ci, tmp)
    (tmp / "tests/spec/alpha.bats").write_text("")
    (tmp / "tests/spec/beta.bats").write_text("")
    (tmp / "tests/spec/helpers/shared.bash").write_text("")
    (tmp / "docs/superpowers/specs/alpha/spec.md").write_text("")
    _init_base(run_cmd, tmp)

    # docs/superpowers/specs/alpha/** -> tests/spec/alpha.bats, and nothing else
    _g(run_cmd, tmp, "checkout", "-q", "-b", "topic")
    with open(tmp / "docs/superpowers/specs/alpha/spec.md", "a") as fh:
        fh.write("change\n")
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "plan")
    result = _finder(run_cmd, tmp, "spec")
    assert result.returncode == 0
    assert result.stdout.rstrip("\n") == "tests/spec/alpha.bats"

    # shared harness -> full suite (both files)
    _g(run_cmd, tmp, "checkout", "-q", "main")
    _g(run_cmd, tmp, "checkout", "-q", "-b", "topic2")
    with open(tmp / "tests/spec/helpers/shared.bash", "a") as fh:
        fh.write("change\n")
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "harness")
    result = _finder(run_cmd, tmp, "spec")
    assert result.returncode == 0
    assert len(result.stdout.rstrip("\n").split("\n")) == 2



def test_t002245_find_changed_tests_sh_spec_picks_the_deepest_path_referencing_spec(run_cmd, ci, tmp_path):
    tmp = tmp_path / "probe-repo"
    (tmp / "tests/spec").mkdir(parents=True)
    (tmp / "components/website/src/pages/admin").mkdir(parents=True)
    _finder_repo(ci, tmp)
    (tmp / "tests/spec/deep.bats").write_text("# covers components/website/src/pages/admin\n")
    (tmp / "tests/spec/shallow.bats").write_text("# covers components/website/src\n")
    (tmp / "tests/spec/toplevel.bats").write_text("# covers website\n")
    (tmp / "components/website/src/pages/admin/dora.astro").write_text("")
    (tmp / "components/website/loose.txt").write_text("")
    run_cmd(["git", "init", "-q", "-b", "main", "."], cwd=tmp).check()
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "tree")
    _g(run_cmd, tmp, "update-ref", "refs/remotes/origin/main", "HEAD")

    # Deepest match wins: the admin spec, not the broader components/website/src one.
    _g(run_cmd, tmp, "checkout", "-q", "-b", "topic")
    with open(tmp / "components/website/src/pages/admin/dora.astro", "a") as fh:
        fh.write("change\n")
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "deep")
    result = _finder(run_cmd, tmp, "spec")
    assert result.returncode == 0
    assert result.stdout.rstrip("\n") == "tests/spec/deep.bats"

    # Floor: a top-level-only reference must not drag in the whole domain.
    _g(run_cmd, tmp, "checkout", "-q", "main")
    _g(run_cmd, tmp, "checkout", "-q", "-b", "topic2")
    with open(tmp / "components/website/loose.txt", "a") as fh:
        fh.write("change\n")
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "floor")
    result = _finder(run_cmd, tmp, "spec")
    assert result.returncode == 0
    assert result.stdout.rstrip("\n") == ""



def test_t002345_a_scripts_change_without_a_name_match_falls_through_to_the_path_probe(run_cmd, ci, tmp_path):
    tmp = tmp_path / "scripts-probe-repo"
    (tmp / "scripts/pipeline").mkdir(parents=True)
    (tmp / "tests/spec").mkdir(parents=True)
    _finder_repo(ci, tmp)
    (tmp / "tests/spec/pipeline-queue.bats").write_text("# covers scripts/pipeline/queue.sh\n")
    (tmp / "tests/spec/unrelated-one.bats").write_text("")
    (tmp / "tests/spec/unrelated-two.bats").write_text("")
    (tmp / "scripts/pipeline/queue.sh").write_text("")
    run_cmd(["git", "init", "-q", "-b", "main", "."], cwd=tmp).check()
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "tree")
    _g(run_cmd, tmp, "update-ref", "refs/remotes/origin/main", "HEAD")
    _g(run_cmd, tmp, "checkout", "-q", "-b", "topic")
    with open(tmp / "scripts/pipeline/queue.sh", "a") as fh:
        fh.write("change\n")
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "scripts-change")
    result = _finder(run_cmd, tmp, "spec")
    assert result.returncode == 0
    assert result.stdout.rstrip("\n") == "tests/spec/pipeline-queue.bats"



def test_t002345_a_scripts_change_with_no_referencing_spec_still_widens_to_the_full_suite(run_cmd, ci, tmp_path):
    tmp = tmp_path / "scripts-noprobe-repo"
    (tmp / "scripts/orphan").mkdir(parents=True)
    (tmp / "tests/spec").mkdir(parents=True)
    _finder_repo(ci, tmp)
    (tmp / "tests/spec/alpha.bats").write_text("")
    (tmp / "tests/spec/beta.bats").write_text("")
    (tmp / "scripts/orphan/nobody-tests-me.sh").write_text("")
    run_cmd(["git", "init", "-q", "-b", "main", "."], cwd=tmp).check()
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "tree")
    _g(run_cmd, tmp, "update-ref", "refs/remotes/origin/main", "HEAD")
    _g(run_cmd, tmp, "checkout", "-q", "-b", "topic")
    with open(tmp / "scripts/orphan/nobody-tests-me.sh", "a") as fh:
        fh.write("change\n")
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "orphan")
    result = _finder(run_cmd, tmp, "spec")
    assert result.returncode == 0
    assert len(result.stdout.rstrip("\n").split("\n")) == 2



def test_t900931_find_changed_tests_sh_ignores_removed_code_and_does_not_fall_back_to_run_all(run_cmd, ci, tmp_path):
    tmp = tmp_path / "removed-code-repo"
    (tmp / "scripts/obsolete").mkdir(parents=True)
    (tmp / "tests/spec").mkdir(parents=True)
    (tmp / "tests/unit").mkdir(parents=True)
    _finder_repo(ci, tmp)
    (tmp / "tests/spec/alpha.bats").write_text("")
    (tmp / "tests/spec/beta.bats").write_text("")
    (tmp / "scripts/obsolete/remove-me.sh").write_text("")
    run_cmd(["git", "init", "-q", "-b", "main", "."], cwd=tmp).check()
    _g(run_cmd, tmp, "add", "-A")
    _g(run_cmd, tmp, "commit", "-q", "-m", "tree")
    _g(run_cmd, tmp, "update-ref", "refs/remotes/origin/main", "HEAD")
    # Removing a script should not trigger RUN_ALL
    _g(run_cmd, tmp, "checkout", "-q", "-b", "topic")
    _g(run_cmd, tmp, "rm", "-q", "scripts/obsolete/remove-me.sh")
    _g(run_cmd, tmp, "commit", "-q", "-m", "remove obsolete script")
    result = _finder(run_cmd, tmp, "spec")
    assert result.returncode == 0
    assert result.stdout == "" or result.stdout.strip() == ""
    result = _finder(run_cmd, tmp, "unit")
    assert result.returncode == 0
    assert result.stdout.strip() == ""



def test_t002170_renovate_json5_nutzt_manager_file_patterns_statt_deprecated_file_match(ci):
    cfg = (ci["repo"] / "renovate.json5").read_text()
    assert not re.search(r'"fileMatch"', cfg), "renovate.json5 verwendet noch den deprecated Key fileMatch"
    assert re.search(r'"managerFilePatterns"', cfg), "kein managerFilePatterns im kubernetes-Manager"



def test_t002170_kubernetes_manager_file_patterns_deckt_alle_vier_manifest_baeume_ab(ci):
    cfg = (ci["repo"] / "renovate.json5").read_text()
    for tree in ("k3d", "prod", "prod-mentolder", "prod-korczewski", "prod-fleet"):
        assert re.search(r'"/\^' + re.escape(tree) + "/", cfg), \
            f"kein managerFilePatterns-Eintrag fuer '{tree}/'"



def test_t002174_flux_render_implementiert_den_rigger_host_ip_auf_comfy_host_ip_fallback(ci):
    script = ci["repo"] / "scripts/flux-render-artifact.sh"
    assert script.is_file()
    assert re.search(r"RIGGER_HOST_IP=.*RIGGER_HOST_IP:-.*COMFY_HOST_IP", script.read_text()), \
        "kein Fallback RIGGER_HOST_IP -> COMFY_HOST_IP in flux-render-artifact.sh"



def test_t002174_flux_render_rendert_den_dev_stack_nicht_wenn_dev_domain_leer_ist(ci):
    script = ci["repo"] / "scripts/flux-render-artifact.sh"
    assert script.is_file()
    text = script.read_text()
    assert "DEV_DOMAIN" in text, "flux-render-artifact.sh prueft DEV_DOMAIN ueberhaupt nicht"
    block = _awk_range_text(text, r"# 1b\. Dev", r"^\)")
    assert re.search(r"(-z .*DEV_DOMAIN|DEV_DOMAIN.*-z)", block), \
        "der dev-Renderblock hat keinen Leer-Guard auf DEV_DOMAIN"



def test_t002174_der_dev_renderblock_verschluckt_env_resolve_fehler_nicht_per_or_true(ci):
    script = ci["repo"] / "scripts/flux-render-artifact.sh"
    assert script.is_file()
    block = _awk_range_text(script.read_text(), r"# 1b\. Dev", r"^\)")
    assert not re.search(r"env-resolve\.sh dev.*\|\| true", block), \
        "'source scripts/env-resolve.sh dev ... || true' im dev-Renderblock"



def test_t002186_devflow_ci_watch_0_check_runs_exits_with_code_5(run_cmd, ci, tmp_path):
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    gh = r'''#!/usr/bin/env bash
# Mock gh fuer den T002186-Test — deckt JEDEN Aufruf ab, kein Passthrough.
case "$*" in
  *"pr view"*"--json statusCheckRollup"*)
    # Keine fehlgeschlagenen Checks
    echo ""
    ;;
  *"pr view"*"--json headRefName"*)
    echo "feature/stub-branch"
    ;;
  *"pr view"*"--json headRefOid"*)
    # [T003225] Der headSha-Filter fragt den PR-HEAD explizit ab.
    echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ;;
  *"api"*"check-runs"*)
    # Der zu testende Zustand: null Check-Runs.
    echo "0"
    ;;
  *"pr view"*"--json number"*)
    echo "123"
    ;;
  *"pr view"*"--json mergeStateStatus"*)
    echo "CLEAN"
    ;;
  *"pr view"*"--json mergeable"*)
    echo "MERGEABLE"
    ;;
  *"pr checks"*)
    # Wuerde sonst mit --watch blockieren
    ;;
  *)
    # Catch-All: still und erfolgreich, NIEMALS an das echte gh delegieren
    ;;
esac
exit 0
'''
    _write_exec(mockdir / "gh", gh)
    env = {"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "MAX_CI_ATTEMPTS": "1"}
    result = run_cmd(["timeout", "60", "bash", str(ci["repo"] / "scripts/devflow-ci-watch.sh"),
                      "T002186", "http://example.com/pr/1"], env=env)
    assert result.returncode == 5
    assert "Keine CI-Checks" in result.output



def test_t002242_m1_devflow_ci_watch_sh_ruft_assert_phase_chain_vor_dem_gruenen_exit_auf(run_cmd, ci):
    result = run_cmd(["grep", "-n", "assert-phase-chain", str(ci["repo"] / "scripts/devflow-ci-watch.sh")])
    assert result.returncode == 0



def test_t002242_m3_devflow_post_merge_deploy_sh_sammelt_exit_codes_und_schlaegt_fail_closed_fehl(run_cmd, ci):
    result = run_cmd(["grep", "-nE", r"\|\| FAILED_TASKS|deploy blocked|deploy failed",
                      str(ci["repo"] / "scripts/devflow-post-merge-deploy.sh")])
    assert result.returncode == 0



def test_t002252_freshness_check_regeneriert_die_artefakte_vor_dem_diff_check(ci):
    text = (ci["repo"] / "taskfiles/Taskfile.quality.yml").read_text()
    block_lines = []
    in_block = False
    for line in text.splitlines():
        if re.search(r"^  freshness:check:", line):
            in_block = True
            block_lines.append(line)
            continue
        if in_block and re.search(r"^  [a-z][a-z0-9:-]*:$", line):
            break
        if in_block:
            block_lines.append(line)
    block = "\n".join(block_lines)
    # Der Regenerate-Schritt muss existieren ...
    assert re.search(r"task:\s*freshness:regenerate", block)
    # ... und VOR der Diff-Schleife stehen.
    regen_line = next((i for i, ln in enumerate(block.splitlines(), 1)
                       if re.search(r"task:[^\S\n]*freshness:regenerate", ln)), None)
    diff_line = next((i for i, ln in enumerate(block.splitlines(), 1)
                      if re.search(r"git diff (--exit-code|--quiet)", ln)), None)
    assert regen_line is not None
    assert diff_line is not None
    assert regen_line < diff_line

