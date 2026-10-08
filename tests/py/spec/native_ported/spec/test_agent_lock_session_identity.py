"""Native migration of tests/spec/agent-lock-session-identity.bats."""
import datetime as dt
import re
import shlex
import shutil
import subprocess
from pathlib import Path

import pytest

EXTRA_UNSET = ["AGENT_LOCK_SID", "AGENT_LOCK_TOOL", "AGENT_LOCK_FAKE_ALIVE"]


def _harness_names(lock_text):
    """Harness-Variablen aus scripts/agent-lock.sh lesen (wie _unset_claude_harness_env)."""
    names = []
    for line in lock_text.splitlines():
        m = re.match(r'^_AGENT_LOCK_(SID|TOOL_MARKER)_ENVS="([^"]*)"', line)
        if m:
            names.extend(m.group(2).split())
    assert "CLAUDE_CODE_SESSION_ID" in names and "CLAUDECODE" in names, (
        f"Harness-Marker-Listen nicht aus agent-lock.sh lesbar: {names}"
    )
    return names


def _env_args(unset, assigns):
    """env-Praefix: erst -u fuer alle Harness-Variablen, dann die Testzuweisungen."""
    args = ["env"]
    for name in unset:
        args += ["-u", name]
    args += [f"{k}={v}" for k, v in assigns.items()]
    return args


def _owner_fields(path: Path, key: str):
    """Emulate: sed -n 's/.*"KEY": *"\\([^"]*\\)".*/\\1/p' FILE (alle Treffer, zeilenweise)."""
    rx = re.compile(r'.*"' + key + r'": *"([^"]*)".*')
    return "\n".join(m.group(1) for m in (rx.match(line) for line in path.read_text(encoding="utf-8").splitlines()) if m)


def _awk_blocks(lines, start_re, end_re):
    """Emulate: awk '/START/{flag=1} /END/{flag=0} flag' (End-Zeile nicht enthalten)."""
    out, flag = [], False
    for line in lines:
        if start_re.search(line):
            flag = True
        if end_re.search(line):
            flag = False
        if flag:
            out.append(line)
    return out


def _any_line(lines, pattern, flags=0):
    """Emulate grep -E (line-based); POSIX-Klasse [[:space:]] als [ \\t] uebersetzt."""
    rx = re.compile(pattern.replace("[[:space:]]", r"[ \t]"), flags)
    return any(rx.search(line) for line in lines)


@pytest.fixture
def repo(repo_root):
    return repo_root


@pytest.fixture
def lock_text(repo):
    return (repo / "scripts" / "agent-lock.sh").read_text(encoding="utf-8")


@pytest.fixture
def harness_unset(lock_text):
    return _harness_names(lock_text) + ["CLAUDECODE", "CLAUDE_CODE"] + EXTRA_UNSET


class Lock:
    """Aufruf von scripts/agent-lock.sh mit bereinigter Harness-Umgebung."""

    def __init__(self, repo, run_cmd, unset):
        self.repo = repo
        self.run_cmd = run_cmd
        self.lock = str(repo / "scripts" / "agent-lock.sh")
        self.unset = sorted(set(unset))

    def call(self, args, env=None, cwd=None, timeout=60):
        cmd = _env_args(self.unset, env or {}) + ["bash", self.lock, *args]
        return self.run_cmd(cmd, cwd=cwd or self.repo, timeout=timeout)

    def shell_prefix(self, env=None):
        return " ".join(shlex.quote(a) for a in _env_args(self.unset, env or {}))


@pytest.fixture
def lock(repo, run_cmd, harness_unset):
    return Lock(repo, run_cmd, harness_unset)


@pytest.fixture
def lock_dir(tmp_path):
    d = tmp_path / "locks"
    d.mkdir()
    return d


# ── Mishap 1: agent-lock identity drift ────────────────────────────────


def test_t001268_m1_agent_lock_uses_claude_session_id_as_owner_sid(lock, lock_dir):
    r = lock.call(
        ["claim", "ticket", "T001268-m1", "--label", "mishap1"],
        env={"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_SESSION_ID": "claude-session-fixed-1234"},
    )
    r.check()
    owner = _owner_fields(lock_dir / "ticket__T001268-m1.json", "owner_sid")
    assert owner == "claude-session-fixed-1234"


def test_t001268_m1_different_claude_session_ids_are_different_owners(lock, lock_dir):
    lock_file = lock_dir / "ticket__T001268-m1b.json"
    lock.call(
        ["claim", "ticket", "T001268-m1b"],
        env={"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_SESSION_ID": "session-A"},
    ).check()
    owner_a = _owner_fields(lock_file, "owner_sid")
    r = lock.call(
        ["claim", "ticket", "T001268-m1b"],
        env={"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_SESSION_ID": "session-B"},
    )
    assert r.returncode == 1
    assert "bereits gehalten" in r.output
    assert owner_a == "session-A"


