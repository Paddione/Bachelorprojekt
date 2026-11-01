"""Native migration of tests/spec/ci-cd.bats. (part 3/3)"""
import glob
import os
import re
import shutil
import stat
import tempfile
from pathlib import Path
import pytest


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


def _g(run_cmd, cwd: Path, *args):
    """git -c user.email=t@t -c user.name=t <args> in cwd (failures fail the test)."""
    return run_cmd(["git", "-c", "user.email=t@t", "-c", "user.name=t", *args], cwd=cwd).check()


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


def _validate(run_cmd, ci, *args):
    return run_cmd(["bash", str(ci["repo"] / "scripts/validate-commit-msg.sh"), *args])


def _sed_range(text: str, start_re: str, end_re: str) -> str:
    """sed -n '/START/,/END/p' (end checked from the line after the start)."""
    out = []
    active = False
    for line in text.splitlines():
        if not active:
            if re.search(start_re, line):
                active = True
                out.append(line)
            continue
        out.append(line)
        if re.search(end_re, line):
            break
    return "\n".join(out)


def test_t002328_die_scope_allowlist_umfasst_hoechstens_15_eintraege(run_cmd, ci):
    result = _validate(run_cmd, ci, "scopes")
    assert result.returncode == 0
    count = sum(1 for ln in result.output.splitlines() if ln)
    assert count <= 15


def test_t002328_agents_ist_ein_gueltiger_scope(run_cmd, ci):
    result = _validate(run_cmd, ci, "scopes")
    assert result.returncode == 0
    assert "agents" in result.output.splitlines()


def test_t002328_kein_synthetik_scope_cq0x_sec0x_dora0x_ist_mehr_registriert(run_cmd, ci):
    result = _validate(run_cmd, ci, "scopes")
    assert result.returncode == 0
    assert sum(1 for ln in result.output.splitlines() if re.search(r"^[a-z]+[0-9]{2}$", ln)) == 0


def test_t002328_konsolidierter_scope_admin_nennt_sein_ziel_website_in_der_diagnose(run_cmd, ci, tmp_path):
    msg = tmp_path / "msg-admin"
    msg.write_text("feat(admin): add dashboard\n")
    result = _validate(run_cmd, ci, "message", str(msg))
    assert result.returncode != 0
    assert "website" in result.output


def test_t002328_t002374_skills_ist_wieder_ein_gueltiger_scope(run_cmd, ci, tmp_path):
    msg = tmp_path / "msg-skills"
    msg.write_text("chore(skills): tidy up\n")
    result = _validate(run_cmd, ci, "message", str(msg))
    assert result.returncode == 0
    assert "OK" in result.output


def test_t002328_entfallener_scope_tracking_wird_als_entfernt_gemeldet_nicht_auf_ein_ziel_gemappt(run_cmd, ci, tmp_path):
    msg = tmp_path / "msg-tracking"
    msg.write_text("feat(tracking): add import\n")
    result = _validate(run_cmd, ci, "message", str(msg))
    assert result.returncode != 0
    assert "entfallen" in result.output


def test_t002328_register_scope_sh_weigert_sich_einen_konsolidierten_scope_neu_anzulegen(run_cmd, ci, tmp_path):
    register = str(ci["repo"] / "scripts/register-scope.sh")
    result = run_cmd(["bash", register, "admin", "--config", str(tmp_path / "nonexistent.cjs")])
    assert result.returncode != 0
    result = run_cmd(["bash", register, "admin"])
    assert result.returncode != 0
    assert "website" in result.output


def test_t002328_preflight_pr_scope_sh_bezieht_die_allowlist_nicht_mehr_aus_ci_yml(ci):
    text = (ci["repo"] / "scripts/preflight-pr-scope.sh").read_text()
    assert _count_lines(text, "CI_WORKFLOW") == 0


