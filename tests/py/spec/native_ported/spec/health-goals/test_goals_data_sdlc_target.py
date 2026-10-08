"""Native migration of tests/spec/health-goals/goals-data-sdlc-target.bats."""

import fnmatch

import pytest
import yaml

GOALS_JSON = "components/website/src/lib/sdlc/goals-data.generated.json"


def _push_paths(yaml_load, path):
    data = yaml_load(path)
    on = data.get("on", data.get(True))
    return list(on["push"]["paths"])


def test_build_website_yml_triggert_nicht_auf_claude_lib_goals_md_konsument_ist_sdlc_only(
    repo_root, yaml_load
):
    prod_wf = repo_root / ".github" / "workflows" / "build-website.yml"
    assert prod_wf.is_file(), f"FAIL: {prod_wf} fehlt"
    paths = _push_paths(yaml_load, prod_wf)
    assert "components/website/**" in paths, (
        "build-website.yml triggert nicht mehr auf 'components/website/**' - paths-Liste kaputt"
    )
    assert ".claude/lib/goals.md" not in paths, (
        "build-website.yml triggert auf .claude/lib/goals.md"
    )


def test_build_sdlc_console_yml_deckt_den_goals_data_pfad_ab(repo_root, yaml_load):
    sdlc_wf = repo_root / ".github" / "workflows" / "build-sdlc-console.yml"
    assert sdlc_wf.is_file(), f"FAIL: {sdlc_wf} fehlt"
    assert (repo_root / GOALS_JSON).is_file(), f"FAIL: {GOALS_JSON} existiert nicht"

    paths = _push_paths(yaml_load, sdlc_wf)
    matched = False
    for pattern in paths:
        if not pattern or pattern.startswith("!"):
            continue
        if fnmatch.fnmatchcase(GOALS_JSON, pattern):
            matched = True
            break
    assert matched, (
        f"kein paths-Eintrag in build-sdlc-console.yml deckt {GOALS_JSON} ab. Gefundene paths: "
        + ", ".join(paths)
    )