# ── Mishap 2: dev-flow-plan stale-commit-on-main guard ──────────────────


def test_t001268_m2_dev_flow_plan_forbids_plan_stage_commit_on_main(repo):
    skill = repo / ".claude/skills/dev-flow-plan/SKILL.md"
    assert skill.is_file()
    pattern = (
        r"do[[:space:]]+not[[:space:]]+commit[[:space:]]+on[[:space:]]+main"
        r"|nicht[[:space:]]+auf[[:space:]]+main[[:space:]]+committen"
        r"|refuse.*main"
        r"|kein[[:space:]]+commit[[:space:]]+auf[[:space:]]+main"
        r"|main.*verboten"
        r"|main.*verweigern"
    )
    lines = skill.read_text(encoding="utf-8").splitlines()
    assert _any_line(lines, pattern, re.IGNORECASE)


def test_t001268_m2_dev_flow_plan_requires_staged_set_check_before_plan_commit(repo):
    skill = repo / ".claude/skills/dev-flow-plan/SKILL.md"
    assert skill.is_file()
    text = skill.read_text(encoding="utf-8")
    lines = text.splitlines()
    assert _any_line(lines, r"diff[[:space:]]+--cached[[:space:]]+--name-only", re.IGNORECASE)
    assert "test-inventory.json" in text


# ── T001386: Feature-Pfad fehlt expliziter Ticket-Claim vor Pre-Commit-Guard ──


def test_t001386_feature_path_step_b1_claims_ticket_when_ticket_id_known(repo):
    skill = repo / ".claude/skills/dev-flow-plan/SKILL.md"
    assert skill.is_file()
    assert "dev-flow-plan-phases" in skill.read_text(encoding="utf-8")
    phases_ref = repo / ".claude/skills/references/dev-flow-plan-phases.md"
    assert phases_ref.is_file()
    lines = phases_ref.read_text(encoding="utf-8").splitlines()
    block = _awk_blocks(lines, re.compile(r"^#### Schritt B\.1:"), re.compile(r"^#### Schritt B\.2:"))
    assert _any_line(block, r"agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket")


def test_t001386_feature_path_step_4_5_claims_ticket_before_step_5(repo):
    skill = repo / ".claude/skills/dev-flow-plan/SKILL.md"
    assert skill.is_file()
    lines = skill.read_text(encoding="utf-8").splitlines()
    block = _awk_blocks(lines, re.compile(r"^### Schritt 4\.5:"), re.compile(r"^### Schritt 5:"))
    assert _any_line(block, r"agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket")


def test_t001386_step_5_pre_commit_guard_checks_lock_file_existence_before_reading(repo):
    skill = repo / ".claude/skills/dev-flow-plan/SKILL.md"
    assert skill.is_file()
    lines = skill.read_text(encoding="utf-8").splitlines()
    block = _awk_blocks(lines, re.compile(r"^### Schritt 5:"), re.compile(r"^### Schritt 6:"))
    assert _any_line(
        block,
        r'\-f[[:space:]]+"?\$LOCK_FILE"?|kein[[:space:]]+ticket-scoped[[:space:]]+agent-lock',
        re.IGNORECASE,
    )


# ── T002261-M1: cmd_release schweigt bei SID-Mismatch ────────────────


def test_t002261_m1_cmd_release_emits_stderr_diagnostic_on_sid_mismatch(lock, lock_dir):
    lock_file = lock_dir / "ticket__T002261-m1.json"
    env = {"AGENT_LOCK_DIR": str(lock_dir)}
    lock.call(
        ["claim", "ticket", "T002261-m1", "--label", "test-release"],
        env={**env, "AGENT_LOCK_TOOL": "claude", "AGENT_LOCK_SID": "session-A"},
    ).check()
    assert lock_file.is_file()

    r = lock.call(
        ["release", "ticket", "T002261-m1"],
        env={**env, "AGENT_LOCK_TOOL": "gemini", "AGENT_LOCK_SID": "session-B"},
    )
    assert r.returncode == 1
    assert r.output != ""
    assert lock_file.is_file()


# ── [T002375-p1] Die real exportierte Harness-Variable ─────────────────


