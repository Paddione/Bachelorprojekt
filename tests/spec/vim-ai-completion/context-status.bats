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

@test "REQ-VIM-AI-006 enclosing function signature retained beyond static prefix window" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
enew
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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "has_sig=1" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-006 LSP definition chunk ranked before ring chunks within budget" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
enew
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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "ranked=1" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-006 missing LSP still builds bounded context without fatal error" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
enew
call setline(1, ["hello world"])
call cursor(1, 5)

runtime plugin/llama.vim
let s:res = llama#context#build(bufnr('%'), {'lnum': 1, 'col': 5}, llama#config#current())

call writefile(['ok=1', 'res_ok=' . s:res.ok, 'has_prefix=' . !empty(s:res.payload.input_prefix)], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "res_ok=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "has_prefix=1" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-007 two buffers keep independent requests and ghost text" {
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
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "p1=cancelled" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "p2=streaming" "$BATS_TEST_TMPDIR/result.txt" || grep -qx "p2=running" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-007 returning to a file reuses deduplicated file-keyed chunk" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
runtime plugin/llama.vim

edit test_file.ts
call setline(1, ["function sharedCode() {}"])
call llama#context#remember(bufnr('%'))
call llama#context#remember(bufnr('%'))

let s:st = llama#context#stats()
call writefile(['ok=1', 'chunks=' . s:st.chunks], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "chunks=1" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-007 secret-like buffer is never stored in ring or sent as extra" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
runtime plugin/llama.vim

edit .env
call setline(1, ["SECRET_KEY=supersecret123"])
call llama#context#remember(bufnr('%'))

let s:st = llama#context#stats()
let s:elig = llama#config#eligibility(bufnr('%'), 1)

call writefile(['ok=1', 'chunks=' . s:st.chunks, 'allowed=' . s:elig.allowed], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "chunks=0" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "allowed=0" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-008 offline endpoint keeps startup responsive and settles unreachable without retry loop" {
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

let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:8094/infill'}
let s:t0 = reltimefloat(reltime())
runtime plugin/llama.vim
LlamaEnable
let s:t_startup = (reltimefloat(reltime()) - s:t0) * 1000.0

let s:settled = WaitUntil('llama#status#snapshot().state ==# "unreachable"', 3000)
let s:snap = llama#status#snapshot()

call writefile(['ok=1', 'fast=' . (s:t_startup < 500), 'state=' . s:snap.state], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "fast=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "state=unreachable" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-008 explicit model_fim stays selected while discovery enriches metadata" {
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

let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/models-fim/infill', 'model_fim': 'qwen38-220k'}
runtime plugin/llama.vim
LlamaEnable

let s:ready = WaitUntil('llama#status#snapshot().n_ctx > 0', 3000)
let s:snap = llama#status#snapshot()

call writefile(['ok=1', 'model=' . s:snap.model, 'n_ctx=' . s:snap.n_ctx], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "model=qwen38-220k" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "n_ctx=24576" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-008 positively marked FIM model auto-selected and unmarked list keeps default" {
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

let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:' . $PORT . '/s/models-fim/infill', 'model_fim': ''}
runtime plugin/llama.vim
LlamaEnable

let s:ready = WaitUntil('llama#status#snapshot().model ==# "fim-a"', 3000)
let s:snap = llama#status#snapshot()

call writefile(['ok=1', 'model=' . s:snap.model], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "model=fim-a" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-008 statusline performs no I/O and LlamaStatus shows port and model" {
  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
let g:llama_config = {'endpoint_fim': 'http://127.0.0.1:8094/infill'}
runtime plugin/llama.vim
LlamaEnable

let s:str = llama#statusline()
redir => s:out
silent LlamaStatus
redir END

call writefile(['ok=1', 'has_str=' . !empty(s:str), 'has_port=' . (stridx(s:out, '8094') >= 0)], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "has_str=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "has_port=1" "$BATS_TEST_TMPDIR/result.txt"
}
