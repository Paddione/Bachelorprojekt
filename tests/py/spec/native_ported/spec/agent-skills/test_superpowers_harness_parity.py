"""Native migration of tests/spec/agent-skills/superpowers-harness-parity.bats."""

import json
import os
import re
import shutil

import pytest

PLUGIN_SKILLS = {
    "brainstorming", "dispatching-parallel-agents", "executing-plans",
    "finishing-a-development-branch", "receiving-code-review", "requesting-code-review",
    "subagent-driven-development", "systematic-debugging", "test-driven-development",
    "using-git-worktrees", "using-superpowers", "verification-before-completion",
    "writing-plans", "writing-skills",
}


def _opencode_text(repo):
    oc = (repo / ".opencode/opencode.jsonc").read_text(encoding="utf-8")
    return re.sub(r"^\s*//.*$", "", oc, flags=re.M)


def test_t900056_superpowers_ist_in_beiden_harnesses_deklariert(repo_root):
    missing = []
    enabled = json.loads((repo_root / ".claude/settings.json").read_text(encoding="utf-8")).get("enabledPlugins", {})
    if not any(k.split("@", 1)[0] == "superpowers" and v is True for k, v in enabled.items()):
        missing.append("Claude Code: kein aktivierter superpowers-Eintrag in enabledPlugins")
    if "obra/superpowers" not in _opencode_text(repo_root):
        missing.append("opencode: superpowers fehlt im plugin-Array von .opencode/opencode.jsonc")
    assert not missing, "NOT_DECLARED: " + "; ".join(missing)


def test_t900056_es_gibt_einen_ausfuehrbaren_weg_vom_doctor_befund_zur_installation(run_cmd, repo_root):
    task = shutil.which("task")
    if task is None:
        pytest.fail("task --list-all fehlgeschlagen: task nicht installiert")
    r = run_cmd([task, "--list-all"], cwd=repo_root)
    assert r.returncode == 0, f"task --list-all fehlgeschlagen:\n{r.stdout}"
    assert "plugins:sync" in r.stdout, "kein plugins:sync-Target in der Taskfile-Liste"


def test_t900056_plugin_doctor_nennt_bei_jedem_befund_die_behebung(run_cmd, repo_root, tmp_path):
    fix = tmp_path / "fix"
    (fix / "claude-home/plugins").mkdir(parents=True)
    (fix / "repo-settings.json").write_text(
        '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n', encoding="utf-8"
    )
    (fix / "claude-home/settings.json").write_text(
        '{"enabledPlugins": {"zeta-fixture-plugin@fixture-market": true}}\n', encoding="utf-8"
    )
    (fix / "claude-home/plugins/installed_plugins.json").write_text(
        '{"version": 2, "plugins": {}}\n', encoding="utf-8"
    )
    r = run_cmd(
        ["bash", str(repo_root / "scripts/plugin-doctor.sh")],
        env={
            "PLUGIN_DOCTOR_CLAUDE_HOME": str(fix / "claude-home"),
            "PLUGIN_DOCTOR_REPO_SETTINGS": str(fix / "repo-settings.json"),
        },
    )
    assert r.returncode == 1, f"erwartet Exit 1 (Befund), war {r.returncode}:\n{r.output}"
    assert "plugins:sync" in r.output, f"Befund nennt keine ausfuehrbare Behebung:\n{r.output}"


def test_t900056_opencode_sperrt_die_disziplin_skills_nicht_die_references(repo_root):
    oc = _opencode_text(repo_root)
    block = re.search(r'"skill"\s*:\s*\{(.*?)\n\s*\}', oc, re.S)
    assert block, "ANCHOR_FAIL: kein skill-Block in opencode.jsonc"
    entries = dict(re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', block.group(1)))
    assert entries, "ANCHOR_FAIL: skill-Block ohne Eintraege"

    problems = []
    for name in ("writing-plans", "executing-plans"):
        if entries.get(name) != "deny":
            problems.append(name + " ist nicht auf deny")
    if entries.get("references") == "deny":
        problems.append("references steht auf deny und sperrt den dev-flow-Kern")
    assert not problems, "CURATION: " + "; ".join(problems)


def test_t900056_kein_skill_beschreibt_einen_plugin_skill_als_harness_builtin(repo_root):
    hits = []
    for root, _dirs, files in os.walk(repo_root / ".claude/skills", followlinks=True):
        for f in files:
            if not f.endswith(".md"):
                continue
            p = os.path.join(root, f)
            with open(p, encoding="utf-8", errors="replace") as fh:
                for n, line in enumerate(fh, 1):
                    if "superpowers:" in line and re.search(r"built-?in", line, re.I):
                        rel = os.path.relpath(p, repo_root).replace(os.sep, "/")
                        hits.append(f"{rel}:{n}")
    assert not hits, "BUILTIN_CLAIM: " + " ".join(hits)


def test_t900056_kein_projektlokaler_skill_kollidiert_mit_einem_superpowers_skillnamen(repo_root):
    collisions = []
    seen = 0
    for root, _dirs, files in os.walk(repo_root / ".claude/skills", followlinks=True):
        if "SKILL.md" not in files:
            continue
        p = os.path.join(root, "SKILL.md")
        with open(p, encoding="utf-8", errors="replace") as fh:
            head = fh.read(2000)
        m = re.search(r"^name:\s*(.+)$", head, re.M)
        if not m:
            continue
        seen += 1
        name = m.group(1).strip().strip("'\"")
        if name.split(":")[-1] in PLUGIN_SKILLS:
            collisions.append(os.path.relpath(p, repo_root).replace(os.sep, "/") + " (name: " + name + ")")
    assert seen, "ANCHOR_FAIL: keine SKILL.md mit name-Frontmatter gefunden"
    assert not collisions, "COLLISION: " + "; ".join(sorted(collisions))
