"""Native migration of tests/spec/llm-local-dev/comfy-image-mcp.bats."""

import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

TOKEN = "test-token"
PY = os.environ.get("COMFY_IMAGE_TEST_PYTHON", "python3")

SYSTEMCTL_STUB = """#!/usr/bin/env bash
echo "$*" >> "{t}/systemctl.log"
case "$*" in
  "--user start comfyui")
    FAKE_COMFY_DIR="{t}" nohup python3 "{fake}" "{fake_port}" >/dev/null 2>&1 &
    echo $! > "{t}/fake.pid" ;;
  "--user stop comfyui")
    [ -f "{t}/fake.pid" ] && kill "$(cat "{t}/fake.pid")" 2>/dev/null; rm -f "{t}/fake.pid" ;;
esac
exit 0
"""

NODE_TRIM_SCRIPT = """
    import { validateArgs, postprocessArgs } from '__CI__/lib.mjs';
    const args = (a) => postprocessArgs(validateArgs({ prompt: 'x', ...a }).params, 'in.png', 'out.png').join(' ');
    console.log(args({ transparent: true }));
    console.log(args({ transparent: true, trim: false }));
    console.log(args({ pixelate: { size: 16 } }));
    console.log(args({ trim: true }));
    console.log(validateArgs({ prompt: 'x', trim: 'false' }).error);
"""


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _http(url, body=None, headers=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers or {})
    if data is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


class Ctx:
    def __init__(self, repo, ci_dir, t_dir, port, fake_port):
        self.repo = repo
        self.ci_dir = ci_dir
        self.t_dir = t_dir
        self.port = port
        self.fake_port = fake_port

    def rpc(self, method, params=None):
        body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
        _, text = _http(
            f"http://127.0.0.1:{self.port}/mcp",
            body,
            {"Authorization": f"Bearer {TOKEN}"},
        )
        return json.loads(text).get("result")

    def call(self, name, args):
        return self.rpc("tools/call", {"name": name, "arguments": args})

    def run_job(self, args):
        out = self.call("image_generate", args)
        job = json.loads(out["content"][0]["text"]).get("job_id")
        if not job:
            raise AssertionError(f"start failed: {out}")
        res = self.call("image_result", {"job_id": job, "wait_s": 30})
        return res["content"][0]["text"]

    def log(self):
        return (self.t_dir / "systemctl.log").read_text()

    def last_prompt(self):
        return (self.t_dir / "last_prompt.json").read_text()


@pytest.fixture(scope="module")
def ctx(repo_root, tmp_path_factory):
    t_dir = tmp_path_factory.mktemp("comfy-image")
    ci_dir = repo_root / "scripts" / "comfy-image-mcp"
    port = _free_port()
    fake_port = _free_port()
    (t_dir / "bin").mkdir()
    (t_dir / "repo" / "assets").mkdir(parents=True)
    (t_dir / "nogit").mkdir()
    stub = t_dir / "bin" / "systemctl"
    stub.write_text(
        SYSTEMCTL_STUB.format(
            t=t_dir,
            fake=repo_root / "tests" / "spec" / "llm-local-dev" / "fake-comfyui.py",
            fake_port=fake_port,
        )
    )
    stub.chmod(0o755)
    (t_dir / "systemctl.log").write_text("")
    repo = t_dir / "repo"
    (repo / "README").write_text("base\n")
    git = ["git", "-C", str(repo)]
    subprocess.run(git + ["init", "-q"], check=True)
    subprocess.run(git + ["add", "README"], check=True)
    subprocess.run(
        git + ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], check=True
    )

    server = None
    if (ci_dir / "server.mjs").is_file():
        env = dict(os.environ)
        env.update(
            {
                "COMFY_IMAGE_MCP_PORT": str(port),
                "COMFY_IMAGE_MCP_TOKEN": TOKEN,
                "COMFY_IMAGE_URL": f"http://127.0.0.1:{fake_port}",
                "COMFY_IMAGE_SYSTEMCTL": str(stub),
                "COMFY_IMAGE_PYTHON": PY,
                "COMFY_IMAGE_IDLE_S": "3",
                "COMFY_IMAGE_TIMEOUT_FLOOR_S": "1",
                "COMFY_IMAGE_START_TIMEOUT_S": "15",
            }
        )
        server = subprocess.Popen(
            ["node", str(ci_dir / "server.mjs")],
            env=env,
            stdout=open(t_dir / "server.log", "w"),
            stderr=subprocess.STDOUT,
        )
        (t_dir / "server.pid").write_text(str(server.pid))
        for _ in range(50):
            try:
                code, _ = _http(f"http://127.0.0.1:{port}/health", timeout=2)
                if code == 200:
                    break
            except OSError:
                pass
            time.sleep(0.1)

    context = Ctx(repo, ci_dir, t_dir, port, fake_port)
    yield context

    if server is not None:
        server.kill()
        server.wait()
    fake_pid = t_dir / "fake.pid"
    if fake_pid.exists():
        try:
            os.kill(int(fake_pid.read_text().strip()), 9)
        except (OSError, ValueError):
            pass


