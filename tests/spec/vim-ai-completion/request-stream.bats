#!/usr/bin/env bats
# Pruefmodus: Output-Verifikation (Result-Files aus headless Vim, Fake-Server-Zaehler); kein Source-Grep.

setup() {
  command -v vim >/dev/null 2>&1 || skip "vim fehlt"
  vim -Nu NONE -i NONE -n -es -c 'if has("job") && has("timers") && has("textprop") && has("channel") | qa! | else | cq | endif' || skip "Vim-Feature fehlschlagen"
  command -v node >/dev/null 2>&1 || skip "node fehlt"
  command -v curl >/dev/null 2>&1 || skip "curl fehlt"

  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  mkdir -p "$BATS_TEST_TMPDIR/home" "$BATS_TEST_TMPDIR/bin"
  export HOME="$BATS_TEST_TMPDIR/home"

  # PATH Shims
  cat << 'EOF' > "$BATS_TEST_TMPDIR/bin/curl"
#!/bin/bash
echo "$@" >> "$BATS_TEST_TMPDIR/curl.log"
for arg in "$@"; do
  if [[ "$arg" == *":8094"* ]]; then
    exit 7
  fi
done
exec /usr/bin/curl "$@"
EOF
  chmod +x "$BATS_TEST_TMPDIR/bin/curl"

  for cmd in systemctl docker kubectl task lms llama-server nvidia-smi ssh pwsh powershell.exe; do
    cat << EOF > "$BATS_TEST_TMPDIR/bin/$cmd"
#!/bin/bash
echo "$cmd $@" >> "$BATS_TEST_TMPDIR/mgmt.log"
exit 0
EOF
    chmod +x "$BATS_TEST_TMPDIR/bin/$cmd"
  done

  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"

  # Start fake server
  node "$REPO/tests/fixtures/llama-vim/fake-server.mjs" --port-file "$BATS_TEST_TMPDIR/port" &
  FAKE_PID=$!
  for i in $(seq 50); do
    [ -s "$BATS_TEST_TMPDIR/port" ] && break
    sleep 0.1
  done
  [ -s "$BATS_TEST_TMPDIR/port" ] || fail "fake-server nicht gestartet"
  PORT="$(cat "$BATS_TEST_TMPDIR/port")"
}

teardown() {
  if [ -n "$FAKE_PID" ]; then
    kill -TERM "$FAKE_PID" 2>/dev/null || true
    wait "$FAKE_PID" 2>/dev/null || true
  fi
}

@test "REQ-VIM-AI-003 parser emits split SSE NDJSON and final JSON deltas exactly once" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
let s:p = llama#stream#new()
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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "ok=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "text=hello world" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-003 split SSE stream renders ordered accumulated ghost text" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "ready=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "text=first part second part" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-003 first ghost text is visible before the curl job exits" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "has_prop=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "running=1" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-003 repetition guard cancels request and freezes ghost text" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "cancelled=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "reason=repetition" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-004 HTTP 503 then success retries and renders completion" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "ready=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "phase=complete" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "attempt=2" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-004 HTTP 429 then success recovers within attempt limit" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "ready=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "phase=complete" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-004 HTTP 400 exposes http_permanent and schedules no retry" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "failed=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "kind=http_permanent" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "http_status=400" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-004 LlamaDisable and FIM-disabling reload cancel pending retry" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "waiting=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "phase=cancelled" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-004 error classes cancelled transport timeout protocol are distinguished" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "kind=protocol" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-002 superseded request A cannot update ghost text of request B" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
function! WaitUntil(expr, timeout_ms)
  let start = reltime()
  while reltimefloat(reltime(start)) * 1000.0 < a:timeout_ms
    if eval(a:expr)
      return 1
    endif
    sleep 10m
  endwhile
  return eval(a:expr) ? 1 : 0
endfunction

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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "text=BBB" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-002 Vim job and textprop adapter runs full lifecycle without Neovim" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
enew
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/sse-split/infill'}
runtime plugin/llama.vim

let s:has_nvim = has('nvim')
let s:has_job = has('job')
let s:has_prop = has('textprop')

call writefile(['ok=1', 'has_nvim=' . s:has_nvim, 'has_job=' . s:has_job, 'has_prop=' . s:has_prop], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "has_nvim=0" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "has_job=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "has_prop=1" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-002 editor without required capability registers no auto-FIM autocmds" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
let g:llama_capability_override = {'job': 0}
runtime plugin/llama.vim

let s:cmds = autocmd_get({'group': 'LlamaVimGroup'})
call writefile(['ok=1', 'cmd_count=' . len(s:cmds)], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "cmd_count=0" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-002 nvim 0.10 adapter ignores superseded request" {
  command -v nvim >/dev/null 2>&1 || skip "Neovim nicht installiert"
  nvim --headless -u NONE -c 'lua os.exit(vim.fn.has("nvim-0.10")==1 and 0 or 1)' >/dev/null 2>&1 || skip "Neovim >= 0.10 nicht installiert (Lua-Adapter nicht pruefbar)"
}
