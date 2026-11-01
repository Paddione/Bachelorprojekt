"""tests/py/scripts/test_context7_updater.py — scripts/context7_updater.py.

Pruefmodus: Laufzeitverhalten. Die Versionslogik wird direkt aufgerufen, der
Gesamtablauf laeuft gegen ein Bare-Repo als origin; nur gh und die npm-Registry
sind ersetzt.
"""
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "context7_updater.py"
spec = importlib.util.spec_from_file_location("context7_updater", SCRIPT)
c7 = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = c7
spec.loader.exec_module(c7)

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
MIN_AGE = timedelta(days=3)


def packument(latest, **ages):
    """Versions as v1_2_3=<age in days>."""
    time = {"created": "2020-01-01T00:00:00.000Z", "modified": "2026-11-01T00:00:00.000Z"}
    for key, days in ages.items():
        stamp = NOW - timedelta(days=days)
        time[key[1:].replace("_", ".")] = stamp.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return {"dist-tags": {"latest": latest}, "time": time}


@pytest.mark.parametrize("raw,expected", [
    ("^1.2.3", ("^", (1, 2, 3))),
    ("~1.2.3", ("~", (1, 2, 3))),
    ("1.2.3", ("", (1, 2, 3))),
    ("workspace:*", None),
    ("file:../x", None),
    ("*", None),
    ("^1.2", None),
    ("^1.0.0-beta.1", None),
    (">=1.0.0 <2", None),
])
def test_parse_spec(raw, expected):
    assert c7.parse_spec(raw) == expected


def test_picks_newest_version_old_enough():
    doc = packument("1.3.0", v1_2_0=30, v1_2_5=10, v1_3_0=1)
    assert c7.pick_update("^1.2.0", doc, NOW, MIN_AGE) == "^1.2.5"


def test_young_release_is_not_picked():
    doc = packument("1.3.0", v1_2_0=30, v1_3_0=1)
    assert c7.pick_update("^1.2.0", doc, NOW, MIN_AGE) is None


def test_keeps_range_prefix():
    doc = packument("1.2.5", v1_2_0=30, v1_2_5=10)
    assert c7.pick_update("1.2.0", doc, NOW, MIN_AGE) == "1.2.5"
    assert c7.pick_update("~1.2.0", doc, NOW, MIN_AGE) == "~1.2.5"


def test_ignores_prereleases():
    doc = packument("1.2.5", v1_2_0=30, v1_2_5=10)
    doc["time"]["1.9.0-rc.1"] = "2026-01-01T00:00:00.000Z"
    assert c7.pick_update("^1.2.0", doc, NOW, MIN_AGE) == "^1.2.5"


def test_never_exceeds_latest_tag():
    doc = packument("1.2.5", v1_2_0=30, v1_2_5=10, v1_9_0=10)
    assert c7.pick_update("^1.2.0", doc, NOW, MIN_AGE) == "^1.2.5"


def test_updates_old_major_even_when_new_major_exists():
    doc = packument("7.0.1", v5_9_1=30, v5_9_2=10, v7_0_1=10)
    assert c7.pick_update("^5.9.1", doc, NOW, MIN_AGE) == "^5.9.2"


def test_zero_x_minor_counts_as_breaking():
    doc = packument("0.137.0", v0_133_0=30, v0_137_0=10)
    assert c7.pick_update("^0.133.0", doc, NOW, MIN_AGE) is None
    assert c7.major_gap("^0.133.0", doc) == "0.137.0"


def test_zero_x_patch_is_safe():
    doc = packument("0.133.4", v0_133_0=30, v0_133_4=10)
    assert c7.pick_update("^0.133.0", doc, NOW, MIN_AGE) == "^0.133.4"
    assert c7.major_gap("^0.133.0", doc) is None


def test_major_gap_ignores_older_latest():
    doc = packument("1.0.0", v1_0_0=30)
    assert c7.major_gap("^2.0.0", doc) is None


def test_scan_separates_updates_majors_held_and_exclusions():
    manifests = {"components/a/package.json": {
        "safe": "^1.0.0", "young": "^1.0.0", "big": "^1.0.0", "pinned": "^1.0.0", "local": "workspace:*",
    }}
    docs = {
        "safe": packument("1.1.0", v1_0_0=30, v1_1_0=10),
        "young": packument("1.1.0", v1_0_0=30, v1_1_0=1),
        "big": packument("2.0.0", v1_0_0=30, v2_0_0=10),
        "pinned": packument("1.1.0", v1_0_0=30, v1_1_0=10),
    }
    result = c7.scan(manifests, docs, NOW, MIN_AGE, {"pinned"})
    assert result.updates == {"components/a/package.json": [("safe", "^1.0.0", "^1.1.0")]}
    assert result.majors == [("components/a/package.json", "big", "^1.0.0", "2.0.0")]
    assert result.held == [("young", "1.1.0")]
    assert result.unparsed == [("components/a/package.json", "local", "workspace:*")]