def test_t002328_die_alias_struktur_erfuellt_ihre_invarianten(run_cmd, ci):
    repo = ci["repo"]
    js = f"""
    const c = require('{repo}/commitlint.config.cjs');
    const named = new Set(c.namedScopes);
    const errs = [];
    for (const [alias, target] of Object.entries(c.scopeAliases)) {{
      if (!named.has(target)) errs.push('Alias-Ziel fehlt in namedScopes: ' + alias + ' -> ' + target);
      if (named.has(alias)) errs.push('Name ist Alias UND gueltiger Scope: ' + alias);
    }}
    for (const r of Object.keys(c.scopeRetired)) {{
      if (named.has(r)) errs.push('retired UND gueltig: ' + r);
      if (c.scopeAliases[r]) errs.push('retired UND Alias: ' + r);
    }}
    const re = new RegExp(c.syntheticScopeRe);
    for (const n of named) if (re.test(n)) errs.push('Synthetik-Regex faengt gueltigen Scope: ' + n);
    if (errs.length) {{ console.error(errs.join('\\n')); process.exit(1); }}
  """
    result = run_cmd(["node", "-e", js])
    assert result.returncode == 0


def test_t002328_jedes_alias_ziel_validiert_auch_tatsaechlich_als_commit_scope(run_cmd, ci, tmp_path):
    repo = ci["repo"]
    targets = run_cmd(["node", "-e",
                       f"const c = require('{repo}/commitlint.config.cjs');\n"
                       "process.stdout.write([...new Set(Object.values(c.scopeAliases))].join(' '));"]).stdout
    assert targets
    for t in targets.split():
        probe = tmp_path / "probe"
        probe.write_text(f"fix({t}): probe\n")
        result = _validate(run_cmd, ci, "message", str(probe))
        assert result.returncode == 0, f"Alias-Ziel '{t}' wird vom Guard abgelehnt"


def test_t002282_m1_devflow_ci_watch_regeneriert_freshness_vor_dem_push_nach_auto_rebase(run_cmd, ci, tmp_path):
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    log = mockdir / "calls.log"
    log.write_text("")
    gh = r'''#!/usr/bin/env bash
echo "gh $*" >> "$CALL_LOG"
case "$*" in
  *"pr view"*"--json mergeStateStatus"*) echo "DIRTY" ;;
  *"pr view"*"--json mergeable"*)        echo "MERGEABLE" ;;
  *"pr view"*"--json number"*)           echo "123" ;;
  *"pr view"*"--json statusCheckRollup"*) echo "" ;;
  *"api"*"check-runs"*)                  echo "0" ;;   # -> Exit 5, beendet den Loop
  *) ;;
esac
exit 0
'''
    git = r'''#!/usr/bin/env bash
echo "git $*" >> "$CALL_LOG"
case "$1" in
  rev-parse) echo "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" ;;
  status|diff) ;;   # sauberer Baum: kein Extra-Commit noetig
esac
exit 0
'''
    task = r'''#!/usr/bin/env bash
echo "task $*" >> "$CALL_LOG"
exit 0
'''
    _write_exec(mockdir / "gh", gh)
    _write_exec(mockdir / "git", git)
    _write_exec(mockdir / "task", task)
    env = {"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "CALL_LOG": str(log),
           "MAX_CI_ATTEMPTS": "1", "TICKET_OFFLINE": "1"}
    run_cmd(["timeout", "60", "bash", str(ci["repo"] / "scripts/devflow-ci-watch.sh"),
             "T002282", "http://example.com/pr/1"], env=env)
    calls = log.read_text().rstrip("\n").split("\n")
    regen = next((i for i, ln in enumerate(calls, 1) if re.search(r"^task .*freshness:regenerate", ln)), None)
    push = next((i for i, ln in enumerate(calls, 1) if re.search(r"^git push", ln)), None)
    assert push is not None, f"kein 'git push' im Mock-Log — Rebase-Zweig wurde nicht durchlaufen: {calls}"
    assert regen is not None, f"kein 'task freshness:regenerate' im Mock-Log: {calls}"
    assert regen < push, f"freshness:regenerate lief NACH dem Push: {calls}"


def test_t002375_p4_test_changed_prueft_die_erreichbarkeit_bevor_es_e2e_services_startet(ci):
    text = (ci["repo"] / "taskfiles/Taskfile.test.yml").read_text()
    assert _count_lines(text, "task test:e2e:services") >= 1, "der e2e:services-Aufruf ist ganz verschwunden"
    block = _awk_range_text(text, r"RUN_E2E_SERVICES.*=.*true.*npx", r"^        fi$")
    assert _count_lines(block, "4321") >= 1, "kein Erreichbarkeits-Check auf 4321 vor test:e2e:services"


