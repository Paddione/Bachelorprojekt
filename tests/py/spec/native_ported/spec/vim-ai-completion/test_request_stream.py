"""Native migration of tests/spec/vim-ai-completion/request-stream.bats."""
# Output verification: each case writes a case.vim script, runs headless vim, and checks the

# result file. Shims for curl and server-management binaries live in a tmp bin dir.

import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

CURL_SHIM = """#!/bin/bash
echo "$@" >> "@TMP@/curl.log"
for arg in "$@"; do
  if [[ "$arg" == *":8094"* ]]; then
    exit 7
  fi
done
exec /usr/bin/curl "$@"
"""

MGMT_SHIM = """#!/bin/bash
echo "@CMD@ $@" >> "@TMP@/mgmt.log"
exit 0
"""

MGMT_CMDS = ["systemctl", "docker", "kubectl", "task", "lms", "llama-server", "nvidia-smi", "ssh", "pwsh",
             "powershell.exe"]

VIM_FEATURE_CHECK = ['if has("job") && has("timers") && has("textprop") && has("channel") | qa! | else | cq | endif']


def _write_shim(path: Path, body: str, tmp: Path) -> None:
    path.write_text(body.replace("@TMP@", str(tmp)), encoding="utf-8")
    os.chmod(path, 0o755)


@pytest.fixture
def env(tmp_path: Path, repo_root: Path, run_cmd):
    """Mirror bats setup(): HOME and PATH shims in BATS_TEST_TMPDIR equivalent (tmp_path)."""
    (tmp_path / "home").mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_shim(bin_dir / "curl", CURL_SHIM, tmp_path)
    for cmd in MGMT_CMDS:
        _write_shim(bin_dir / cmd, MGMT_SHIM.replace("@CMD@", cmd), tmp_path)
    return {
        "HOME": str(tmp_path / "home"),
        "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
    }