def test_health_endpoint_answers_positive_anchor(ctx):
    code, text = _http(f"http://127.0.0.1:{ctx.port}/health")
    assert code == 200
    assert json.loads(text).get("ok") is True


def test_tools_list_requires_the_bearer_token_and_lists_exactly_three_tools(ctx):
    code, _ = _http(
        f"http://127.0.0.1:{ctx.port}/mcp",
        {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
    )
    assert code == 401
    names = sorted(t["name"] for t in ctx.rpc("tools/list")["tools"])
    assert ",".join(names) == "image_generate,image_result,image_status"


def test_output_outside_a_git_working_tree_is_refused_and_nothing_is_started(ctx):
    out = ctx.call("image_generate", {"prompt": "a fox", "out_path": str(ctx.t_dir / "nogit" / "x.png")})
    assert out.get("isError") is True
    assert "start" not in ctx.log()


def test_an_existing_file_is_not_overwritten_by_default(ctx):
    keep = ctx.t_dir / "repo" / "assets" / "keep.png"
    keep.write_text("keep\n")
    before = hashlib.sha256(keep.read_bytes()).hexdigest()
    out = ctx.call("image_generate", {"prompt": "a fox", "out_path": str(keep)})
    assert out.get("isError") is True
    assert hashlib.sha256(keep.read_bytes()).hexdigest() == before


def test_a_job_starts_comfyui_and_writes_the_image_into_the_working_tree(ctx):
    target = ctx.t_dir / "repo" / "assets" / "hero.png"
    status = json.loads(ctx.run_job({"prompt": "a red fox", "out_path": str(target)}))
    assert status.get("status") == "done"
    seed = str(status.get("seed"))
    assert re.fullmatch(r"[0-9]+", seed)
    git_status = status.get("git_status")
    git_text = "\n".join(git_status) if isinstance(git_status, list) else str(git_status)
    assert "assets/hero.png" in git_text
    assert target.read_bytes()[:8].hex() == "89504e470d0a1a0a"
    assert "--user start comfyui" in ctx.log().splitlines()
    assert "a red fox" in ctx.last_prompt()
    assert re.search(r'"seed": *' + re.escape(seed), ctx.last_prompt())


def test_a_unc_out_path_resolves_to_the_wsl_working_tree(ctx):
    unc = r"\\wsl.localhost\distro" + str(ctx.t_dir).replace("/", "\\") + r"\repo\assets\unc.png"
    status = json.loads(ctx.run_job({"prompt": "a tree", "out_path": unc}))
    assert status.get("status") == "done"
    assert (ctx.t_dir / "repo" / "assets" / "unc.png").is_file()


def test_a_prompt_rejected_by_comfyui_fails_the_job_with_the_node_error(ctx):
    status = json.loads(
        ctx.run_job({"prompt": "FAIL_PROMPT", "out_path": str(ctx.t_dir / "repo" / "assets" / "bad.png")})
    )
    assert status.get("status") == "failed"
    assert "bad node" in str(status.get("error"))


def test_transparent_pixelate_keeps_the_raw_image_and_hints_the_white_background(ctx):
    for module in ("PIL", "rembg"):
        if subprocess.run([PY, "-c", f"import {module}"], capture_output=True).returncode != 0:
            pytest.skip(f"{'Pillow' if module == 'PIL' else module} not installed")
    assets = ctx.t_dir / "repo" / "assets"
    status = json.loads(
        ctx.run_job(
            {
                "prompt": "a knight",
                "out_path": str(assets / "sprite.png"),
                "transparent": True,
                "pixelate": {"size": 16, "colors": 4},
            }
        )
    )
    assert status.get("status") == "done"
    assert (assets / "sprite.raw.png").is_file()
    assert (assets / "sprite.png").is_file()
    assert "plain white background" in ctx.last_prompt()


def test_a_second_job_for_the_same_out_path_is_refused_while_the_first_runs(ctx):
    p = str(ctx.t_dir / "repo" / "assets" / "dup.png")
    first = ctx.call("image_generate", {"prompt": "SLOW_PROMPT castle", "out_path": p})
    job = json.loads(first["content"][0]["text"]).get("job_id")
    assert job
    second = ctx.call("image_generate", {"prompt": "another castle", "out_path": p, "overwrite": True})
    assert second.get("isError") is True
    assert "already writes" in second["content"][0]["text"]
    res = ctx.call("image_result", {"job_id": job, "wait_s": 30})
    assert json.loads(res["content"][0]["text"]).get("status") == "done"


def test_an_existing_raw_file_and_symlinked_targets_are_refused(ctx):
    assets = ctx.t_dir / "repo" / "assets"
    (assets / "tile.raw.png").write_text("keep\n")
    out = ctx.call("image_generate", {"prompt": "a tile", "out_path": str(assets / "tile.png"), "pixelate": {"size": 16}})
    assert out.get("isError") is True
    assert (assets / "tile.raw.png").read_text().strip() == "keep"
    link = assets / "link.png"
    target = ctx.t_dir / "nogit" / "target.png"
    if link.is_symlink() or link.exists():
        link.unlink()
    os.symlink(target, link)
    out = ctx.call("image_generate", {"prompt": "x", "out_path": str(link), "overwrite": True})
    assert out.get("isError") is True
    assert not target.exists()


def test_trim_defaults_to_transparent_when_building_post_process_arguments(ctx, run_cmd):
    script = NODE_TRIM_SCRIPT.replace("__CI__", str(ctx.ci_dir))
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0
    lines = res.output.splitlines()
    assert "--transparent" in lines[0]
    assert "--trim" in lines[0]
    assert "--transparent" in lines[1]
    assert "--trim" not in lines[1]
    assert "--pixelate 16" in lines[2]
    assert "--trim" not in lines[2]
    # trim ohne transparent ist wirkungslos und erzeugt keine Nachbearbeitung
    assert lines[3] == "--in in.png --out out.png"
    assert "trim must be a boolean" in lines[4]


def test_an_idle_server_stops_comfyui(ctx):
    time.sleep(5)
    assert "--user stop comfyui" in ctx.log().splitlines()
    status = json.loads(ctx.call("image_status", {})["content"][0]["text"])
    assert status["comfy"]["ok"] is False


def test_installer_registers_the_image_server_in_muse_settings_without_losing_entries(ctx, run_cmd):
    a = ctx.t_dir / "muse-a.json"
    b = ctx.t_dir / "muse-b.json"
    a.write_text('{"schema_version":1,"mcpServers":{"glimmer-worker":{"type":"http","url":"http://127.0.0.1:13007/mcp"}}}\n')
    b.write_text('{"schema_version":1,"provider":"meta"}\n')
    (ctx.t_dir / "cfg").mkdir()
    env_file = ctx.t_dir / "cfg" / "server.env"
    env_file.write_text("COMFY_IMAGE_MCP_TOKEN=tok456\n")
    res = run_cmd(
        ["bash", str(ctx.ci_dir / "install.sh"), "--register-only"],
        env={
            "COMFY_IMAGE_MUSE_SETTINGS": f"{a} {b}",
            "COMFY_IMAGE_ENV_FILE": str(env_file),
        },
    )
    assert res.returncode == 0, res.output
    for f in (a, b):
        data = json.loads(f.read_text())
        assert data["mcpServers"]["comfy-image"]["url"] == "http://127.0.0.1:13008/mcp"
        assert data["mcpServers"]["comfy-image"]["headers"]["Authorization"] == "Bearer tok456"
        assert (ctx.t_dir / (f.name + ".bak")).is_file()
    assert json.loads(a.read_text())["mcpServers"]["glimmer-worker"]["url"] == "http://127.0.0.1:13007/mcp"
    assert "tok456" not in res.output


def test_the_mcp_registry_does_not_list_the_image_server(repo_root):
    registry = (repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml").read_text()
    assert "mcp-kubernetes" in registry
    assert "comfy-image" not in registry


def test_the_comfyui_unit_is_never_started_at_login(ctx):
    unit = (ctx.ci_dir / "comfyui.service").read_text()
    assert "--port 8189" in unit
    assert not re.search(r"^WantedBy=", unit, re.M)
