"""Native migration of tests/spec/agent-skills.bats."""
import glob
import os
import re
from pathlib import Path

import pytest
import yaml


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _vendor_skills(repo: Path) -> list:
    text = _read(repo / ".opencode/skills/OVERVIEW.md")
    names = []
    inside = False
    for line in text.splitlines():
        if "<!-- vendor-skills:begin -->" in line:
            inside = True
            continue
        if "<!-- vendor-skills:end -->" in line:
            break
        if inside:
            m = re.match(r"^\| `([a-z0-9/-]+)`", line)
            if m:
                names.append(m.group(1))
    return names


def _project_owned_skills(run_cmd, repo: Path) -> list:
    vendor = set(_vendor_skills(repo))
    listed = run_cmd(["git", "ls-files", "--", ".opencode/skills"], cwd=repo, timeout=300)
    listed.check()
    owned = []
    for f in listed.stdout.splitlines():
        if not f.endswith("/SKILL.md"):
            continue
        d = f[len(".opencode/skills/"):] if f.startswith(".opencode/skills/") else f
        d = d[: -len("/SKILL.md")]
        if d not in vendor:
            owned.append(d)
    return owned


def _frontmatter_lines(text: str) -> list:
    """Lines between the first and second '---' markers (awk n==1 region)."""
    out, n = [], 0
    for line in text.splitlines():
        if line == "---":
            n += 1
            continue
        if n == 1:
            out.append(line)
    return out


def test_dev_flow_chore_skill_md_exists(repo_root):
    assert (repo_root / ".claude/skills/dev-flow-chore/SKILL.md").is_file()


def test_dev_flow_chore_step_4_has_secret_in_index_guard_for_git_crypt_artifacts(repo_root):
    text = _read(repo_root / ".claude/skills/dev-flow-chore/SKILL.md")
    assert re.search(r"Secret-in-index-Guard|secret.*index.*guard|git-crypt", text)


def test_dev_flow_chore_skill_refuses_bare_git_add_a_mentions_git_crypt(repo_root):
    text = _read(repo_root / ".claude/skills/dev-flow-chore/SKILL.md")
    assert re.search(r"git.add.*-A|git add -A|git-crypt", text, re.IGNORECASE)


def test_ticket_ops_skill_md_exists(repo_root):
    assert (repo_root / ".claude/skills/ticket-ops/SKILL.md").is_file()


def test_ticket_ops_skill_mentions_dedup_or_duplicate_check(repo_root):
    text = _read(repo_root / ".claude/skills/ticket-ops/SKILL.md")
    assert re.search(r"dedup|duplicate|same.*title|vorhanden.*Ticket", text, re.IGNORECASE)


def test_agent_push_sh_exists_and_is_executable(repo_root):
    script = repo_root / "scripts/agent-push.sh"
    assert script.is_file()
    assert os.access(script, os.X_OK)


def test_agent_push_sh_constructs_ntfy_topic_from_bachelorprojekt_source(repo_root):
    assert "bachelorprojekt-" in _read(repo_root / "scripts/agent-push.sh")


def test_overview_md_vendor_marker_block_exists_and_is_non_empty(repo_root):
    assert _vendor_skills(repo_root)


def test_every_vendor_skill_named_in_overview_md_has_a_directory(repo_root):
    for d in _vendor_skills(repo_root):
        assert (repo_root / ".opencode/skills" / d).is_dir(), f"vendor skill without directory: {d}"


def test_every_active_project_owned_skill_has_a_description_in_its_frontmatter(run_cmd, repo_root):
    for d in _project_owned_skills(run_cmd, repo_root):
        f = repo_root / ".opencode/skills" / d / "SKILL.md"
        if not f.is_file():
            pytest.fail(f"no description: {d}")
        fm = _frontmatter_lines(_read(f))
        # archived: true is the deliberate exception (mirrors G-AGENTIC07).
        if any(re.match(r"^archived:\s*true", line) for line in fm):
            continue
        if not any(line.startswith("description:") for line in fm):
            pytest.fail(f"no description: {d}")


def test_no_project_owned_skill_md_exceeds_the_g_agentic09_limit(run_cmd, repo_root):
    lines = _read(repo_root / "scripts/health-goals-check.sh").splitlines()
    block, in_block = [], False
    for line in lines:
        if not in_block and line.startswith("row gate G-AGENTIC09 "):
            in_block = True
        if in_block:
            block.append(line)
            if line.startswith(')"'):
                break
    limit = ""
    for line in block:
        m = re.search(r'.*SKILL\.md"\)" -gt ([0-9]+).*', line)
        if m:
            limit = m.group(1)
            break
    assert re.fullmatch(r"[0-9]+", limit), f"G-AGENTIC09-Schwelle nicht lesbar: '{limit}'"
    limit_n = int(limit)
    for d in _project_owned_skills(run_cmd, repo_root):
        n = _read(repo_root / ".opencode/skills" / d / "SKILL.md").count("\n")
        assert n <= limit_n, f"{d} has {n} lines (limit {limit})"