def test_t002375_p1_my_sid_uses_claude_code_session_id_when_claude_session_id_unset(lock, lock_dir):
    lock_file = lock_dir / "ticket__T002375-p1a.json"
    r = lock.call(
        ["claim", "ticket", "T002375-p1a", "--label", "probe"],
        env={"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_CODE_SESSION_ID": "harness-real-var-1"},
    )
    r.check()
    owner = _owner_fields(lock_file, "owner_sid")
    assert owner == "harness-real-var-1", f"owner_sid war '{owner}', erwartet 'harness-real-var-1'"


def test_t002375_p1_release_succeeds_without_force_across_tool_call_boundary(repo, run_cmd, lock, lock_dir):
    # setsid ist tragend: ohne neue Session erben beide Aufrufe dieselbe SID.
    if shutil.which("setsid") is None:
        pytest.skip("setsid nicht verfuegbar — die SID-Differenz waere nicht erzeugbar")
    sid_a = run_cmd("setsid bash -c 'ps -o sess= -p $$' </dev/null", timeout=60).stdout.replace(" ", "").strip()
    sid_b = run_cmd("setsid bash -c 'ps -o sess= -p $$' </dev/null", timeout=60).stdout.replace(" ", "").strip()
    if sid_a == sid_b:
        pytest.skip("setsid erzeugt hier keine getrennten Sessions")

    base = {"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_CODE_SESSION_ID": "boundary-sid"}
    claim_inner = "bash " + shlex.quote(lock.lock) + " claim ticket T002375-p1b --label probe"
    release_inner = "bash " + shlex.quote(lock.lock) + " release ticket T002375-p1b"

    r = run_cmd(
        f"{lock.shell_prefix(base)} setsid bash -c {shlex.quote(claim_inner)} </dev/null",
        timeout=60,
    )
    assert r.returncode == 0, f"claim fehlgeschlagen: {r.output}"

    r = run_cmd(
        f"{lock.shell_prefix(base)} setsid bash -c {shlex.quote(release_inner)} </dev/null",
        timeout=60,
    )
    assert r.returncode == 0, f"release verlangte --force: {r.output}"


