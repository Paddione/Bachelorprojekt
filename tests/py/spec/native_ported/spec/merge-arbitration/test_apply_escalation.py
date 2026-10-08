"""Native migration of tests/spec/merge-arbitration/apply-escalation.bats."""

import json
import os
import subprocess

import pytest

GH_AXI_DEFAULT = """#!/usr/bin/env bash
case "$1 $2" in
  "pr list") echo '[]' ;;
  "pr create") echo "https://example.invalid/pr/1"; exit 0 ;;
  "pr comment") exit 0 ;;
  *) exit 0 ;;
esac
"""

TICKET_STUB = "#!/usr/bin/env bash\nexit 0\n"

SYNTH_STUB = """const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const cluster = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const file = cluster.files[0];
  const merged = {};
  merged[file] = file.endsWith('.yaml') ? 'merged: true\\n' : 'merged content\\n';
  process.stdout.write(JSON.stringify({
    merged,
    confidence: 0.99,
    rationale: 'synthetisierte Testversion',
    per_pr_notes: {},
  }));
});
"""


def _sh(args, cwd, env=None, stdin=None):
    """bats run equivalent: stdout and stderr merged, stdout exit status."""
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
    return proc.stdout


def _write_exec(path, body):
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _cluster_for(file, num_a, num_b, num_c):
    return {
        "cluster_key": f"k{num_a}{num_b}{num_c}" + "0" * 60,
        "files": [file],
        "eligible_prs": [
            {"number": num_a, "head_sha": "sha1", "branch": "pr1", "ticket": "T0001", "title": "fix: pr1"},
            {"number": num_b, "head_sha": "sha2", "branch": "pr2", "ticket": "T0002", "title": "fix: pr2"},
            {"number": num_c, "head_sha": "sha3", "branch": "pr3", "ticket": "T0003", "title": "fix: pr3"},
        ],
        "ineligible_prs": [],
    }


@pytest.fixture
def work(tmp_path):
    """Mirrors setup(): git repo with base commit, branches pr1..pr3 and shared-state list."""
    repo = tmp_path / "work"
    repo.mkdir()
    _git(repo, "init", "--initial-branch", "main")
    _git(repo, "config", "user.email", "test@test")
    _git(repo, "config", "user.name", "test")
    (repo / "components" / "website" / "src" / "lib").mkdir(parents=True)
    (repo / "scripts" / "arbitration").mkdir(parents=True)
    (repo / "k3d").mkdir()
    (repo / "components" / "website" / "src" / "lib" / "x.ts").write_text("base\n", encoding="utf-8")
    (repo / "k3d" / "foo.yaml").write_text("base: true\n", encoding="utf-8")
    (repo / "scripts" / "arbitration" / "shared-state-paths.txt").write_text("k3d/\nprod\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    for branch in ("pr1", "pr2", "pr3"):
        if branch != "pr1":
            _git(repo, "checkout", "main")
        _git(repo, "checkout", "-b", branch)
        n = branch[-1]
        (repo / "components" / "website" / "src" / "lib" / "x.ts").write_text(f"change{n}\n", encoding="utf-8")
        (repo / "k3d" / "foo.yaml").write_text(f"change{n}: true\n", encoding="utf-8")
        _git(repo, "commit", "-am", f"pr{n} change")
    _git(repo, "checkout", "main")
    return repo


def test_t002423_m4_k3d_pfad_eskaliert_bei_confidence_0_99_positiv_anker_website_pfad_oeffnet_pr(
    tmp_path, repo_root, work
):
    apply_sh = repo_root / "scripts" / "arbitration" / "apply.sh"
    stub = tmp_path / "stub"
    stub.mkdir()
    _write_exec(stub / "gh-axi", GH_AXI_DEFAULT)
    _write_exec(stub / "ticket-sh-stub", TICKET_STUB)
    synth = tmp_path / "synthesize-stub.mjs"
    synth.write_text(SYNTH_STUB, encoding="utf-8")
    env = {
        "PATH": f"{stub}{os.pathsep}{os.environ['PATH']}",
        "GH_AXI": "gh-axi",
        "TICKET_SH": str(stub / "ticket-sh-stub"),
        "SYNTHESIZE": str(synth),
        "SHARED_STATE": str(work / "scripts" / "arbitration" / "shared-state-paths.txt"),
    }

    # Fall 1: Risiko-Pfad k3d/foo.yaml -> Eskalation trotz confidence 0.99
    cluster_k3d = _cluster_for("k3d/foo.yaml", 101, 102, 103)
    status, output = _sh(["bash", str(apply_sh)], work, env, json.dumps(cluster_k3d))
    assert status == 0, output
    assert "ESCALATE" in output
    assert "risk_path" in output
    assert "APPLIED" not in output
    key_k3d = cluster_k3d["cluster_key"]
    status, _ = _sh(["git", "rev-parse", "--verify", f"chore/merge-arbitration-{key_k3d[:12]}"], work)
    assert status != 0

    # Positiv-Anker: components/website/src/lib/x.ts ist NICHT auf der Risiko-Liste -> PR
    cluster_web = _cluster_for("components/website/src/lib/x.ts", 201, 202, 203)
    status, output = _sh(["bash", str(apply_sh)], work, env, json.dumps(cluster_web))
    assert status == 0, output
    assert "APPLIED" in output
    assert "ESCALATE" not in output
    _git(work, "checkout", "main", "-q")
    key_web = cluster_web["cluster_key"]
    status, _ = _sh(["git", "rev-parse", "--verify", f"chore/merge-arbitration-{key_web[:12]}"], work)
    assert status == 0
