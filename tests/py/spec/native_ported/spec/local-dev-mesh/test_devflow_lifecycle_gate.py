"""Lifecycle-Gate + Sandbox-Claim: gestagte Plaene erhalten Sandbox, Worktree,
Branch und laufen bis PR/Merge/Cleanup/Deploy/E2E — fail-closed pruefbar."""

import json
import os
import subprocess
from pathlib import Path

import pytest

KUBECTL_STUB = """#!/usr/bin/env bash
# Minimaler kubectl-Stub: Pods aus $KUBECTL_STATE (Zeilen: name|phase|claim).
state="${KUBECTL_STATE:?}"
touch "$state"
op=""
fmt=""
pod=""
newclaim="__keep__"
for a in "$@"; do
  case "$a" in
    get) op=get ;;
    annotate) op=annotate ;;
    -o) want_o=1 ;;
    -o*) fmt="$a" ;;
    *) if [ "${want_o:-}" = 1 ]; then fmt="$a"; want_o=""; else
         case "$a" in pods|pod|-n|-l|app=sandbox-cpu|workspace|--overwrite) : ;;
           sandbox/claimed-by=*) newclaim="${a#*=}" ;;
           sandbox/claimed-by-) newclaim="" ;;
           *) pod="$a" ;; esac; fi ;;
  esac
done
if [ "$op" = get ]; then
  case "$fmt" in
    name) awk -F'|' '{print "pod/"$1}' "$state" ;;
    *) awk -F'|' '{c=$3; print $1" "$2" "c}' "$state" ;;
  esac
  exit 0
fi
if [ "$op" = annotate ]; then
  awk -F'|' -v p="$pod" -v c="$newclaim" 'BEGIN{OFS="|"} $1==p{$3=c} {print}' "$state" > "$state.tmp" \
    && mv "$state.tmp" "$state"
  echo "pod/$pod annotated"
  exit 0
fi
echo "kubectl-Stub: unerwarteter Aufruf: $*" >&2; exit 99
"""

GH_STUB = """#!/usr/bin/env bash
# gh-Stub: antwortet auf `pr view <branch> --json state --jq .state` mit $GH_PR_STATE.
for a in "$@"; do
  case "$a" in view) want=1 ;; esac
done
if [ "${want:-}" = 1 ] && [ -n "${GH_PR_STATE:-}" ]; then printf '%s\\n' "$GH_PR_STATE"; exit 0; fi
echo "gh-Stub: kein PR / unerwarteter Aufruf: $*" >&2; exit 1
"""

TASKS_MD = """---
title: Demo
domains:
  - llm
status: staged
---

# demo — Implementation Plan

## File Structure

- `a.py` (neu, P1)
- `b.py` (neu, P2)
- `tests/test_demo.py` (neu, P3)

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-x.md | worker | a.py | - |
| p2 | tasks.d/p2-y.md | worker | b.py | p1 |
| p3 | tasks.d/p3-tests.md | tests | tests/test_demo.py | p2 |

## Tasks

- [ ] P1 umsetzen
- [ ] P2 umsetzen
- [ ] P3 Tests schreiben und pruefen
- [ ] Verify: task test:changed; task freshness:regenerate; task freshness:check
"""

P3_MD = """# p3

Run pytest for the new tests, expected FAIL on first run (red phase).

pytest tests/test_demo.py -x
"""

EVENTS = "plan done 2026-10-20T10:00:00Z\nimplement entered 2026-10-20T11:00:00Z\nverify done 2026-10-20T12:00:00Z\ndeploy done 2026-10-20T13:00:00Z\n"


