"""Native migration of tests/spec/merge-arbitration/apply-idempotency.bats."""

import json
import os
import subprocess

import pytest

GH_AXI_CREATE = """#!/usr/bin/env bash
case "$1 $2" in
  "pr list") echo '[]' ;;
  "pr create") echo "https://example.invalid/pr/1"; exit 0 ;;
  "pr comment") exit 0 ;;
  *) exit 0 ;;
esac
"""

SYNTH_STUB = """const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const cluster = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const file = cluster.files[0];
  const merged = {};
  merged[file] = 'merged content\\n';
  process.stdout.write(JSON.stringify({
    merged, confidence: 0.95, rationale: 'ok', per_pr_notes: {},
  }));
});
"""


def _sh(args, cwd, env=None, stdin=None):
    full = dict(os.environ)
    full.update(env or {})
    proc = subprocess.run(
        args, cwd=str(cwd), env=full, input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout


def _git(work, *args):
    proc = subprocess.run(["git", *args], cwd=str(work), capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr


def _write_exec(path, body):
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _cluster(key, sha_a, sha_b, sha_c):
    return {
        "cluster_key": key,
        "files": ["file-a.ts"],
        "eligible_prs": [
            {"number": 9001, "head_sha": sha_a, "branch": "pr1", "ticket": "T0001", "title": "fix: pr1"},
            {"number": 9002, "head_sha": sha_b, "branch": "pr2", "ticket": "T0002", "title": "fix: pr2"},
            {"number": 9003, "head_sha": sha_c, "branch": "pr3", "ticket": "T0003", "title": "fix: pr3"},
        ],
        "ineligible_prs": [],
    }


@pytest.fixture
def work(tmp_path):
    repo = tmp_path / "work"
    repo.mkdir()
    _git(repo, "init", "--initial-branch", "main")
    _git(repo, "config", "user.email", "test@test")
    _git(repo, "config", "user.name", "test")
    (repo / "file-a.ts").write_text("base\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    for n in ("1", "2", "3"):
        if n != "1":
            _git(repo, "checkout", "main")
        _git(repo, "checkout", "-b", f"pr{n}")
        (repo / "file-a.ts").write_text(f"change{n}\n", encoding="utf-8")
        _git(repo, "commit", "-am", f"pr{n} change")
    _git(repo, "checkout", "main")
    return repo


def test_t002423_m5_zweiter_lauf_ohne_push_tut_nichts_head_sha_wechsel_arbitriert_erneut(
    tmp_path, repo_root, work
):
    apply_sh = repo_root / "scripts" / "arbitration" / "apply.sh"
    stub = tmp_path / "stub"
    stub.mkdir()
    synth = tmp_path / "synthesize-stub.mjs"
    synth.write_text(SYNTH_STUB, encoding="utf-8")
    base_env = {
        "PATH": f"{stub}{os.pathsep}{os.environ['PATH']}",
        "GH_AXI": "gh-axi",
        "TICKET_SH": "/bin/true",
        "SYNTHESIZE": str(synth),
        "SHARED_STATE": "/dev/null",
    }

    key_v1 = ("1" * 64)[:64]
    cluster_v1 = _cluster(key_v1, "shaA", "shaB", "shaC")

    # Erster Lauf: keine offene Arbitrierung -> APPLIED
    _write_exec(stub / "gh-axi", GH_AXI_CREATE)
    status, output = _sh(["bash", str(apply_sh)], work, base_env, json.dumps(cluster_v1))
    assert status == 0, output
    assert "APPLIED" in output
    _git(work, "checkout", "main", "-q")
    status, _ = _sh(["git", "rev-parse", "--verify", f"chore/merge-arbitration-{key_v1[:12]}"], work)
    assert status == 0

    # Zweiter Lauf, GLEICHER cluster_key: offener arbitration-PR mit diesem Key -> IDEMPOTENT
    _write_exec(stub / "gh-axi", f"""#!/usr/bin/env bash
case "$1 $2" in
  "pr list") echo '[{{"number":9999,"headRefName":"chore/merge-arbitration-{key_v1[:12]}","labels":[{{"name":"arbitration"}}],"title":"merge-arbitration [{key_v1[:12]}]"}}]' ;;
  "pr create") echo "SHOULD NOT BE CALLED"; exit 1 ;;
  *) exit 0 ;;
esac
""")
    status, output = _sh(["bash", str(apply_sh)], work, base_env, json.dumps(cluster_v1))
    assert status == 0, output
    assert "IDEMPOTENT" in output
    assert "APPLIED" not in output

    # Positiv-Anker: nach simuliertem head-SHA-Wechsel aendert sich der cluster_key -> APPLIED
    key_v2 = ("2" * 64)[:64]
    cluster_v2 = _cluster(key_v2, "shaA2", "shaB", "shaC")
    _write_exec(stub / "gh-axi", f"""#!/usr/bin/env bash
case "$1 $2" in
  "pr list") echo '[{{"number":9999,"headRefName":"chore/merge-arbitration-{key_v1[:12]}","labels":[{{"name":"arbitration"}}],"title":"merge-arbitration [{key_v1[:12]}]"}}]' ;;
  "pr create") echo "https://example.invalid/pr/2"; exit 0 ;;
  "pr comment") exit 0 ;;
  *) exit 0 ;;
esac
""")
    status, output = _sh(["bash", str(apply_sh)], work, base_env, json.dumps(cluster_v2))
    assert status == 0, output
    assert "APPLIED" in output
    _git(work, "checkout", "main", "-q")
    status, _ = _sh(["git", "rev-parse", "--verify", f"chore/merge-arbitration-{key_v2[:12]}"], work)
    assert status == 0