def test_t002375_p4_der_skip_nennt_sich_sichtbar_und_als_nicht_blocker(ci):
    text = (ci["repo"] / "taskfiles/Taskfile.test.yml").read_text()
    lines = [ln for ln in text.splitlines() if "e2e services uebersprungen" in ln]
    assert len(lines) == 1, "keine sichtbare Skip-Meldung"
    assert sum(1 for ln in lines if "Kein PR-Blocker" in ln) == 1, \
        "die Skip-Meldung sagt nicht, dass es kein PR-Blocker ist"


def test_t002375_p4_freshness_check_unterscheidet_nicht_gestaged_von_nicht_committet(ci):
    text = (ci["repo"] / "taskfiles/Taskfile.quality.yml").read_text()
    assert _count_lines(text, "regenerated but not staged") == 1, "die 'nicht gestaged'-Meldung fehlt"
    assert _count_lines(text, "staged but not committed") == 1, "die 'nicht committet'-Meldung fehlt"
    assert _count_lines(text, "is stale — run 'task freshness:regenerate' locally and commit") == 0, \
        "die alte 'is stale'-Meldung steht noch da"


def test_t002375_p4_das_scan_universum_zaehlt_untracked_aber_nicht_ignorierte_dateien_mit(run_cmd, ci):
    scan = (ci["repo"] / "scripts/code-quality/scan.mjs").read_text()
    assert "--exclude-standard" in scan, "scan.mjs zaehlt weiterhin nur getrackte Dateien"
    probe = ci["repo"] / "scripts/t002375-p4-universe-probe.sh"
    if probe.exists():
        pytest.skip("Probe-Pfad existiert bereits")
    probe.write_text("#!/usr/bin/env bash\n")
    try:
        js = ("import('./scripts/code-quality/scan.mjs').then(async (m) => {\n"
              "  const { loadGates } = await import('./scripts/code-quality/load.mjs');\n"
              "  const u = m.scanUniverse('.', loadGates('docs/code-quality'));\n"
              "  console.log(u.includes('scripts/t002375-p4-universe-probe.sh') ? 'IN' : 'OUT');\n"
              "});\n")
        result = run_cmd(["node", "-e", js], cwd=ci["repo"])
        verdict = result.output
    finally:
        probe.unlink(missing_ok=True)
    assert "IN" in verdict, f"ungetrackte Datei fehlt im Scan-Universum: {verdict}"


def test_t002341_m1_stage_plan_sh_definiert_exec_sql_with_timeout(ci):
    path = ci["repo"] / "scripts/vda/ticket/stage-plan.sh"
    if not path.is_file():
        pytest.skip("stage-plan.sh nicht gefunden")
    assert "_exec_sql_with_timeout" in path.read_text(), "MISSING _exec_sql_with_timeout function in stage-plan.sh"


def test_t002341_m1_stage_plan_sh_timeout_wrapper_enthaelt_warn_message(ci):
    path = ci["repo"] / "scripts/vda/ticket/stage-plan.sh"
    if not path.is_file():
        pytest.skip("stage-plan.sh nicht gefunden")
    assert "timed out after" in path.read_text(), "MISSING timeout warning message in stage-plan.sh"


def test_t002341_m2_agent_collision_sh_filtert_generierte_pfade_aus_einer_dateiliste(run_cmd, ci):
    collision = ci["repo"] / "scripts/agent-collision.sh"
    if not collision.is_file():
        pytest.skip("agent-collision.sh nicht gefunden")
    repo = str(ci["repo"])
    # Positiv-Anker zuerst: eine echte Quelldatei MUSS die Filterung ueberleben (T002356-M1).
    result = run_cmd(["bash", "-c",
                      "source scripts/agent-collision.sh 2>/dev/null\n"
                      "_drop_generated 'components/website/src/data/test-inventory.json'"], cwd=repo)
    assert result.returncode == 0, "_drop_generated nicht aufrufbar"
    result = run_cmd(["bash", "-c",
                      "source scripts/agent-collision.sh 2>/dev/null\n"
                      "_drop_generated 'components/website/src/pages/index.astro'"], cwd=repo)
    assert "".join(result.output.split()) == "components/website/src/pages/index.astro", \
        f"Quelldatei wurde faelschlich gefiltert: '{result.output}'"
    result = run_cmd(["bash", "-c",
                      "source scripts/agent-collision.sh 2>/dev/null\n"
                      "_drop_generated 'components/website/src/data/test-inventory.json'"], cwd=repo)
    assert "".join(result.output.split()) == "", \
        f"test-inventory.json haette gefiltert werden muessen: '{result.output}'"


