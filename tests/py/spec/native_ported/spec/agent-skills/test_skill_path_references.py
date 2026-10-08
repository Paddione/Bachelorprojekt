"""Native migration of tests/spec/agent-skills/skill-path-references.bats."""

import json
import os
import re

import pytest

EXCLUDED_SKILLS = [
    "gitops-repo-audit", "gitops-knowledge", "gitops-cluster-debug", "pytest-patterns", "vitest",
    "freetoken-setup", "huggingface-community-evals", "huggingface-llm-trainer",
    "huggingface-paper-publisher", "huggingface-trackio", "huggingface-vision-trainer",
    "train-sentence-transformers", "transformers-js", "playwright-best-practices",
]

# sed -E 's#https?://[^][:space:])"'"'<>`]+##g'  (URLs vorab entfernen, T900835)
URL_RE = re.compile(r"https?://[^\]\s)\"'<>`]+")

# Repo-relative prefixes only: do not reinterpret a suffix of an absolute
# host path as a repository file. Missing relative paths are still checked.
# PATH_PATTERN (ERE, grep -oE)
PATH_RE = re.compile(
    r"(?<![\w./~-])(?:\./)?((components/website)|(plan|scripts|tests|docs|website|k3d|environments|flux))"
    r"/[A-Za-z0-9_./-]+\.(md|bats|sh|ts|tsx|js|json|yaml|yml|py|go|spec\.ts)[A-Za-z0-9_./:-]*"
)

# SKILL_PATH_PATTERN (ERE, grep -oE)
SKILL_RE = re.compile(
    r"(\.claude|\.opencode)/skills/[A-Za-z0-9_./-]+\.(md|bats|sh|ts|tsx|js|json|yaml|yml|py|go|spec\.ts)"
    r"[A-Za-z0-9_./:-]*"
)


@pytest.fixture
def repo(repo_root):
    return repo_root


def skill_files(repo_root):
    """find .opencode/skills .claude/skills -name '*.md' -not -path OVERVIEW.md -not -path */<ex>/*"""
    dirs = [repo_root / ".opencode/skills", repo_root / ".claude/skills"]
    out = []
    for d in dirs:
        if not d.is_dir():
            continue
        for dirpath, _dn, files in os.walk(d):
            for name in files:
                if not name.endswith(".md"):
                    continue
                p = os.path.join(dirpath, name)
                if p.endswith("/OVERVIEW.md"):
                    continue
                if any(f"/{ex}/" in p for ex in EXCLUDED_SKILLS):
                    continue
                out.append(p)
    return out


def extract_paths(path):
    """URLs entfernen, Pfadverweise extrahieren, Anhaenge strippen, sort -u."""
    text = URL_RE.sub("", open(path, encoding="utf-8", errors="replace").read())
    raw = []
    for line in text.splitlines():
        raw.extend(m.group(0).removeprefix("./") for m in PATH_RE.finditer(line))
    for line in text.splitlines():
        raw.extend(m.group(0) for m in SKILL_RE.finditer(line))
    stripped = []
    for item in raw:
        item = re.sub(r":[0-9]+$", "", item)
        item = re.sub(r"REQ-[A-Za-z0-9-]+$", "", item)
        item = re.sub(r"\)$", "", item)
        stripped.append(item)
    return sorted(set(s for s in stripped if s))


def test_alle_repo_relativen_pfadverweise_in_skill_dateien_zeigen_auf_existierende_dateien(repo):
    failures = []
    for f in skill_files(repo):
        for p in extract_paths(f):
            if not os.path.exists(os.path.join(repo, p)):
                failures.append(f"toter Verweis in {f}: {p}")
    assert not failures, "\n".join(failures)


def test_positiv_anker_es_wurden_pfadverweise_geprueft(repo):
    count = 0
    for f in skill_files(repo):
        count += len(extract_paths(f))
    assert count > 0


def test_shim_coverage_claude_skills_shims_verweisen_auf_opencode_skills_ziele(repo):
    claude_skills = repo / ".claude/skills"
    assert claude_skills.is_dir()  # Positiv-Anker
    failures = []
    for shim in claude_skills.rglob("SKILL.md"):
        text = shim.read_text(encoding="utf-8", errors="replace")
        if ".opencode/skills/" not in text:
            continue
        m = re.search(r"\.opencode/skills/[A-Za-z0-9_./-]+", text)
        target = m.group(0) if m else ""
        if target and not os.path.exists(os.path.join(repo, target)):
            failures.append(f"Shim {shim} verweist auf nicht existierendes Ziel {target}")
    assert not failures, "\n".join(failures)


def test_inventory_coverage_every_opencode_skill_is_declared_with_rationalized_harness_exposure(run_cmd, repo):
    r = run_cmd(["node", str(repo / "scripts/agent-skills/project.mjs"), "--root", str(repo), "--check"])
    assert r.returncode in (0, 1)
    registry = (repo / "docs/agent-guide/registry/skills.yaml").read_text(encoding="utf-8").splitlines()
    starts = [i for i, line in enumerate(registry) if line == "  - id: llama-cpp"]
    assert starts, "grep -q '^  - id: llama-cpp$' fand nichts"
    window = []
    for i in starts:
        window.extend(registry[i : i + 13])  # grep -A12: Treffer + 12 Folgezeilen
    assert any('claude_code: "OpenCode-only vendor skill' in line for line in window)


def test_url_pfade_gelten_nicht_als_repo_relative_verweise_t900835(tmp_path):
    f = tmp_path / "skill.md"
    f.write_text(
        'curl -s "https://langfuse.com/docs/observability/overview.md"\n'
        "siehe (http://example.org/scripts/install.sh) und <https://example.org/tests/x.bats>\n"
        "echter Verweis: tests/spec/agent-skills/skill-path-references.bats\n",
        encoding="utf-8",
    )
    result = extract_paths(f)
    # Positiv-Anker: der echte Verweis wird weiterhin extrahiert.
    assert "\n".join(result) == "tests/spec/agent-skills/skill-path-references.bats"


def test_absolute_home_helper_is_not_a_repo_relative_path(tmp_path):
    skill = tmp_path / 'SKILL.md'
    skill.write_text('Use `/home/patrick/scripts/agent-workspace.py`; then run `scripts/local.sh`.')
    assert extract_paths(skill) == ['scripts/local.sh']


def test_missing_repo_relative_reference_remains_visible(tmp_path):
    skill = tmp_path / 'SKILL.md'
    skill.write_text('Use `scripts/missing-helper.py` and `docs/missing-guide.md`.')
    assert extract_paths(skill) == ['docs/missing-guide.md', 'scripts/missing-helper.py']



def test_dot_prefixed_relative_paths_remain_checked(tmp_path):
    skill = tmp_path / 'SKILL.md'
    skill.write_text('Use `./scripts/missing-helper.py` and `./docs/missing-guide.md`.')
    assert extract_paths(skill) == ['docs/missing-guide.md', 'scripts/missing-helper.py']