@pytest.fixture
def fx(tmp_path, monkeypatch, repo_root):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "kubectl").write_text(KUBECTL_STUB)
    (bin_dir / "gh").write_text(GH_STUB)
    for n in ("kubectl", "gh"):
        (bin_dir / n).chmod(0o755)
    state = tmp_path / "pods.state"
    state.write_text("sandbox-0|Running|\nsandbox-1|Running|\n")
    monkeypatch.setenv("KUBECTL_STATE", str(state))
    monkeypatch.delenv("GH_PR_STATE", raising=False)

    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "--bare", "-q", str(origin)], check=True)
    repo = tmp_path / "repo"
    subprocess.run(["git", "clone", "-q", str(origin), str(repo)], check=True)
    for k, v in (("user.email", "t@t.t"), ("user.name", "t"), ("init.defaultBranch", "main"),
                 ("commit.gpgsign", "false")):
        subprocess.run(["git", "-C", str(repo), "config", k, v], check=True)
    (repo / "README.md").write_text("x\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "init"], check=True)
    subprocess.run(["git", "-C", str(repo), "push", "-q", "origin", "HEAD:main"], check=True)
    scripts = Path(str(repo_root)) / "scripts"
    return {"repo": repo, "origin": origin, "bin": bin_dir, "state": state,
            "scripts": scripts}


def _env(fx, extra=None):
    env = {"PATH": f"{fx['bin']}:{os.environ.get('PATH', '')}"}
    if extra:
        env.update(extra)
    return env


def _stage(fx, slug="demo", branch="feature/demo", state_json=None, events="",
           frontmatter="staged", checkboxes=("[ ]", "[ ]", "[ ]", "[ ]")):
    repo = fx["repo"]
    subprocess.run(["git", "-C", str(repo), "checkout", "-qb", branch], check=True)
    plan = repo / ".agents" / "plans" / slug
    (plan / "tasks.d").mkdir(parents=True)
    (plan / "tasks.d" / "p1-x.md").write_text("# p1\n")
    (plan / "tasks.d" / "p2-y.md").write_text("# p2\n")
    (plan / "tasks.d" / "p3-tests.md").write_text(P3_MD)
    body = TASKS_MD.replace("status: staged", f"status: {frontmatter}")
    # Checkboxen gezielt setzen (Tasks-Block, nicht Tabelle)
    lines = body.split("\n")
    bi = 0
    for j, ln in enumerate(lines):
        if ln.startswith("- [ ]") and bi < len(checkboxes):
            lines[j] = f"- [{checkboxes[bi]}]" + ln[5:]
            bi += 1
    (plan / "tasks.md").write_text("\n".join(lines))
    (plan / "phase-events.log").write_text(events)
    if state_json is not None:
        d = plan / ".plan-runner"
        d.mkdir(exist_ok=True)
        (d / "state.json").write_text(json.dumps(state_json))
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", f"stage {slug}"], check=True)
    subprocess.run(["git", "-C", str(repo), "push", "-qu", "origin", branch], check=True)
    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"], check=True)
    return plan


def _gate(fx, run_cmd, slug, extra_env=None):
    return run_cmd(["bash", str(fx["scripts"] / "devflow-lifecycle-gate.sh"), slug],
                   cwd=str(fx["repo"]), env=_env(fx, extra_env))


def _link_scripts(fx, worktree):
    link = Path(worktree) / "scripts"
    if not link.exists():
        link.symlink_to(fx["scripts"], target_is_directory=True)


def test_unbekannter_slug_stoppt_bei_staged(fx, run_cmd):
    res = _gate(fx, run_cmd, "demo")
    assert res.returncode == 1, res.output
    assert "LIFECYCLE demo: staged" in res.output


def test_gestagter_plan_ohne_worktree_stoppt_bei_worktree(fx, run_cmd):
    _stage(fx)
    res = _gate(fx, run_cmd, "demo")
    assert res.returncode == 1, res.output
    assert "LIFECYCLE demo: worktree" in res.output


def test_sandbox_claim_und_gate_stufe(fx, run_cmd):
    plan = _stage(fx)
    wt = plan.parents[2] / "wt-demo"
    subprocess.run(["git", "-C", str(fx["repo"]), "worktree", "add", str(wt), "feature/demo"],
                    check=True)
    _link_scripts(fx, wt)
    res = _gate(fx, run_cmd, "demo")
    assert res.returncode == 1, res.output
    assert "LIFECYCLE demo: sandbox" in res.output
    claim = run_cmd(["bash", str(fx["scripts"] / "devflow-sandbox.sh"), "claim", "demo"],
                    cwd=str(fx["repo"]), env=_env(fx))
    assert claim.returncode == 0, claim.output
    assert "sandbox-0" in claim.output
    res2 = _gate(fx, run_cmd, "demo")
    assert "LIFECYCLE demo: partials" in res2.output, res2.output
    rel = run_cmd(["bash", str(fx["scripts"] / "devflow-sandbox.sh"), "release", "demo"],
                  cwd=str(fx["repo"]), env=_env(fx))
    assert rel.returncode == 0, rel.output
    assert "sandbox-0" not in fx["state"].read_text().replace("sandbox-0|Running|", "X")


def test_reihenfolge_verletzt_stoppt_bei_partials(fx, run_cmd):
    plan = _stage(fx, state_json={
        "p1": {"status": "pending"}, "p2": {"status": "done", "result": "ok"},
        "p3": {"status": "pending"}})
    wt = plan.parents[2] / "wt-demo"
    subprocess.run(["git", "-C", str(fx["repo"]), "worktree", "add", str(wt), "feature/demo"],
                    check=True)
    _link_scripts(fx, wt)
    run_cmd(["bash", str(fx["scripts"] / "devflow-sandbox.sh"), "claim", "demo"],
            cwd=str(fx["repo"]), env=_env(fx))
    res = _gate(fx, run_cmd, "demo")
    assert res.returncode == 1, res.output
    assert "LIFECYCLE demo: partials" in res.output
    assert "reihenfolge" in res.output or "p2" in res.output


def test_komplett_nach_merge_cleanup_deploy_e2e(fx, run_cmd):
    plan = _stage(
        fx,
        state_json={"p1": {"status": "done", "result": "ok"},
                    "p2": {"status": "done", "result": "ok"},
                    "p3": {"status": "done", "result": "ok"}},
        events=EVENTS, frontmatter="completed",
        checkboxes=("x", "x", "x", "x"))
    repo = fx["repo"]
    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "feature/demo"], check=True)
    (plan / "e2e-report.md").write_text("E2E: PASS 2026-10-20\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "complete demo"], check=True)
    subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"], check=True)
    subprocess.run(["git", "-C", str(repo), "merge", "-q", "--no-ff", "feature/demo",
                    "-m", "merge demo"], check=True)
    subprocess.run(["git", "-C", str(repo), "push", "-q", "origin", "main"], check=True)
    subprocess.run(["git", "-C", str(repo), "branch", "-qD", "feature/demo"], check=True)
    subprocess.run(["git", "-C", str(repo), "push", "-q", "origin", ":feature/demo"], check=True)
    res = _gate(fx, run_cmd, "demo", extra_env={"GH_PR_STATE": "MERGED"})
    assert res.returncode == 0, res.output
    assert "LIFECYCLE demo: COMPLETE" in res.output