def test_t002341_m2_cmd_check_wendet_den_generated_filter_auf_beide_seiten_an(ci):
    path = ci["repo"] / "scripts/agent-collision.sh"
    if not path.is_file():
        pytest.skip("agent-collision.sh nicht gefunden")
    block = _sed_range(path.read_text(), r"^cmd_check\(\)", r"^\}")
    n = _count_lines(block, "_drop_generated")
    assert n >= 2, f"cmd_check ruft _drop_generated nur {n}x auf, erwartet >=2 (own + peer)"


def test_t002341_m3_agent_lock_sh_cmd_claim_enthaelt_cmd_reap_call(ci):
    path = ci["repo"] / "scripts/agent-lock.sh"
    if not path.is_file():
        pytest.skip("agent-lock.sh nicht gefunden")
    assert "cmd_reap" in path.read_text(), "MISSING cmd_reap call in agent-lock.sh"


def test_t002341_m3_agent_lock_sh_cmd_reap_entfernt_lock_dateien_mit_dead_sid(ci):
    path = ci["repo"] / "scripts/agent-lock.sh"
    if not path.is_file():
        pytest.skip("agent-lock.sh nicht gefunden")
    # [T900023] Reap-Logik liegt seit der S1-Aufteilung in scripts/agent-lock-reap.sh.
    pattern = re.compile(r"sid-dead.*return 0|_reap_log.*sid-dead")
    found = False
    for f in sorted(glob.glob(str(ci["repo"] / "scripts/agent-lock*.sh"))):
        if any(pattern.search(ln) for ln in Path(f).read_text().splitlines()):
            found = True
            break
    assert found, "MISSING sid-dead reap path in agent-lock.sh"


def test_t002341_m3_agent_lock_sh_pre_claim_reap_in_cmd_claim_hat_t002341_m3_kommentar(ci):
    path = ci["repo"] / "scripts/agent-lock.sh"
    if not path.is_file():
        pytest.skip("agent-lock.sh nicht gefunden")
    assert "T002341-M3" in path.read_text(), "MISSING T002341-M3 reference in agent-lock.sh"


def test_t002374_m1_skills_ist_ein_gueltiger_scope_kein_alias_mehr(run_cmd, ci):
    repo = ci["repo"]
    result = run_cmd(["node", "-e",
                      f"const cfg = require('{repo}/commitlint.config.cjs'); "
                      "process.stdout.write(cfg.scopeHint('skills') || '(empty)');"])
    assert "empty" in result.output, f"scopeHint fuer 'skills' soll leer sein: {result.output}"


def test_t002374_m2_agent_lock_sh_release_mit_force_ueberschreibt_sid_mismatch(run_cmd, ci, tmp_path):
    lock_dir = Path(tempfile.mkdtemp(dir=tmp_path))
    try:
        # Frisches Lock-Dir ohne .last-fetch-Marker wuerde einen echten git fetch ausloesen.
        (lock_dir / ".last-fetch").touch()
        script = str(ci["repo"] / "scripts/agent-lock.sh")
        env = {"AGENT_LOCK_DIR": str(lock_dir), "AGENT_LOCK_FAKE_ALIVE": "session-A-orch",
               "AGENT_LOCK_SID": "session-A-orch"}
        claim = run_cmd(["bash", script, "claim", "ticket", "T002374-m2", "--label", "test-delegate"],
                        env=env)
        assert claim.returncode == 0
        assert (lock_dir / "ticket__T002374-m2.json").is_file()

        env["AGENT_LOCK_SID"] = "session-B-sub"
        result = run_cmd(["bash", script, "release", "ticket", "T002374-m2", "--force"], env=env)
        assert result.returncode == 0, "release with --force must succeed even with SID mismatch"
        assert not (lock_dir / "ticket__T002374-m2.json").exists(), "lock file should be deleted after release"
    finally:
        shutil.rmtree(lock_dir, ignore_errors=True)