def test_t002375_p1_ticket_scoped_claim_fills_branch_from_head(repo, run_cmd, lock, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    tmprepo = tmp_path / "repo"
    tmprepo.mkdir()
    run_cmd(["git", "init", "-q", "-b", "probe-branch"], cwd=tmprepo).check()
    run_cmd(
        ["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"],
        cwd=tmprepo,
    ).check()

    r = lock.call(
        ["claim", "ticket", "T002375-p1c", "--label", "probe"],
        env={"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_CODE_SESSION_ID": "branchfill-sid"},
        cwd=tmprepo,
    )
    assert r.returncode == 0, f"claim fehlgeschlagen: {r.output}"
    br = _owner_fields(lock_dir / "ticket__T002375-p1c.json", "branch")
    assert br == "probe-branch", f"branch war '{br}', erwartet 'probe-branch'"


def test_t002375_p1_detached_head_leaves_branch_empty_and_claim_still_runs(repo, run_cmd, lock, tmp_path):
    lock_dir = tmp_path / "locks"
    lock_dir.mkdir()
    tmprepo = tmp_path / "repo"
    tmprepo.mkdir()
    run_cmd(["git", "init", "-q", "-b", "probe-branch"], cwd=tmprepo).check()
    run_cmd(
        ["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"],
        cwd=tmprepo,
    ).check()
    run_cmd(["git", "checkout", "-q", "--detach", "HEAD"], cwd=tmprepo).check()

    r = lock.call(
        ["claim", "ticket", "T002375-p1d", "--label", "probe"],
        env={"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_CODE_SESSION_ID": "detached-sid"},
        cwd=tmprepo,
    )
    assert r.returncode == 0, f"claim scheiterte am detached HEAD: {r.output}"
    br = _owner_fields(lock_dir / "ticket__T002375-p1d.json", "branch")
    assert br == "", f"branch war '{br}', erwartet leer"


def test_t002375_p1_reap_keeps_lock_with_dead_pid_and_non_numeric_sid(lock, lock_dir):
    # owner_sid nicht numerisch: der Halter gilt als lebendig, nur die Heartbeat-TTL raeumt ihn ab.
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lock_file = lock_dir / "ticket__T002375-p1d.json"
    lock_file.write_text(
        "{\n"
        '  "scope": "ticket",\n'
        '  "id": "T002375-p1d",\n'
        '  "owner_sid": "harness-nonnumeric-sid",\n'
        '  "owner_pid": 999999,\n'
        '  "label": "probe",\n'
        '  "branch": "",\n'
        '  "worktree": "",\n'
        f'  "created_at": "{now}",\n'
        f'  "heartbeat_at": "{now}"\n'
        "}\n",
        encoding="utf-8",
    )
    lock.call(["reap"], env={"AGENT_LOCK_DIR": str(lock_dir), "CLAUDE_CODE_SESSION_ID": "other-session"})
    assert lock_file.is_file(), "reap hat den Lock einer noch lebenden Fremd-Session abgeraeumt"


def test_t002375_p1_guard_commands_extracted_call_interface_kept(repo, run_cmd, lock, lock_text):
    guards = repo / "scripts" / "agent-lock-guards.sh"
    assert guards.is_file(), "scripts/agent-lock-guards.sh fehlt"
    guards_text = guards.read_text(encoding="utf-8")
    assert "cmd_guard_precommit" in guards_text, "cmd_guard_precommit nicht ausgelagert"
    assert "cmd_guard_postcheckout" in guards_text, "cmd_guard_postcheckout nicht ausgelagert"
    # Dispatch bleibt in agent-lock.sh
    assert _any_line(lock_text.splitlines(), r"guard-precommit"), "Dispatch-Eintrag guard-precommit verschwunden"
    # Externer Aufrufer unangetastet
    assert "agent-lock.sh" in (repo / ".githooks" / "pre-commit").read_text(encoding="utf-8")
    # Die Rümpfe stehen nicht mehr hier.
    assert sum(1 for line in lock_text.splitlines() if line.startswith("cmd_guard_precommit()")) == 0, (
        "cmd_guard_precommit steht noch in agent-lock.sh"
    )
    # S1-Limit wird aus gates.yaml gelesen, nicht wiederholt.
    gates = (repo / "docs" / "code-quality" / "gates.yaml").read_text(encoding="utf-8")
    limit = None
    for line in gates.splitlines():
        m = re.match(r"^[ \t]*\.sh:[ \t]*([0-9]+).*$", line)
        if m:
            limit = m.group(1)
            break
    assert limit is not None and re.fullmatch(r"[0-9]+", limit), f"s1.limits['.sh'] nicht aus gates.yaml lesbar: '{limit}'"
    n = lock_text.count("\n")
    assert n <= int(limit), f"agent-lock.sh hat {n} Zeilen, S1-Limit fuer .sh ist {limit}"


# ── [T002373-M2] cmd_release auto-releases when owner SID is dead ──────


def test_t002373_m2_release_without_force_succeeds_when_owner_sid_is_dead(lock, lock_dir):
    lock_file = lock_dir / "ticket__T002373-m2.json"
    d = {"AGENT_LOCK_DIR": str(lock_dir)}
    # Claim als "ghost-sid-99999"; AGENT_LOCK_FAKE_ALIVE leer -> nicht lebendig.
    lock.call(
        ["claim", "ticket", "T002373-m2", "--label", "test-release-dead"],
        env={**d, "AGENT_LOCK_FAKE_ALIVE": "", "AGENT_LOCK_SID": "ghost-sid-99999"},
    ).check()
    assert lock_file.is_file()

    r = lock.call(
        ["release", "ticket", "T002373-m2"],
        env={**d, "AGENT_LOCK_FAKE_ALIVE": "", "AGENT_LOCK_SID": "session-B"},
    )
    assert r.returncode == 0, f"release should succeed without --force when owner SID is dead: {r.output}"
    assert not lock_file.exists()


def test_t002373_m2_release_without_force_refused_when_owner_sid_alive(lock, lock_dir):
    lock_file = lock_dir / "ticket__T002373-m2b.json"
    d = {"AGENT_LOCK_DIR": str(lock_dir)}
    alive = {**d, "AGENT_LOCK_FAKE_ALIVE": "ghost-sid-99999"}
    lock.call(
        ["claim", "ticket", "T002373-m2b", "--label", "test-release-alive"],
        env={**alive, "AGENT_LOCK_TOOL": "claude", "AGENT_LOCK_SID": "ghost-sid-99999"},
    ).check()
    assert lock_file.is_file()

    # Gleiches Tool genuegt nicht (T002447 hat den Fallback entfernt).
    r = lock.call(
        ["release", "ticket", "T002373-m2b"],
        env={**alive, "AGENT_LOCK_TOOL": "claude", "AGENT_LOCK_SID": "session-C"},
    )
    assert r.returncode == 1, f"release must fail without --force when owner SID is alive: {r.output}"
    assert lock_file.is_file()

    r = lock.call(["release", "ticket", "T002373-m2b", "--force"], env=alive)
    assert r.returncode == 0, f"release with --force must succeed: {r.output}"
    assert not lock_file.exists()