def test_bump_touches_only_dependencies_block():
    text = json.dumps({
        "devDependencies": {"x": "^1.0.0"},
        "dependencies": {"x": "^1.0.0", "y": "^2.0.0"},
    }, indent=2)
    out = json.loads(c7.bump_manifest(text, "x", "^1.1.0"))
    assert out["dependencies"] == {"x": "^1.1.0", "y": "^2.0.0"}
    assert out["devDependencies"] == {"x": "^1.0.0"}


def test_bump_fails_loudly_when_package_is_missing():
    with pytest.raises(ValueError):
        c7.bump_manifest('{"dependencies": {"y": "^2.0.0"}}', "x", "^1.1.0")


class FakeRun:
    def __init__(self, *results):
        self.results = list(results)
        self.calls = []

    def __call__(self, cmd, cwd):
        self.calls.append(cmd)
        return self.results.pop(0)


def test_prefers_pnpm_when_both_lockfiles_exist(tmp_path):
    (tmp_path / "pnpm-lock.yaml").write_text("")
    (tmp_path / "package-lock.json").write_text("{}")
    run = FakeRun((0, ""))
    assert c7.refresh_lockfile(tmp_path, run) == "pnpm-lock.yaml"
    assert run.calls[0][0] == "pnpm"
    assert "--ignore-scripts" in run.calls[0]


def test_npm_retries_with_legacy_peer_deps_on_eresolve(tmp_path):
    (tmp_path / "package-lock.json").write_text("{}")
    run = FakeRun((1, "npm error code ERESOLVE"), (0, ""))
    assert c7.refresh_lockfile(tmp_path, run) == "package-lock.json"
    assert "--legacy-peer-deps" not in run.calls[0]
    assert "--legacy-peer-deps" in run.calls[1]
    assert all("--ignore-scripts" in call for call in run.calls)


def test_npm_does_not_retry_on_other_errors(tmp_path):
    (tmp_path / "package-lock.json").write_text("{}")
    run = FakeRun((1, "npm error code E404"))
    with pytest.raises(c7.LockfileError):
        c7.refresh_lockfile(tmp_path, run)
    assert len(run.calls) == 1


def test_missing_lockfile_is_an_error(tmp_path):
    with pytest.raises(c7.LockfileError):
        c7.refresh_lockfile(tmp_path, FakeRun())


def git_repo(path):
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path, check=True)
    subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=path, check=True)
    subprocess.run(["git", "config", "user.name", "T"], cwd=path, check=True)
    for name in ("a", "b"):
        ws = path / "components" / name
        ws.mkdir(parents=True)
        (ws / "package.json").write_text('{"dependencies": {"x": "^1.0.0"}}\n')
        (ws / "pnpm-lock.yaml").write_text("old\n")
        (ws / "pnpm-workspace.yaml").write_text("minimumReleaseAgeExclude: []\n")
    subprocess.run(["git", "add", "."], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path, check=True)


UPDATES = {
    "components/a/package.json": [("x", "^1.0.0", "^1.1.0")],
    "components/b/package.json": [("x", "^1.0.0", "^1.1.0")],
}


def test_failed_lockfile_reverts_only_that_workspace(tmp_path):
    git_repo(tmp_path)

    def refresh(ws, run):
        if ws.name == "b":
            raise c7.LockfileError("boom")
        (ws / "pnpm-lock.yaml").write_text("new\n")
        return "pnpm-lock.yaml"

    result = c7.apply_updates(tmp_path, UPDATES, refresh)
    assert result.applied == {"components/a/package.json": "pnpm-lock.yaml"}
    assert [path for path, _ in result.failed] == ["components/b/package.json"]
    assert "^1.1.0" in (tmp_path / "components/a/package.json").read_text()
    assert "^1.0.0" in (tmp_path / "components/b/package.json").read_text()


def test_release_age_exclusion_reverts_the_workspace(tmp_path):
    git_repo(tmp_path)

    def refresh(ws, run):
        (ws / "pnpm-lock.yaml").write_text("new\n")
        if ws.name == "b":
            (ws / "pnpm-workspace.yaml").write_text("minimumReleaseAgeExclude: [x@1.1.0]\n")
        return "pnpm-lock.yaml"

    result = c7.apply_updates(tmp_path, UPDATES, refresh)
    assert list(result.applied) == ["components/a/package.json"]
    assert result.gated == ["components/b/package.json"]
    assert result.failed == []
    assert (tmp_path / "components/b/pnpm-workspace.yaml").read_text() == "minimumReleaseAgeExclude: []\n"
    assert (tmp_path / "components/b/pnpm-lock.yaml").read_text() == "old\n"


