"""Native migration of tests/spec/agent-skills/vendor-sync.bats."""

import json
import os

import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@example.invalid",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@example.invalid",
    "GIT_CONFIG_GLOBAL": "/dev/null",
}

SKILL_V1 = (
    "---\nname: zq-demo\ndescription: demo\n---\n\n"
    "zeile-a\nzeile-b\nzeile-c\nzeile-d\nzeile-e\n"
)


class Vendor:
    """BATS-setup-Nachbau: Upstream-Repo, Fixture-Root und Umgebung."""

    def __init__(self, run_cmd, repo_root, tmp_path):
        self.run_cmd = run_cmd
        self.repo = repo_root
        self.sync = repo_root / "scripts/vendor-sync.py"
        self.t = tmp_path
        self.env = dict(GIT_ENV)
        self.env["VENDOR_SYNC_CACHE"] = str(tmp_path / "cache")
        self.up = tmp_path / "up-skills"
        self.root = tmp_path / "root"

    def sh(self, *args, cwd=None, env=None):
        r = self.run_cmd(list(args), cwd=cwd, env=env or self.env)
        return r

    def git(self, *args):
        return self.sh("git", *args)

    def py(self, *args, cwd=None):
        return self.sh("python3", str(self.sync), *args, cwd=cwd)

    def setup(self):
        (self.up / "skills/zq-demo").mkdir(parents=True)
        self.git("-C", str(self.up), "init", "-q", "-b", "main").check()
        (self.up / "skills/zq-demo/SKILL.md").write_text(SKILL_V1, encoding="utf-8")
        self.git("-C", str(self.up), "add", "-A").check()
        self.git("-C", str(self.up), "commit", "-qm", "v1").check()
        self.git("-C", str(self.up), "tag", "v1.0.0").check()
        self.base_sha = self.git("-C", str(self.up), "rev-parse", "HEAD").stdout.strip()

        (self.root / ".opencode/skills/zq-demo").mkdir(parents=True)
        (self.root / "docs/agent-guide/registry").mkdir(parents=True)
        text = (self.up / "skills/zq-demo/SKILL.md").read_text(encoding="utf-8")
        text = text.replace("zeile-e\n", "zeile-e LOKALER-PATCH\n")
        (self.root / ".opencode/skills/zq-demo/SKILL.md").write_text(text, encoding="utf-8")
        self.write_lock()

    def write_lock(self):
        (self.root / "docs/agent-guide/registry/vendor-lock.json").write_text(
            "{\n"
            '  "schema_version": 1,\n'
            '  "skills": {\n'
            f'    "zq-demo": {{"repo": "{self.up}", "path": "skills/zq-demo", "dest": ".opencode/skills/zq-demo",\n'
            f'                "track": "release", "ref": "{self.base_sha}", "version": "v1.0.0"}}\n'
            "  },\n"
            '  "plugins": {}\n'
            "}\n",
            encoding="utf-8",
        )

    def upstream_release(self, sed_expr, tag):
        self.sh("sed", "-i", sed_expr, str(self.up / "skills/zq-demo/SKILL.md")).check()
        self.git("-C", str(self.up), "commit", "-qam", tag).check()
        self.git("-C", str(self.up), "tag", tag).check()

    def lock(self):
        return json.loads((self.root / "docs/agent-guide/registry/vendor-lock.json").read_text(encoding="utf-8"))

    def skill_md(self):
        return (self.root / ".opencode/skills/zq-demo/SKILL.md").read_text(encoding="utf-8")

    def report(self):
        return json.loads((self.t / "r.json").read_text(encoding="utf-8"))


@pytest.fixture
def vs(run_cmd, repo_root, tmp_path):
    v = Vendor(run_cmd, repo_root, tmp_path)
    v.setup()
    return v


def test_update_upstream_aenderung_wird_uebernommen_lokaler_patch_bleibt_erhalten(vs):
    vs.upstream_release("s/^zeile-a$/zeile-a UPSTREAM-NEU/", "v1.1.0")
    r = vs.py("update", "--root", str(vs.root), "--report", str(vs.t / "r.json"))
    assert r.returncode == 0, r.output
    text = vs.skill_md()
    assert "zeile-a UPSTREAM-NEU" in text
    assert "zeile-e LOKALER-PATCH" in text
    entry = vs.lock()["skills"]["zq-demo"]
    up_sha = vs.git("-C", str(vs.up), "rev-parse", "v1.1.0").stdout.strip()
    assert f"{entry['version']} {entry['ref']}" == f"v1.1.0 {up_sha}"


def test_update_konflikt_wird_gemeldet_exit_1_und_von_check_als_befund_erkannt(vs):
    vs.upstream_release("s/^zeile-e$/zeile-e UPSTREAM-ANDERS/", "v1.1.0")
    r = vs.py("update", "--root", str(vs.root), "--report", str(vs.t / "r.json"))
    assert r.returncode == 1
    s = vs.report()["skills"][0]
    assert f"{s['status']} {s['conflicts'][0]['file']}" == "conflict SKILL.md"
    r = vs.py("check", "--root", str(vs.root), "--no-network")
    assert r.returncode == 1
    assert "unresolved-conflict: .opencode/skills/zq-demo/SKILL.md" in r.output


