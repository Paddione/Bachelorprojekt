"""Native migration of tests/unit/superpowers-submit-patch.bats."""
import os
from pathlib import Path

import pytest

SCRIPT_REL = "scripts/superpowers-submit-patch.sh"

HELPER_JS = "(function(){ window.brainstorm = { send: 1 }; connect(); })();\n"

SERVER_ANCHORS = """const http = require('http');
const PORT = 47600;
let ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;
function handleRequest(req, res) {
    if (html.includes('</body>')) {
      html = html.replace('</body>', helperInjection + '\\n</body>');
    } else {
      html += helperInjection;
    }
}
function startServer() {
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
      if (!knownFiles.has(filename)) {
        knownFiles.add(filename);
        const eventsFile = path.join(STATE_DIR, 'events');
        if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);
        console.log('screen-added');
      }
}
"""

SUB_BLOCK = """const sub = { v: 1, ts: Date.now(), seq: ev.seq || 0, nonce: ev.nonce || null,
  screen: ev.screen || null, question: ev.question || '', selected: ev.selected || [],
  fields: ev.fields || {}, markdown: md };
"""


@pytest.fixture
def patch_env(tmp_path):
    """Mirror setup(): fake plugin cache under a temporary HOME."""
    root = tmp_path / "cache" / "x" / "superpowers" / "y" / "skills" / "brainstorming" / "scripts"
    root.mkdir(parents=True)
    (root / "helper.js").write_text(HELPER_JS, encoding="utf-8")
    (root / "server.cjs").write_text(SERVER_ANCHORS, encoding="utf-8")
    home = tmp_path
    (home / ".claude" / "plugins").mkdir(parents=True)
    os.symlink(tmp_path / "cache", home / ".claude" / "plugins" / "cache")
    return {"root": root, "home": home, "env": {"HOME": str(home)}}


@pytest.fixture
def patch(run_cmd, repo_root, patch_env):
    def _run(*args):
        return run_cmd(
            ["bash", str(repo_root / SCRIPT_REL), *args],
            cwd=repo_root,
            env=patch_env["env"],
            timeout=300,
        )

    return _run


def _has(path: Path, needle: str) -> bool:
    return needle in path.read_text(encoding="utf-8")


def test_applies_helper_block_server_submit_listener(patch, patch_env):
    root = patch_env["root"]
    res = patch()
    assert res.returncode == 0, res.output
    assert _has(root / "helper.js", "brainstorm-submit v1")
    assert _has(root / "helper.js", "__brainstormSubmit")
    assert _has(root / "server.cjs", "/* brainstorm-submit-server v1 */")
    assert _has(root / "server.cjs", "startSubmitListener")
    assert _has(root / "server.cjs", "127.0.0.1")
    assert _has(root / "server.cjs", "__BRAINSTORM_SUBMIT_PORT")
    assert _has(root / "server.cjs", "submission.json")


def test_re_running_is_a_no_op_idempotent(patch, patch_env):
    root = patch_env["root"]
    assert patch().returncode == 0
    helper_before = (root / "helper.js").read_text(encoding="utf-8")
    server_before = (root / "server.cjs").read_text(encoding="utf-8")
    assert patch().returncode == 0
    assert (root / "helper.js").read_text(encoding="utf-8") == helper_before
    assert (root / "server.cjs").read_text(encoding="utf-8") == server_before


def test_check_exits_non_zero_before_patch_zero_after(patch):
    res = patch("--check")
    assert res.returncode == 1, res.output
    assert patch().returncode == 0
    res = patch("--check")
    assert res.returncode == 0, res.output


def test_aborts_exit_2_when_a_server_anchor_is_missing_duplicated(patch, patch_env):
    (patch_env["root"] / "server.cjs").write_text("// drifted: no anchors here\n", encoding="utf-8")
    res = patch()
    assert res.returncode == 2, res.output


def test_applies_plan_review_fields_marker_annotations_verdict(patch, patch_env):
    root = patch_env["root"]
    (root / "server.cjs").write_text(SERVER_ANCHORS + SUB_BLOCK, encoding="utf-8")
    res = patch()
    assert res.returncode == 0, res.output
    assert _has(root / "server.cjs", "plan-review-server v1")
    assert _has(root / "server.cjs", "annotations:")
    assert _has(root / "server.cjs", "verdict:")
    assert _has(root / "server.cjs", "ev.kind === 'plan-review'")


def test_plan_review_check_succeeds_after_patch(patch, patch_env):
    # The --check pass validates a fully patched companion, so the fixture carries all main-pass anchors.
    (patch_env["root"] / "server.cjs").write_text(SERVER_ANCHORS + SUB_BLOCK, encoding="utf-8")
    assert patch().returncode == 0
    res = patch("--check")
    assert res.returncode == 0, res.output