class FakeGh:
    def __init__(self, issues=(), issue=None, prs=()):
        self.issues = list(issues)
        self.issue = issue or {"body": "", "comments": []}
        self.prs = list(prs)
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args)
        if args[:2] == ("issue", "list"):
            return json.dumps(self.issues)
        if args[:2] == ("issue", "view"):
            return json.dumps(self.issue)
        if args[:2] == ("pr", "list"):
            return json.dumps(self.prs)
        if args[:2] == ("pr", "create"):
            return "https://github.com/example/repo/pull/1\n"
        return ""

    def verbs(self):
        return [call[:2] for call in self.calls]


MAJORS = [("components/a/package.json", "big", "^1.0.0", "2.0.0")]


def test_major_report_creates_issue_when_none_exists(monkeypatch):
    gh = FakeGh()
    monkeypatch.setattr(c7, "gh", gh)
    c7.report_majors(MAJORS, "2026-11-01")
    assert ("issue", "create") in gh.verbs()
    create = next(call for call in gh.calls if call[:2] == ("issue", "create"))
    assert "maintenance" in create


def test_major_report_comments_when_table_changed(monkeypatch):
    gh = FakeGh(issues=[{"number": 7, "title": c7.MAJOR_ISSUE_TITLE}],
                issue={"body": "x", "comments": [{"body": "old table"}]})
    monkeypatch.setattr(c7, "gh", gh)
    c7.report_majors(MAJORS, "2026-11-01")
    assert ("issue", "comment") in gh.verbs()


def test_major_report_stays_silent_when_table_unchanged(monkeypatch):
    table = c7.major_table(MAJORS)
    gh = FakeGh(issues=[{"number": 7, "title": c7.MAJOR_ISSUE_TITLE}],
                issue={"body": "x", "comments": [{"body": "Stand gestern\n\n" + table}]})
    monkeypatch.setattr(c7, "gh", gh)
    c7.report_majors(MAJORS, "2026-11-01")
    assert ("issue", "comment") not in gh.verbs()
    assert ("issue", "create") not in gh.verbs()


def test_major_report_ignores_other_titles(monkeypatch):
    gh = FakeGh(issues=[{"number": 7, "title": "something else"}])
    monkeypatch.setattr(c7, "gh", gh)
    c7.report_majors(MAJORS, "2026-11-01")
    assert ("issue", "create") in gh.verbs()


def test_no_majors_means_no_github_calls(monkeypatch):
    gh = FakeGh()
    monkeypatch.setattr(c7, "gh", gh)
    c7.report_majors([], "2026-11-01")
    assert gh.calls == []


def open_pr(hours_old, branch="chore/context7-updates-2026-10-31"):
    created = (NOW - timedelta(hours=hours_old)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"number": 7000, "headRefName": branch, "createdAt": created, "isDraft": False}


def test_blocking_pr_only_matches_update_branches():
    assert c7.blocking_prs([open_pr(1, "feature/x")]) == []
    assert len(c7.blocking_prs([open_pr(1)])) == 1


def test_fresh_open_pr_is_not_stale():
    assert not c7.is_stale(open_pr(10), NOW)


def test_stuck_open_pr_is_stale():
    assert c7.is_stale(open_pr(c7.STALE_PR_HOURS + 1), NOW)


@pytest.fixture
def checkout(tmp_path, monkeypatch):
    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], check=True)
    root = tmp_path / "repo"
    root.mkdir()
    git_repo(root)
    subprocess.run(["git", "remote", "add", "origin", str(origin)], cwd=root, check=True)
    subprocess.run(["git", "push", "-q", "origin", "main"], cwd=root, check=True)

    docs = {"x": packument("1.1.0", v1_0_0=30, v1_1_0=10)}
    monkeypatch.setattr(c7, "fetch_packuments", lambda names: docs)

    def refresh(ws, run):
        (ws / "pnpm-lock.yaml").write_text("new\n")
        return "pnpm-lock.yaml"

    monkeypatch.setattr(c7, "refresh_lockfile", refresh)
    return root, origin


def origin_branches(origin):
    out = subprocess.run(["git", "for-each-ref", "--format=%(refname:short)", "refs/heads"],
                         cwd=origin, check=True, capture_output=True, text=True).stdout
    return out.split()


def run_update(root, dry_run=False):
    return c7.run_update(root, NOW, "2026-11-01", frozenset(), dry_run)