def test_every_skill_frontmatter_parses_as_yaml_and_declares_a_name(repo_root):
    bad = []
    for pat in (".claude/skills/*/SKILL.md", ".claude/skills/*/*/SKILL.md"):
        for f in glob.glob(str(repo_root / pat)):
            txt = _read(Path(f))
            if not txt.startswith("---"):
                bad.append(f + " (no frontmatter)")
                continue
            try:
                d = yaml.safe_load(txt.split("---", 2)[1])
                if not isinstance(d, dict) or "name" not in d:
                    bad.append(f + " (no name)")
            except Exception as e:  # noqa: BLE001
                bad.append(f"{f} ({e.__class__.__name__})")
    assert not bad, "\n".join(bad)


def test_overview_md_links_only_to_skill_md_files_that_exist(repo_root):
    text = _read(repo_root / ".claude/skills/OVERVIEW.md")
    links = sorted(set(re.findall(r"\]\(([a-z0-9/-]+/SKILL\.md)\)", text)))
    for p in links:
        assert (repo_root / ".claude/skills" / p).is_file(), f"dead link: {p}"


def test_overview_md_does_not_link_into_the_docs_container_build_output(repo_root):
    text = _read(repo_root / ".claude/skills/OVERVIEW.md")
    assert sum(1 for line in text.splitlines() if "docs-content-built" in line) == 0


def test_t002305_no_root_instruction_file_mentions_keycloak(repo_root):
    fail = []
    for name in ("CLAUDE.md", "AGENTS.md", "GEMINI.md"):
        path = repo_root / name
        if not path.is_file():
            continue
        hits = [line for line in _read(path).splitlines() if "keycloak" in line.lower()]
        if hits:
            fail.append(f"{name} nennt Keycloak:\n" + "\n".join(hits))
    assert not fail, "\n".join(fail)


def test_t002305_gemini_md_stays_a_pointer_not_an_architecture_mirror(repo_root):
    f = repo_root / "GEMINI.md"
    assert f.is_file()
    text = _read(f)
    lines = text.count("\n")
    if lines > 40:
        print(f"# ADVISORY: GEMINI.md hat {lines} Zeilen (advisory target: <= 40)")
    tasks = [
        t for t in re.findall(r"task [a-z][a-z0-9-]*:[a-z0-9:-]*", text)
        if not re.fullmatch(r"task mcp:(sync|check)", t)
    ]
    assert not tasks, "unerlaubte task-Literale in GEMINI.md:\n" + "\n".join(tasks)
    services = re.findall(r"Nextcloud|Vaultwarden|Collabora|DocuSeal|Janus|coturn|Traefik|LiveKit", text)
    assert not services, f"GEMINI.md spiegelt wieder Services: {services}"


def _registry_keys(repo: Path, section: str) -> list:
    data = yaml.safe_load(_read(repo / "docs/agent-guide/registry/agents.yaml")) or {}
    return list((data.get(section) or {}).keys())


def test_t002305_claude_md_and_agents_md_name_exactly_the_registry_roles(repo_root):
    roles = _registry_keys(repo_root, "roles")
    assert roles
    fail = []
    for f in ("CLAUDE.md", "AGENTS.md"):
        text = _read(repo_root / f)
        for r in roles:
            if r not in text:
                fail.append(f"{f} nennt Registry-Rolle nicht: {r}")
        for r in sorted(set(re.findall(r"bachelorprojekt-[a-z]+", text))):
            if r not in roles:
                fail.append(f"{f} nennt unbekannte Rolle: {r}")
    assert not fail, "\n".join(fail)


def test_t002305_registry_runtimes_md_covers_every_registry_runtime_t900560_c1b(repo_root):
    runtimes = _registry_keys(repo_root, "runtimes")
    assert runtimes
    rows = re.findall(r"^\| `([a-z0-9-]+)`", _read(repo_root / "docs/agent-guide/registry/runtimes.md"), re.MULTILINE)
    missing = [r for r in runtimes if r not in rows]
    assert not missing, "\n".join(f"runtimes.md Runtime-Tabelle fehlt: {r}" for r in missing)