@pytest.fixture
def fake_server(tmp_path: Path, repo_root: Path, env, run_cmd):
    if shutil.which("vim") is None:
        pytest.skip("vim fehlt")
    feature = run_cmd(["vim", "-Nu", "NONE", "-i", "NONE", "-n", "-es", "-c", VIM_FEATURE_CHECK[0]])
    if feature.returncode != 0:
        pytest.skip("Vim-Feature fehlschlagen")
    if shutil.which("node") is None:
        pytest.skip("node fehlt")
    if shutil.which("curl") is None:
        pytest.skip("curl fehlt")

    port_file = tmp_path / "port"
    proc = subprocess.Popen(
        ["node", str(repo_root / "tests" / "fixtures" / "llama-vim" / "fake-server.mjs"),
         "--port-file", str(port_file)],
        env={**os.environ, **env}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(50):
        if port_file.is_file() and port_file.stat().st_size > 0:
            break
        time.sleep(0.1)
    if not (port_file.is_file() and port_file.stat().st_size > 0):
        proc.kill()
        proc.wait()
        pytest.fail("fake-server nicht gestartet")
    port = port_file.read_text(encoding="utf-8").strip()
    yield port
    if proc.poll() is None:
        proc.terminate()
    proc.wait()


def _vim_case(run_cmd, repo_root: Path, tmp: Path, env: dict, script: str, port: str = "") -> set:
    """Write case.vim (placeholders substituted), run headless vim, return result lines."""
    # Bash heredoc expansion: $BATS_TEST_TMPDIR, $REPO and $PORT are expanded before vim runs.
    text = (script.replace("$BATS_TEST_TMPDIR", str(tmp)).replace("$REPO", str(repo_root))
            .replace("$PORT", port))
    case = tmp / "case.vim"
    case.write_text(text, encoding="utf-8")
    run_cmd(["timeout", "40", "vim", "-Nu", "NONE", "-i", "NONE", "-n", "-es",
             "--cmd", f"set runtimepath^={repo_root}/editor/llama-vim", "-S", str(case)],
            env=env, timeout=120)
    result = tmp / "result.txt"
    if not (result.is_file() and result.stat().st_size > 0):
        pytest.fail("result.txt fehlt oder leer")
    return set(result.read_text(encoding="utf-8").splitlines())


WAIT_UNTIL = r"""function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction
"""



def _run_case(run_cmd, repo_root, tmp, env, script, port):
    lines = _vim_case(run_cmd, repo_root, tmp, env, script, port=port)
    return lines


def test_req_vim_ai_003_parser_emits_split_sse_ndjson_and_final_json_deltas_exactly_once(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-003 parser emits split SSE NDJSON and final JSON deltas exactly once"""
    script = r"""let s:p = llama#stream#new()
let s:r1 = llama#stream#feed(s:p, "data: {\"content\": \"hello \", ", 0)
let s:r2 = llama#stream#feed(s:r1.state, "\"completion\": \"world\"}\n\ndata: [DONE]\n\n", 1)

let s:res = ['ok=1', 'count=' . len(s:r2.events)]
let s:texts = []
for s:ev in s:r2.events
  if s:ev.type ==# 'delta'
    call add(s:texts, s:ev.text)
  endif
endfor
call add(s:res, 'text=' . join(s:texts, ''))
call writefile(s:res, "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "ok=1" in lines
    assert "text=hello world" in lines


def test_req_vim_ai_003_split_sse_stream_renders_ordered_accumulated_ghost_text(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-003 split SSE stream renders ordered accumulated ghost text"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["function test() {", "}"])
call cursor(1, 17)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/sse-split/infill'}
runtime plugin/llama.vim

call llama#fim(1)
let s:ready = WaitUntil('len(prop_list(1)) > 0', 3000)
let s:props = prop_list(1)
let s:text = empty(s:props) ? '' : get(s:props[0], 'text', '')

call writefile(['ok=1', 'ready=' . s:ready, 'text=' . s:text], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "ready=1" in lines
    assert "text=first part second part" in lines


def test_req_vim_ai_003_first_ghost_text_is_visible_before_the_curl_job_exits(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-003 first ghost text is visible before the curl job exits"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/slow/infill'}
runtime plugin/llama.vim

call llama#fim(1)
let s:has_prop = WaitUntil('len(prop_list(1)) > 0', 2000)
let s:snap = llama#request#snapshot(bufnr('%'))
let s:running = s:snap.phase ==# 'streaming' || s:snap.phase ==# 'running'

call writefile(['ok=1', 'has_prop=' . s:has_prop, 'running=' . s:running], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "has_prop=1" in lines
    assert "running=1" in lines


def test_req_vim_ai_003_repetition_guard_cancels_request_and_freezes_ghost_text(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-003 repetition guard cancels request and freezes ghost text"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/repeat/infill', 'repeat_max_tokens': 4}
runtime plugin/llama.vim

call llama#fim(1)
let s:cancelled = WaitUntil('llama#request#snapshot(bufnr("%")).phase ==# "cancelled"', 3000)
let s:snap = llama#request#snapshot(bufnr('%'))

call writefile(['ok=1', 'cancelled=' . s:cancelled, 'reason=' . get(s:snap, 'cancel_reason', '')], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "cancelled=1" in lines
    assert "reason=repetition" in lines


def test_req_vim_ai_004_http_503_then_success_retries_and_renders_completion(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-004 HTTP 503 then success retries and renders completion"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/http-503-once/infill', 'retry_base_ms': 50}
runtime plugin/llama.vim

call llama#fim(1)
let s:ready = WaitUntil('len(prop_list(1)) > 0', 3000)
let s:snap = llama#request#snapshot(bufnr('%'))

call writefile(['ok=1', 'ready=' . s:ready, 'phase=' . s:snap.phase, 'attempt=' . s:snap.attempt], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "ready=1" in lines
    assert "phase=complete" in lines
    assert "attempt=2" in lines


def test_req_vim_ai_004_http_429_then_success_recovers_within_attempt_limit(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-004 HTTP 429 then success recovers within attempt limit"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/http-429-once/infill', 'retry_base_ms': 50}
runtime plugin/llama.vim

call llama#fim(1)
let s:ready = WaitUntil('len(prop_list(1)) > 0', 3000)
let s:snap = llama#request#snapshot(bufnr('%'))

call writefile(['ok=1', 'ready=' . s:ready, 'phase=' . s:snap.phase], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "ready=1" in lines
    assert "phase=complete" in lines


def test_req_vim_ai_004_http_400_exposes_http_permanent_and_schedules_no_retry(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-004 HTTP 400 exposes http_permanent and schedules no retry"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/http-400/infill'}
runtime plugin/llama.vim

call llama#fim(1)
let s:failed = WaitUntil('llama#request#snapshot(bufnr("%")).phase ==# "failed"', 2000)
let s:snap = llama#request#snapshot(bufnr('%'))

call writefile(['ok=1', 'failed=' . s:failed, 'kind=' . get(s:snap.last_error, 'kind', ''), 'http_status=' . get(s:snap.last_error, 'http_status', 0)], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "failed=1" in lines
    assert "kind=http_permanent" in lines
    assert "http_status=400" in lines


def test_req_vim_ai_004_llamadisable_and_fim_disabling_reload_cancel_pending_retry(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-004 LlamaDisable and FIM-disabling reload cancel pending retry"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/http-503-always/infill', 'retry_base_ms': 2000}
runtime plugin/llama.vim

call llama#fim(1)
let s:waiting = WaitUntil('llama#request#snapshot(bufnr("%")).phase ==# "retry_wait"', 2000)
LlamaDisable
let s:snap = llama#request#snapshot(bufnr('%'))

call writefile(['ok=1', 'waiting=' . s:waiting, 'phase=' . s:snap.phase], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "waiting=1" in lines
    assert "phase=cancelled" in lines


def test_req_vim_ai_004_error_classes_cancelled_transport_timeout_protocol_are_distinguished(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-004 error classes cancelled transport timeout protocol are distinguished"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/malformed/infill', 'retry_max_attempts': 1}
runtime plugin/llama.vim

call llama#fim(1)
let s:failed = WaitUntil('llama#request#snapshot(bufnr("%")).phase ==# "failed"', 2000)
let s:snap = llama#request#snapshot(bufnr('%'))

call writefile(['ok=1', 'kind=' . get(s:snap.last_error, 'kind', '')], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "kind=protocol" in lines


def test_req_vim_ai_002_superseded_request_a_cannot_update_ghost_text_of_request_b(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-002 superseded request A cannot update ghost text of request B"""
    script = WAIT_UNTIL + r"""
enew
call setline(1, ["test"])
call cursor(1, 4)
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/supersede/infill'}
runtime plugin/llama.vim

call llama#fim(1)
let s:snapA = llama#request#snapshot(bufnr('%'))
sleep 50m
call llama#fim(1)
let s:snapB = llama#request#snapshot(bufnr('%'))

let s:ready = WaitUntil('len(prop_list(1)) > 0', 3000)
let s:props = prop_list(1)
let s:text = empty(s:props) ? '' : get(s:props[0], 'text', '')

call writefile(['ok=1', 'idA=' . s:snapA.request_id, 'idB=' . s:snapB.request_id, 'text=' . s:text], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "text=BBB" in lines


def test_req_vim_ai_002_vim_job_and_textprop_adapter_runs_full_lifecycle_without_neovim(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-002 Vim job and textprop adapter runs full lifecycle without Neovim"""
    script = r"""enew
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/sse-split/infill'}
runtime plugin/llama.vim

let s:has_nvim = has('nvim')
let s:has_job = has('job')
let s:has_prop = has('textprop')

call writefile(['ok=1', 'has_nvim=' . s:has_nvim, 'has_job=' . s:has_job, 'has_prop=' . s:has_prop], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "has_nvim=0" in lines
    assert "has_job=1" in lines
    assert "has_prop=1" in lines


def test_req_vim_ai_002_editor_without_required_capability_registers_no_auto_fim_autocmds(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-002 editor without required capability registers no auto-FIM autocmds"""
    script = r"""let g:llama_capability_override = {'job': 0}
runtime plugin/llama.vim

let s:cmds = autocmd_get({'group': 'LlamaVimGroup'})
call writefile(['ok=1', 'cmd_count=' . len(s:cmds)], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _run_case(run_cmd, repo_root, tmp_path, env, script, fake_server)
    assert "cmd_count=0" in lines


def test_req_vim_ai_002_nvim_0_10_adapter_ignores_superseded_request(repo_root, run_cmd, env, fake_server):
    """REQ-VIM-AI-002 nvim 0.10 adapter ignores superseded request"""
    if shutil.which("nvim") is None:
        pytest.skip("Neovim nicht installiert")
    result = run_cmd(["nvim", "--headless", "-u", "NONE", "-c",
                      'lua os.exit(vim.fn.has("nvim-0.10")==1 and 0 or 1)'], env=env)
    if result.returncode != 0:
        pytest.skip("Neovim >= 0.10 nicht installiert (Lua-Adapter nicht pruefbar)")
