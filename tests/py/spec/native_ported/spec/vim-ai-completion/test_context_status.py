"""Native migration of tests/spec/vim-ai-completion/context-status.bats."""
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


def test_req_vim_ai_006_enclosing_function_signature_retained_beyond_static_prefix_window(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-006 enclosing function signature retained beyond static prefix window"""
    script = r"""enew
set filetype=typescript
let s:lines = []
for i in range(1, 40)
  call add(s:lines, '// filler line ' . i)
endfor
call add(s:lines, 'function fooBar(a: number, b: string): void {')
for i in range(1, 28)
  call add(s:lines, '  let x' . i . ' = ' . i . ';')
endfor
call setline(1, s:lines)
call cursor(70, 10)

let g:llama_config = {'n_prefix': 10}
runtime plugin/llama.vim

let s:res = llama#context#build(bufnr('%'), {'lnum': 70, 'col': 10}, llama#config#current())
let s:has_sig = stridx(s:res.payload.input_prefix, 'function fooBar') >= 0

call writefile(['ok=1', 'has_sig=' . s:has_sig], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script)
    assert "has_sig=1" in lines


def test_req_vim_ai_006_lsp_definition_chunk_ranked_before_ring_chunks_within_budget(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-006 LSP definition chunk ranked before ring chunks within budget"""
    script = r"""enew
set filetype=typescript
call setline(1, ["const val = foo();"])
call cursor(1, 15)

runtime plugin/llama.vim

" Remember chunk into ring from buffer B
badd bufB.ts
let s:bufB = bufnr('bufB.ts')
call setbufline(s:bufB, 1, ["function ringChunk() {}"])
call llama#context#remember(s:bufB)

" Add LSP extra definition chunk
call llama#context#add_extra(bufnr('%'), [{
  \ 'source': 'lsp_definition',
  \ 'path': '/path/to/def.ts',
  \ 'text': 'function lspDef() {}',
  \ 'priority': 10
  \ }])

let s:res = llama#context#build(bufnr('%'), {'lnum': 1, 'col': 15}, llama#config#current())
let s:extra = s:res.payload.input_extra
let s:lsp_pos = -1
let s:ring_pos = -1

let s:idx = 0
for s:item in s:extra
  if get(s:item, 'text', '') =~# 'lspDef'
    let s:lsp_pos = s:idx
  elseif get(s:item, 'text', '') =~# 'ringChunk'
    let s:ring_pos = s:idx
  endif
  let s:idx += 1
endfor

let s:ranked = (s:lsp_pos >= 0 && (s:ring_pos == -1 || s:lsp_pos < s:ring_pos))

call writefile(['ok=1', 'ranked=' . s:ranked], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script)
    assert "ranked=1" in lines


