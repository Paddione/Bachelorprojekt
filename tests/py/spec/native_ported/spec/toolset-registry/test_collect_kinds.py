"""Native migration of tests/spec/toolset-registry/collect-kinds.bats."""
# [T002592]
# Command output verification [T002448-M4]: runs scripts/toolset/collect.mjs and evaluates its JSON

# output. The grep-style counts are reproduced on the raw stdout lines.

import json

import pytest


@pytest.fixture
def collect(run_cmd, repo_root):
    script = str(repo_root / "scripts" / "toolset" / "collect.mjs")

    def _run(*args):
        return run_cmd(["node", script, *args], cwd=repo_root)

    return _run


def _grep_count(text: str, needle: str) -> int:
    """grep -c <fixed string> on the given text (line-based)."""
    return sum(1 for line in text.splitlines() if needle in line)


def test_collect_ausgabe_ist_wohlgeformtes_json(collect):
    res = collect()
    assert res.returncode == 0
    json.loads(res.stdout)


def test_collect_erfasst_alle_fuenf_instanz_kinds(collect):
    res = collect()
    assert res.returncode == 0
    data = json.loads(res.stdout)
    kinds = ",".join(sorted({i["instance"].split(":")[0] for i in data}))
    for kind in ("mcp", "plugin", "skill", "cli", "agent"):
        assert kind in kinds, f"kinds={kinds}"


def test_collect_plugins_aus_enabledplugins_erscheinen_mit_voller_marketplace_id(collect):
    # The marketplace suffix is part of the id: same-named plugins from different marketplaces differ.
    res = collect()
    assert _grep_count(res.stdout, "plugin:superpowers@claude-plugins-official") >= 1


def test_collect_skills_werden_aus_dem_skill_md_frontmatter_gelesen(collect):
    res = collect()
    assert _grep_count(res.stdout, "skill:toolset-curate") >= 1


def test_collect_overview_md_wird_nicht_als_skill_gezaehlt(collect):
    res = collect()
    # Positive anchor first: skills are collected at all (T002356-M1).
    assert _grep_count(res.stdout, '"skill:') >= 10
    assert _grep_count(res.stdout, "skill:OVERVIEW") == 0


def test_collect_jede_instanz_traegt_ein_curation_feld(collect):
    res = collect()
    assert res.returncode == 0
    data = json.loads(res.stdout)
    missing = [i for i in data if not isinstance(i.get("curation"), str)]
    assert len(missing) == 0, f"total={len(data)} missing={len(missing)}"
    # Positive anchor: instances were collected at all.
    assert len(data) != 0


def test_collect_registrierte_instanz_ist_nicht_unreviewed(collect):
    # cli:gh-axi is canonical in capabilities.yaml. Positive anchor against the trivial
    # implementation that marks everything unreviewed.
    data = json.loads(collect().stdout)
    entry = next((i for i in data if i.get("instance") == "cli:gh-axi"), None)
    assert entry is not None, "NOT_FOUND"
    assert entry.get("curation") == "canonical"


def test_collect_unreviewed_liefert_eine_echte_teilmenge(collect):
    total = len(json.loads(collect().stdout))
    filtered_data = json.loads(collect("--unreviewed").stdout)
    filtered = len(filtered_data)
    wrong = sum(1 for i in filtered_data if i.get("curation") != "unreviewed")
    # Subset, not the full set, and only unreviewed entries.
    assert filtered < total
    assert wrong == 0