def test_run_pushes_branch_and_opens_ready_pr(checkout, monkeypatch):
    root, origin = checkout
    gh = FakeGh()
    monkeypatch.setattr(c7, "gh", gh)
    assert run_update(root) == 0

    branch = "chore/context7-updates-2026-11-01"
    assert branch in origin_branches(origin)
    subject = subprocess.run(["git", "log", "-1", "--format=%s%n%b", branch], cwd=origin, check=True,
                             capture_output=True, text=True).stdout.strip()
    assert subject == "chore(deps): update Context7 libraries 2026-11-01"
    create = next(call for call in gh.calls if call[:2] == ("pr", "create"))
    assert "--draft" not in create
    assert "dependencies" not in create
    merge = next(call for call in gh.calls if call[:2] == ("pr", "merge"))
    assert "--auto" in merge and "--squash" in merge


def test_run_commits_only_manifest_and_lockfile(checkout, monkeypatch):
    root, origin = checkout
    monkeypatch.setattr(c7, "gh", FakeGh())
    run_update(root)
    files = subprocess.run(["git", "diff", "--name-only", "main", "chore/context7-updates-2026-11-01"],
                           cwd=origin, check=True, capture_output=True, text=True).stdout.split()
    assert sorted(files) == [
        "components/a/package.json", "components/a/pnpm-lock.yaml",
        "components/b/package.json", "components/b/pnpm-lock.yaml",
    ]


def test_run_waits_for_open_update_pr(checkout, monkeypatch):
    root, origin = checkout
    gh = FakeGh(prs=[open_pr(10)])
    monkeypatch.setattr(c7, "gh", gh)
    assert run_update(root) == 0
    assert ("pr", "list") in gh.verbs()
    assert ("pr", "create") not in gh.verbs()
    assert origin_branches(origin) == ["main"]


def test_run_fails_when_update_pr_is_stuck(checkout, monkeypatch):
    root, _ = checkout
    gh = FakeGh(prs=[open_pr(c7.STALE_PR_HOURS + 1)])
    monkeypatch.setattr(c7, "gh", gh)
    assert run_update(root) == 1
    assert ("pr", "create") not in gh.verbs()


def test_run_reports_majors_while_update_pr_is_open(checkout, monkeypatch):
    root, _ = checkout
    monkeypatch.setattr(c7, "fetch_packuments", lambda names: {
        "x": packument("2.0.0", v1_0_0=30, v1_1_0=10, v2_0_0=10)})
    gh = FakeGh(prs=[open_pr(10)])
    monkeypatch.setattr(c7, "gh", gh)
    assert run_update(root) == 0
    assert ("issue", "create") in gh.verbs()


def test_dry_run_changes_nothing_remote(checkout, monkeypatch, capsys):
    root, origin = checkout
    monkeypatch.setattr(c7, "fetch_packuments", lambda names: {
        "x": packument("2.0.0", v1_0_0=30, v1_1_0=10, v2_0_0=10)})
    gh = FakeGh()
    monkeypatch.setattr(c7, "gh", gh)
    assert run_update(root, dry_run=True) == 0
    assert "^1.1.0" in capsys.readouterr().out
    assert ("issue", "create") not in gh.verbs()
    assert ("pr", "create") not in gh.verbs()
    assert origin_branches(origin) == ["main"]


def test_run_keeps_good_workspaces_but_fails_on_lockfile_error(checkout, monkeypatch):
    root, origin = checkout

    def refresh(ws, run):
        if ws.name == "b":
            raise c7.LockfileError("boom")
        (ws / "pnpm-lock.yaml").write_text("new\n")
        return "pnpm-lock.yaml"

    monkeypatch.setattr(c7, "refresh_lockfile", refresh)
    gh = FakeGh()
    monkeypatch.setattr(c7, "gh", gh)
    assert run_update(root) == 1
    create = next(call for call in gh.calls if call[:2] == ("pr", "create"))
    assert "components/b/package.json" in " ".join(create)
    files = subprocess.run(["git", "diff", "--name-only", "main", "chore/context7-updates-2026-11-01"],
                           cwd=origin, check=True, capture_output=True, text=True).stdout.split()
    assert "components/a/package.json" in files
    assert "components/b/package.json" not in files


def test_run_is_quiet_without_updates(checkout, monkeypatch):
    root, origin = checkout
    monkeypatch.setattr(c7, "fetch_packuments", lambda names: {"x": packument("1.0.0", v1_0_0=30)})
    gh = FakeGh()
    monkeypatch.setattr(c7, "gh", gh)
    assert run_update(root) == 0
    assert ("pr", "create") not in gh.verbs()
    assert origin_branches(origin) == ["main"]