def test_release_tracking_hoechste_stabile_semver_gewinnt_prerelease_wird_ignoriert(vs):
    vs.upstream_release("s/^zeile-b$/zeile-b neun/", "v1.9.0")
    vs.upstream_release("s/^zeile-b neun$/zeile-b zehn/", "v1.10.0")
    vs.upstream_release("s/^zeile-b zehn$/zeile-b rc/", "v2.0.0-rc1")
    r = vs.py("status", "--root", str(vs.root), "--report", str(vs.t / "r.json"))
    assert r.returncode == 0, r.output
    s = vs.report()["skills"][0]
    assert f"{s['status']} {s['to']}" == "available v1.10.0"


def test_status_schreibt_nichts(vs):
    vs.upstream_release("s/^zeile-a$/zeile-a UPSTREAM-NEU/", "v1.1.0")

    def snapshot():
        return vs.skill_md() + (vs.root / "docs/agent-guide/registry/vendor-lock.json").read_text(encoding="utf-8")

    before = snapshot()
    r = vs.py("status", "--root", str(vs.root))
    assert r.returncode == 0
    assert "available" in r.output
    assert before == snapshot()


def _plugin_repo(vs, name_skill="zq-alpha"):
    pl = vs.t / "up-plugin"
    (pl / "skills" / name_skill).mkdir(parents=True)
    vs.git("-C", str(pl), "init", "-q", "-b", "main").check()
    (pl / "skills" / name_skill / "SKILL.md").write_text(f"---\nname: {name_skill}\n---\n", encoding="utf-8")
    vs.git("-C", str(pl), "add", "-A").check()
    vs.git("-C", str(pl), "commit", "-qm", "v1").check()
    vs.git("-C", str(pl), "tag", "v1.0.0").check()
    return pl


def test_check_referenz_auf_einen_im_plugin_release_fehlenden_skill_ist_ein_befund(vs):
    pl = _plugin_repo(vs)
    psha = vs.git("-C", str(pl), "rev-parse", "HEAD").stdout.strip()
    (vs.root / "pins.txt").write_text(f"pin {psha}\n", encoding="utf-8")
    (vs.root / "flow.md").write_text("nutze zqplug:zq-alpha und zqplug:zq-gamma\n", encoding="utf-8")
    lock_path = vs.root / "docs/agent-guide/registry/vendor-lock.json"
    d = json.loads(lock_path.read_text(encoding="utf-8"))
    d["plugins"] = {"git": {"zqplug": {
        "repo": str(pl), "track": "release", "skills_dir": "skills",
        "reference_pattern": "zqplug:([a-z0-9][a-z0-9-]*)", "pins": ["pins.txt"],
        "ref": psha, "version": "v1.0.0",
    }}}
    lock_path.write_text(json.dumps(d), encoding="utf-8")

    r = vs.py("check", "--root", str(vs.root))
    assert r.returncode == 1
    # Positiv-Anker: der vorhandene Skill wird aufgeloest, der fehlende gemeldet.
    assert "dangling-plugin-reference: zqplug:zq-gamma" in r.output
    grep_count = sum(1 for line in r.stdout.splitlines() if "zqplug:zq-alpha " in line)
    assert grep_count == 0


def test_update_git_plugin_pin_wird_in_allen_pin_dateien_angehoben(vs):
    pl = _plugin_repo(vs)
    old = vs.git("-C", str(pl), "rev-parse", "HEAD").stdout.strip()
    with open(pl / "skills/zq-alpha/SKILL.md", "a", encoding="utf-8") as fh:
        fh.write("x\n")
    vs.git("-C", str(pl), "commit", "-qam", "v2").check()
    vs.git("-C", str(pl), "tag", "v2.0.0").check()
    new = vs.git("-C", str(pl), "rev-parse", "HEAD").stdout.strip()

    (vs.root / "pins.txt").write_text(f'"zqplug": "git+{pl}#{old}"\n', encoding="utf-8")
    lock_path = vs.root / "docs/agent-guide/registry/vendor-lock.json"
    d = json.loads(lock_path.read_text(encoding="utf-8"))
    d["plugins"] = {"git": {"zqplug": {
        "repo": str(pl), "track": "release", "pins": ["pins.txt"], "ref": old, "version": "v1.0.0",
    }}}
    lock_path.write_text(json.dumps(d), encoding="utf-8")

    r = vs.py("update", "--root", str(vs.root), "--only", "zqplug")
    assert r.returncode == 0, r.output
    assert f"#{new}" in (vs.root / "pins.txt").read_text(encoding="utf-8")
    r = vs.py("check", "--root", str(vs.root), "--no-network")
    assert r.returncode == 0, r.output


def test_repo_lock_inventar_und_vendor_kopien_sind_konsistent_offline(vs):
    r = vs.py("check", "--no-network")
    assert r.returncode == 0, r.output
    assert "sauber" in r.output


def test_repo_lavish_ist_allein_vendor_sync_owned_nicht_skills_cli_verwaltet_t900520(vs):
    skills_lock = json.loads((vs.repo / "skills-lock.json").read_text(encoding="utf-8"))
    assert "lavish" not in skills_lock.get("skills", {}), (
        "lavish steht in skills-lock.json (skills-CLI wuerde lokale Patches verwerfen)"
    )
    vendor_lock = json.loads((vs.repo / "docs/agent-guide/registry/vendor-lock.json").read_text(encoding="utf-8"))
    assert "lavish" in vendor_lock.get("skills", {}), "lavish fehlt in vendor-lock.json"
