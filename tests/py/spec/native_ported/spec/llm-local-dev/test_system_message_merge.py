"""Native migration of tests/spec/llm-local-dev/system-message-merge.bats."""

import shutil

import pytest

DRIVE_JS = """
    import { pathToFileURL } from "node:url"
    const mod = await import(pathToFileURL(process.env.PLUGIN).href)
    const plugins = Object.values(mod).filter((v) => typeof v === "function")
    if (plugins.length === 0) { console.error("no plugin export"); process.exit(3) }
    let sent = null
    const cfg = { provider: { [process.env.PROVIDER]: { options: {
      fetch: async (_input, init) => { sent = init.body; return new Response("{}") },
    } } } }
    for (const p of plugins) { const hooks = await p({}); if (hooks.config) await hooks.config(cfg) }
    const body = JSON.stringify({ model: "Muse-Glimmer-30B", messages: JSON.parse(process.env.MESSAGES) })
    await cfg.provider[process.env.PROVIDER].options.fetch("http://127.0.0.1:1919/v1/chat/completions", { method: "POST", body })
    const msgs = JSON.parse(sent).messages
    console.log(msgs.map((m) => m.role).join(","))
    console.log(JSON.stringify(msgs[0].content))
"""


@pytest.fixture
def plugin(repo_root):
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")
    return repo_root / "scripts" / "opencode-plugins" / "system-message-merge.ts"


def _drive(run_cmd, plugin, provider, messages):
    return run_cmd(
        ["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", DRIVE_JS],
        env={"PLUGIN": str(plugin), "PROVIDER": provider, "MESSAGES": messages},
    )


def test_t900220_plugin_file_exists(repo_root, plugin):
    assert plugin.is_file()


def test_t900220_two_leading_system_messages_are_merged_into_one_at_position_0(run_cmd, plugin):
    res = _drive(run_cmd, plugin, "llamacpp-local",
                 '[{"role":"system","content":"A"},{"role":"system","content":"B"},{"role":"user","content":"hi"}]')
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    assert lines[0] == "system,user"
    assert lines[1] == '"A\\n\\nB"'


def test_t900220_a_system_message_later_in_the_conversation_moves_to_the_front(run_cmd, plugin):
    res = _drive(run_cmd, plugin, "llamacpp-local",
                 '[{"role":"system","content":"A"},{"role":"user","content":"u1"},{"role":"assistant","content":"a1"},'
                 '{"role":"system","content":"B"},{"role":"user","content":"u2"}]')
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    assert lines[0] == "system,user,assistant,user"
    assert lines[1] == '"A\\n\\nB"'


def test_t900220_array_content_is_flattened_to_text_when_merging(run_cmd, plugin):
    res = _drive(run_cmd, plugin, "llamacpp-local",
                 '[{"role":"system","content":[{"type":"text","text":"A"}]},{"role":"system","content":"B"},'
                 '{"role":"user","content":"hi"}]')
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    assert lines[0] == "system,user"
    assert lines[1] == '"A\\n\\nB"'


def test_t900220_a_single_leading_system_message_passes_through_unchanged(run_cmd, plugin):
    res = _drive(run_cmd, plugin, "llamacpp-local",
                 '[{"role":"system","content":"A"},{"role":"user","content":"hi"}]')
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    assert lines[0] == "system,user"
    assert lines[1] == '"A"'


def test_t900220_other_providers_are_not_touched(run_cmd, plugin):
    res = _drive(run_cmd, plugin, "opencode-go",
                 '[{"role":"system","content":"A"},{"role":"system","content":"B"},{"role":"user","content":"hi"}]')
    assert res.returncode == 0, res.output
    assert res.output.splitlines()[0] == "system,system,user"