def test_req_vim_ai_006_missing_lsp_still_builds_bounded_context_without_fatal_error(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-006 missing LSP still builds bounded context without fatal error"""
    script = r"""enew
call setline(1, ["hello world"])
call cursor(1, 5)

runtime plugin/llama.vim
let s:res = llama#context#build(bufnr('%'), {'lnum': 1, 'col': 5}, llama#config#current())

call writefile(['ok=1', 'res_ok=' . s:res.ok, 'has_prefix=' . !empty(s:res.payload.input_prefix)], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script)
    assert "res_ok=1" in lines
    assert "has_prefix=1" in lines


def test_req_vim_ai_007_two_buffers_keep_independent_requests_and_ghost_text(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-007 two buffers keep independent requests and ghost text"""
    script = WAIT_UNTIL + r"""
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/slow/infill'}
runtime plugin/llama.vim

set hidden
edit buf1.txt
call setline(1, ["buf1 line"])
call cursor(1, 5)
call llama#fim(1)
let s:id1 = llama#request#snapshot(bufnr('%')).request_id

edit buf2.txt
call setline(1, ["buf2 line"])
call cursor(1, 5)
call llama#fim(1)
let s:id2 = llama#request#snapshot(bufnr('%')).request_id

" Cancel in buf1
b buf1.txt
call llama#fim_cancel()
let s:snap1 = llama#request#snapshot(bufnr('%'))

" Check buf2 remains active
b buf2.txt
let s:snap2 = llama#request#snapshot(bufnr('%'))

call writefile(['ok=1', 'p1=' . s:snap1.phase, 'p2=' . s:snap2.phase], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script, port=fake_server)
    assert "p1=cancelled" in lines
    assert ("p2=streaming" in lines) or ("p2=running" in lines)


def test_req_vim_ai_007_returning_to_a_file_reuses_deduplicated_file_keyed_chunk(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-007 returning to a file reuses deduplicated file-keyed chunk"""
    script = r"""runtime plugin/llama.vim

edit test_file.ts
call setline(1, ["function sharedCode() {}"])
call llama#context#remember(bufnr('%'))
call llama#context#remember(bufnr('%'))

let s:st = llama#context#stats()
call writefile(['ok=1', 'chunks=' . s:st.chunks], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script)
    assert "chunks=1" in lines


def test_req_vim_ai_007_secret_like_buffer_is_never_stored_in_ring_or_sent_as_extra(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-007 secret-like buffer is never stored in ring or sent as extra"""
    script = r"""runtime plugin/llama.vim

edit .env
call setline(1, ["SECRET_KEY=supersecret123"])
call llama#context#remember(bufnr('%'))

let s:st = llama#context#stats()
let s:elig = llama#config#eligibility(bufnr('%'), 1)

call writefile(['ok=1', 'chunks=' . s:st.chunks, 'allowed=' . s:elig.allowed], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script)
    assert "chunks=0" in lines
    assert "allowed=0" in lines


def test_req_vim_ai_008_offline_endpoint_keeps_startup_responsive_and_settles_unreachable_without_retry_loop(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-008 offline endpoint keeps startup responsive and settles unreachable without retry loop"""
    script = WAIT_UNTIL + r"""
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:8094/infill'}
let s:t0 = reltimefloat(reltime())
runtime plugin/llama.vim
LlamaEnable
let s:t_startup = (reltimefloat(reltime()) - s:t0) * 1000.0

let s:settled = WaitUntil('llama#status#snapshot().state ==# "unreachable"', 3000)
let s:snap = llama#status#snapshot()

call writefile(['ok=1', 'fast=' . (s:t_startup < 500), 'state=' . s:snap.state], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script)
    assert "fast=1" in lines
    assert "state=unreachable" in lines


def test_req_vim_ai_008_explicit_model_fim_stays_selected_while_discovery_enriches_metadata(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-008 explicit model_fim stays selected while discovery enriches metadata"""
    script = WAIT_UNTIL + r"""
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/models-fim/infill', 'model_fim': 'qwen38-220k'}
runtime plugin/llama.vim
LlamaEnable

let s:ready = WaitUntil('llama#status#snapshot().n_ctx > 0', 3000)
let s:snap = llama#status#snapshot()

call writefile(['ok=1', 'model=' . s:snap.model, 'n_ctx=' . s:snap.n_ctx], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script, port=fake_server)
    assert "model=qwen38-220k" in lines
    assert "n_ctx=24576" in lines


def test_req_vim_ai_008_positively_marked_fim_model_auto_selected_and_unmarked_list_keeps_default(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-008 positively marked FIM model auto-selected and unmarked list keeps default"""
    script = WAIT_UNTIL + r"""
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/models-fim/infill', 'model_fim': ''}
runtime plugin/llama.vim
LlamaEnable

let s:ready = WaitUntil('llama#status#snapshot().model ==# "fim-a"', 3000)
let s:snap = llama#status#snapshot()

call writefile(['ok=1', 'model=' . s:snap.model], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script, port=fake_server)
    assert "model=fim-a" in lines


def test_req_vim_ai_008_statusline_performs_no_io_and_llamastatus_shows_port_and_model(
    repo_root, run_cmd, env, fake_server, tmp_path
):
    """REQ-VIM-AI-008 statusline performs no I/O and LlamaStatus shows port and model"""
    script = r"""let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:8094/infill'}
runtime plugin/llama.vim
LlamaEnable

let s:str = llama#statusline()
redir => s:out
silent LlamaStatus
redir END

call writefile(['ok=1', 'has_str=' . !empty(s:str), 'has_port=' . (stridx(s:out, '8094') >= 0)], "$BATS_TEST_TMPDIR/result.txt")
qa!
"""
    lines = _vim_case(run_cmd, repo_root, tmp_path, env, script)
    assert "has_str=1" in lines
    assert "has_port=1" in lines
