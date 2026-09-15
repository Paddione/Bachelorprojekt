#!/usr/bin/env bats
# Pruefmodus: Output-Verifikation (Result-Files aus headless Vim, Fake-Server-Zaehler); kein Source-Grep.

setup() {
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
}

@test "REQ-VIM-AI-001 first install backs up existing vimrc before adding loader" {
  echo "\" my personal vimrc" > "$HOME/.vimrc"
  ORIG_HASH="$(sha256sum "$HOME/.vimrc" | awk '{print $1}')"

  bash "$REPO/scripts/vim/install-llama.sh" --install
  [ -f "$HOME/.vimrc" ]
  NEW_HASH="$(sha256sum "$HOME/.vimrc" | awk '{print $1}')"
  [ "$ORIG_HASH" != "$NEW_HASH" ]

  # Check backup exists with original hash
  BACKUP_COUNT="$(find "$HOME" -maxdepth 2 -name ".vimrc.backup.*" | wc -l)"
  [ "$BACKUP_COUNT" -eq 1 ]
  BACKUP_FILE="$(find "$HOME" -maxdepth 2 -name ".vimrc.backup.*")"
  BACKUP_HASH="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
  [ "$ORIG_HASH" = "$BACKUP_HASH" ]

  # Check plugin installed
  [ -f "$HOME/.vim/pack/bachelorprojekt/opt/llama-vim/plugin/llama.vim" ]
}

@test "REQ-VIM-AI-001 repeated install creates no duplicate loader block or backup" {
  echo "\" my personal vimrc" > "$HOME/.vimrc"

  bash "$REPO/scripts/vim/install-llama.sh" --install
  HASH1="$(sha256sum "$HOME/.vimrc" | awk '{print $1}')"
  BACKUP_COUNT1="$(find "$HOME" -maxdepth 2 -name ".vimrc.backup.*" | wc -l)"

  bash "$REPO/scripts/vim/install-llama.sh" --install
  HASH2="$(sha256sum "$HOME/.vimrc" | awk '{print $1}')"
  BACKUP_COUNT2="$(find "$HOME" -maxdepth 2 -name ".vimrc.backup.*" | wc -l)"

  [ "$HASH1" = "$HASH2" ]
  [ "$BACKUP_COUNT1" = "$BACKUP_COUNT2" ]
}

@test "REQ-VIM-AI-001 remove deletes only managed artifacts and keeps example copies" {
  echo "\" my personal vimrc" > "$HOME/.vimrc"
  ORIG_HASH="$(sha256sum "$HOME/.vimrc" | awk '{print $1}')"

  mkdir -p "$HOME/.unsloth/llama.cpp/examples" "$HOME/opt/llama.cpp-src/examples"
  echo "fake example 1" > "$HOME/.unsloth/llama.cpp/examples/llama.vim"
  echo "fake example 2" > "$HOME/opt/llama.cpp-src/examples/llama.vim"

  EX1_HASH="$(sha256sum "$HOME/.unsloth/llama.cpp/examples/llama.vim" | awk '{print $1}')"
  EX2_HASH="$(sha256sum "$HOME/opt/llama.cpp-src/examples/llama.vim" | awk '{print $1}')"

  bash "$REPO/scripts/vim/install-llama.sh" --install
  bash "$REPO/scripts/vim/install-llama.sh" --remove

  [ ! -d "$HOME/.vim/pack/bachelorprojekt/opt/llama-vim" ]
  POST_HASH="$(sha256sum "$HOME/.vimrc" | awk '{print $1}')"
  [ "$ORIG_HASH" = "$POST_HASH" ]

  [ "$(sha256sum "$HOME/.unsloth/llama.cpp/examples/llama.vim" | awk '{print $1}')" = "$EX1_HASH" ]
  [ "$(sha256sum "$HOME/opt/llama.cpp-src/examples/llama.vim" | awk '{print $1}')" = "$EX2_HASH" ]
}

@test "REQ-VIM-AI-001 real external example copies unchanged across install and remove" {
  REAL_HOME="/home/patrick"
  [ -f "$REAL_HOME/.unsloth/llama.cpp/examples/llama.vim" ] || skip "Real example missing"

  EX1_HASH="$(sha256sum "$REAL_HOME/.unsloth/llama.cpp/examples/llama.vim" | awk '{print $1}')"

  bash "$REPO/scripts/vim/install-llama.sh" --install
  bash "$REPO/scripts/vim/install-llama.sh" --remove

  POST_HASH="$(sha256sum "$REAL_HOME/.unsloth/llama.cpp/examples/llama.vim" | awk '{print $1}')"
  [ "$EX1_HASH" = "$POST_HASH" ]
}

