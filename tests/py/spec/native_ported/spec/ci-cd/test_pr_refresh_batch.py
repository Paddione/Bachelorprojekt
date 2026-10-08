"""Native migration of tests/spec/ci-cd/pr-refresh-batch.bats."""

import json
import re
import stat
from pathlib import Path

import pytest

GH_STUB = """#!/usr/bin/env bash
# Aufrufform: gh pr view <num> --json ...
num="$3"
f="${GH_FIXTURE_DIR:?GH_FIXTURE_DIR not set}/${num}.json"
[ -f "$f" ] || { printf 'gh-stub: keine Fixture fuer PR %s\\n' "$num" >&2; exit 1; }
cat "$f"
"""


def _lines_re(text: str, pattern: str) -> bool:
    return any(re.search(pattern, ln) for ln in text.splitlines())


@pytest.fixture
def ctx(repo_root, tmp_path):
    stub_dir = tmp_path / "stub"
    stub_dir.mkdir()
    gh = stub_dir / "gh-stub.sh"
    gh.write_text(GH_STUB)
    gh.chmod(gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    push_log = tmp_path / "push.log"
    push_log.write_text("")
    env = {
        "GH_FIXTURE_DIR": str(fixtures),
        "PR_REFRESH_GH_CMD": str(gh),
        "PR_REFRESH_PUSH_LOG": str(push_log),
        "PR_REFRESH_DRY_PUSH": "1",
        "PR_REFRESH_ME": "Paddione",
    }
    return {
        "repo": repo_root,
        "script": repo_root / "scripts/pr-refresh.sh",
        "fixtures": fixtures,
        "push_log": push_log,
        "env": env,
    }


def _pr(c, num, mergeable, author):
    (c["fixtures"] / f"{num}.json").write_text(json.dumps({
        "number": int(num),
        "mergeable": mergeable,
        "headRefName": f"feature/pr-{num}",
        "author": {"login": author},
    }))


def _run(run_cmd, c, *args):
    # BATS `run` merges stderr in emission order.
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(c["script"]), *args],
                   cwd=c["repo"], env=c["env"])


def test_t002417_eine_ablehnung_beendet_den_sammellauf_nicht_folgende_prs_werden_verarbeitet(run_cmd, ctx):
    _pr(ctx, 2, "CONFLICTING", "SomeoneElse")
    _pr(ctx, 3, "MERGEABLE", "Paddione")
    res = _run(run_cmd, ctx, "2", "3")
    # Positiv-Anker: die Ablehnung ist eingetreten und nennt den fremden Login.
    assert "SomeoneElse" in res.output
    # Kern: der ZWEITE PR wurde erreicht.
    assert _lines_re(res.output, r"^pr-refresh: PR 3 ist MERGEABLE")
    # Exit-Code bleibt != 0.
    assert res.returncode != 0
    assert ctx["push_log"].stat().st_size == 0


def test_t002417_der_sammellauf_gibt_eine_bilanz_aus_geheilt_uebersprungen_abgelehnt(run_cmd, ctx):
    _pr(ctx, 4, "MERGEABLE", "Paddione")
    _pr(ctx, 5, "CONFLICTING", "SomeoneElse")
    _pr(ctx, 6, "CONFLICTING", "Paddione")
    res = _run(run_cmd, ctx, "--dry-run", "4", "5", "6")
    # Positiv-Anker: alle drei PRs wurden betrachtet.
    assert _lines_re(res.output, r"^pr-refresh: PR 4 ist MERGEABLE")
    assert "SomeoneElse" in res.output
    assert _lines_re(_grep_lines(res.output, r"^\[dry-run\]"), "PR 6")
    # Die Bilanzzeile nennt alle drei Kategorien mit ihren Zahlen.
    bilanz = _grep_lines(res.output, r"^pr-refresh: Bilanz")
    assert bilanz
    assert re.search(r"1 geheilt", bilanz)
    assert re.search(r"1 uebersprungen", bilanz)
    assert re.search(r"1 abgelehnt", bilanz)


def _grep_lines(text: str, pattern: str) -> str:
    return "\n".join(ln for ln in text.splitlines() if re.search(pattern, ln))


def test_t002417_ohne_ablehnung_endet_der_sammellauf_mit_exit_0(run_cmd, ctx):
    _pr(ctx, 7, "MERGEABLE", "Paddione")
    _pr(ctx, 8, "MERGEABLE", "Paddione")
    res = _run(run_cmd, ctx, "7", "8")
    assert _lines_re(res.output, r"^pr-refresh: PR 7 ist MERGEABLE")
    assert _lines_re(res.output, r"^pr-refresh: PR 8 ist MERGEABLE")
    assert res.returncode == 0


def test_t002417_ein_nicht_abrufbarer_pr_ueberspringt_nur_sich_selbst(run_cmd, ctx):
    # Fuer PR 98 existiert keine Fixture - der gh-Stub scheitert.
    _pr(ctx, 99, "MERGEABLE", "Paddione")
    res = _run(run_cmd, ctx, "98", "99")
    assert _lines_re(res.output, r"^pr-refresh: PR 98 nicht abrufbar")
    assert _lines_re(res.output, r"^pr-refresh: PR 99 ist MERGEABLE")
    assert res.returncode != 0
