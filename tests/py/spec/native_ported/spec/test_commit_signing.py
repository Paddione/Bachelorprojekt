"""Native migration of tests/spec/commit-signing.bats."""

import re

import pytest

# Match both noreply email variants used by github-actions[bot] across workflows:
# the canonical "<id>+github-actions[bot]@..." form and the bare form some
# workflows configure via `git config user.email`. grep -F substring-matches,
# so the bare suffix below matches both.
BOT_EMAIL = "github-actions[bot]@users.noreply.github.com"


def test_g_sec05_adjusted_unsigned_anteil_auf_main_ohne_bot_ist_le_5_prozent(
        run_cmd, repo_root):
    # T001575: %G? is environment dependent -- without gpg/matching keys git
    # reports 'N' instead of 'E' for signed commits and the guard fails falsely
    # in CI. "Unsigned" means: the commit object header carries NO gpgsig, which
    # we check directly via git cat-file -- deterministic, independent of the
    # keyring/gpg on the runner.
    log = run_cmd(["git", "-C", str(repo_root), "log", "-50", "--pretty=%H %ae",
                   "origin/main"])
    unsigned = 0
    total = 0
    for line in log.stdout.splitlines():
        if not line.strip():
            continue
        sha, _, ae = line.partition(" ")
        if BOT_EMAIL in ae:
            continue
        total += 1
        cat = run_cmd(["git", "-C", str(repo_root), "cat-file", "commit", sha])
        if not re.search(r"^gpgsig", cat.stdout, re.M):
            unsigned += 1
    if total == 0:
        pytest.skip("keine non-bot Commits in den letzten 50 gefunden")
    # Ceiling division: (total * 5 + 99) / 100 so that e.g. 26 non-bot commits
    # gives ceil(1.3)=2 instead of floor(1.3)=1, avoiding false failures when
    # the window is small and only 1-2 non-signing incidents exist.
    threshold = (total * 5 + 99) // 100
    assert unsigned <= threshold, (unsigned, threshold, total)


def test_g_sec05_health_goals_check_sh_verwendet_adjusted_metric_kein_raw_grep_c_n(
        run_cmd, repo_root):
    # `run grep "G-SEC05" <script>` -> status 0 requires at least one matching line.
    script = repo_root / "scripts/health-goals-check.sh"
    matches = [ln for ln in script.read_text().splitlines() if re.search("G-SEC05", ln)]
    assert matches, "grep G-SEC05 found no line"
    output = "\n".join(matches)
    assert ("github-actions" in output) or ("%ae" in output) or ("sec05_unsigned" in output)


def test_t900652_g_sec05_messung_terminiert_bei_defektem_gpg_kein_g_hang(
        run_cmd, repo_root, tmp_path):
    # %G? calls gpg per commit -- with a defective gpg (pinentry without TTY)
    # the measurement hung forever and poisoned every --only run via eager eval.
    # The measurement must be gpg-free (gpgsig header via cat-file, prior art
    # T001575 in this file): terminate even with a hanging gpg stub.
    stub = tmp_path / "gpg-hang-stub"
    stub.write_text("#!/bin/sh\nsleep 300\n")
    stub.chmod(0o755)
    result = run_cmd(
        ["timeout", "90", "env", "GIT_CONFIG_COUNT=1", "GIT_CONFIG_KEY_0=gpg.program",
         f"GIT_CONFIG_VALUE_0={stub}",
         "bash", str(repo_root / "scripts/health-goals-check.sh"), "--only=G-SEC05"],
        timeout=200,
    )
    assert result.returncode == 0
    assert "G-SEC05" in result.output