@test "REQ-VIM-AI-001 dry-run install and remove write nothing" {
  BEFORE_TREE="$(find "$HOME" -type f | sort)"

  bash "$REPO/scripts/vim/install-llama.sh" --install --dry-run
  AFTER_TREE="$(find "$HOME" -type f | sort)"
  [ "$BEFORE_TREE" = "$AFTER_TREE" ]

  bash "$REPO/scripts/vim/install-llama.sh" --remove --dry-run
  AFTER_TREE2="$(find "$HOME" -type f | sort)"
  [ "$BEFORE_TREE" = "$AFTER_TREE2" ]
}

@test "REQ-VIM-AI-005 typo endpiont_fim blocks auto-FIM and suggests endpoint_fim" {
  command -v vim >/dev/null 2>&1 || skip "vim fehlt"

  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
let g:llama_config = {'endpiont_fim': 'http://127.0.0.1:8094/infill'}
runtime plugin/llama.vim

let s:res = llama#config#load()
let s:diag = join(s:res.diagnostics, '; ')
let s:elig = llama#config#eligibility(bufnr('%'), 0)

call writefile(['ok=1', 'auto_allowed=' . s:elig.allowed, 'diag=' . s:diag], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "auto_allowed=0" "$BATS_TEST_TMPDIR/result.txt"
  grep -q "endpoint_fim" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-005 excluded markdown sends no auto request while manual FIM stays available" {
  command -v vim >/dev/null 2>&1 || skip "vim fehlt"

  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
let g:llama_config = {'filetype_exclude': ['markdown']}
runtime plugin/llama.vim

set filetype=markdown
let s:auto_elig = llama#config#eligibility(bufnr('%'), 0)
let s:manual_elig = llama#config#eligibility(bufnr('%'), 1)

call writefile(['ok=1', 'auto=' . s:auto_elig.allowed, 'manual=' . s:manual_elig.allowed], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "auto=0" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "manual=1" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-005 LlamaReloadConfig applies new exclusion and debounce without re-enable" {
  command -v vim >/dev/null 2>&1 || skip "vim fehlt"

  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
runtime plugin/llama.vim
set filetype=markdown

let s:e1 = llama#config#eligibility(bufnr('%'), 0).allowed
let g:llama_config = {'filetype_exclude': ['markdown']}
LlamaReloadConfig
let s:e2 = llama#config#eligibility(bufnr('%'), 0).allowed

call writefile(['ok=1', 'before=' . s:e1, 'after=' . s:e2], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "before=1" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "after=0" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-009 effective defaults target loopback 8094 qwen38-220k 512 64 32" {
  command -v vim >/dev/null 2>&1 || skip "vim fehlt"

  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
runtime plugin/llama.vim
let s:c = llama#config#current()

call writefile([
  \ 'ok=1',
  \ 'endpoint=' . s:c.endpoint_fim,
  \ 'model=' . s:c.model_fim,
  \ 'prefix=' . s:c.n_prefix,
  \ 'suffix=' . s:c.n_suffix,
  \ 'ring=' . s:c.ring_n_chunks
  \ ], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  grep -qx "endpoint=http://127.0.0.1:8094/infill" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "model=qwen38-220k" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "prefix=512" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "suffix=64" "$BATS_TEST_TMPDIR/result.txt"
  grep -qx "ring=32" "$BATS_TEST_TMPDIR/result.txt"
}

@test "REQ-VIM-AI-009 enable and health probe run no server-management command" {
  command -v vim >/dev/null 2>&1 || skip "vim fehlt"

  cat << EOF > "$BATS_TEST_TMPDIR/case.vim"
runtime plugin/llama.vim
LlamaEnable
call writefile(['ok=1'], "$BATS_TEST_TMPDIR/result.txt")
qa!
EOF

  timeout 40 vim -Nu NONE -i NONE -n -es --cmd "set runtimepath^=$REPO/editor/llama-vim" -S "$BATS_TEST_TMPDIR/case.vim"
  [ -s "$BATS_TEST_TMPDIR/result.txt" ]
  [ ! -f "$BATS_TEST_TMPDIR/mgmt.log" ]
}
