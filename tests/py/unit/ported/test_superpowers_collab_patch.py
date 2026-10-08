"""Native migration of tests/unit/superpowers-collab-patch.bats."""
import pytest

HELPER_JS = "(function(){ function sendEvent(event){ event.timestamp = Date.now(); } connect(); })();\n"
SERVER_CJS = (
    "function handleMessage(text){ let event; event=JSON.parse(text);\n"
    "  if (event.choice) {\n"
    "    const eventsFile = path.join(STATE_DIR, 'events');\n"
    "    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\\n');\n"
    "  }\n"
    "}\n"
)


@pytest.fixture
def env_setup(tmp_path, repo_root):
    """Port of setup(): stand-in plugin cache under a private HOME."""
    root = tmp_path / "cache" / "x" / "superpowers" / "y" / "skills" / "brainstorming" / "scripts"
    root.mkdir(parents=True)
    (root / "helper.js").write_text(HELPER_JS)
    (root / "server.cjs").write_text(SERVER_CJS)
    plugins = tmp_path / ".claude" / "plugins"
    plugins.mkdir(parents=True)
    (plugins / "cache").symlink_to(tmp_path / "cache")
    return {
        "root": root,
        "env": {"HOME": str(tmp_path)},
        "script": str(repo_root / "scripts" / "superpowers-collab-patch.sh"),
    }


def test_applies_the_collab_block_who_tag_server_relay(run_cmd, env_setup):
    r = run_cmd(["bash", env_setup["script"]], env=env_setup["env"])
    assert r.returncode == 0, r.output
    root = env_setup["root"]
    assert "brainstorm-collab v1" in (root / "helper.js").read_text()
    assert "event.who" in (root / "helper.js").read_text()
    assert "broadcast(event)" in (root / "server.cjs").read_text()


def test_re_running_is_a_no_op_idempotent(run_cmd, env_setup):
    root = env_setup["root"]
    run_cmd(["bash", env_setup["script"]], env=env_setup["env"]).check(0)
    (root / "helper.js.1").write_text((root / "helper.js").read_text())
    (root / "server.cjs.1").write_text((root / "server.cjs").read_text())
    run_cmd(["bash", env_setup["script"]], env=env_setup["env"]).check(0)
    assert (root / "helper.js").read_text() == (root / "helper.js.1").read_text()
    assert (root / "server.cjs").read_text() == (root / "server.cjs.1").read_text()


def test_check_exits_non_zero_before_patching_zero_after(run_cmd, env_setup):
    r = run_cmd(["bash", env_setup["script"], "--check"], env=env_setup["env"])
    assert r.returncode != 0, r.output
    run_cmd(["bash", env_setup["script"]], env=env_setup["env"]).check(0)
    r = run_cmd(["bash", env_setup["script"], "--check"], env=env_setup["env"])
    assert r.returncode == 0, r.output
