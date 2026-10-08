"""Native migration of tests/spec/vim-ai-completion/install-config.bats."""
# Installer runs (bash scripts/vim/install-llama.sh) operate on a tmp HOME; every bare command of

# the original (non-zero exit fails a bats test) is asserted explicitly here.

import hashlib
import os
import shutil
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


def _shim(path: Path, body: str, tmp: Path) -> None:
    path.write_text(body.replace("@TMP@", str(tmp)), encoding="utf-8")
    os.chmod(path, 0o755)


@pytest.fixture
def env(tmp_path: Path):
    (tmp_path / "home").mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _shim(bin_dir / "curl", CURL_SHIM, tmp_path)
    for cmd in MGMT_CMDS:
        _shim(bin_dir / cmd, MGMT_SHIM.replace("@CMD@", cmd), tmp_path)
    return {
        "HOME": str(tmp_path / "home"),
        "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
    }


@pytest.fixture
def home(env) -> Path:
    return Path(env["HOME"])


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _backups(home: Path) -> list:
    """find $HOME -maxdepth 2 -name '.vimrc.backup.*'"""
    return sorted(list(home.glob(".vimrc.backup.*")) + list(home.glob("*/.vimrc.backup.*")))


def _tree(home: Path) -> list:
    """find $HOME -type f | sort"""
    return sorted(str(p) for p in home.rglob("*") if p.is_file())


def _installer(run_cmd, repo_root: Path, env: dict, *args: str):
    return run_cmd(["bash", str(repo_root / "scripts" / "vim" / "install-llama.sh"), *args], env=env)


def test_req_vim_ai_001_first_install_backs_up_existing_vimrc_before_adding_loader(repo_root, run_cmd, env, home):
    """REQ-VIM-AI-001 first install backs up existing vimrc before adding loader"""
    (home / ".vimrc").write_text('" my personal vimrc\n', encoding="utf-8")
    orig_hash = _sha(home / ".vimrc")

    assert _installer(run_cmd, repo_root, env, "--install").returncode == 0
    assert (home / ".vimrc").is_file()
    assert _sha(home / ".vimrc") != orig_hash

    backups = _backups(home)
    assert len(backups) == 1
    assert _sha(backups[0]) == orig_hash

    assert (home / ".vim" / "pack" / "bachelorprojekt" / "opt" / "llama-vim" / "plugin" / "llama.vim").is_file()


def test_req_vim_ai_001_repeated_install_creates_no_duplicate_loader_block_or_backup(repo_root, run_cmd, env, home):
    """REQ-VIM-AI-001 repeated install creates no duplicate loader block or backup"""
    (home / ".vimrc").write_text('" my personal vimrc\n', encoding="utf-8")

    assert _installer(run_cmd, repo_root, env, "--install").returncode == 0
    hash1 = _sha(home / ".vimrc")
    backup_count1 = len(_backups(home))

    assert _installer(run_cmd, repo_root, env, "--install").returncode == 0
    hash2 = _sha(home / ".vimrc")
    backup_count2 = len(_backups(home))

    assert hash1 == hash2
    assert backup_count1 == backup_count2


def test_req_vim_ai_001_remove_deletes_only_managed_artifacts_and_keeps_example_copies(repo_root, run_cmd, env, home):
    """REQ-VIM-AI-001 remove deletes only managed artifacts and keeps example copies"""
    (home / ".vimrc").write_text('" my personal vimrc\n', encoding="utf-8")
    orig_hash = _sha(home / ".vimrc")

    ex1 = home / ".unsloth" / "llama.cpp" / "examples" / "llama.vim"
    ex2 = home / "opt" / "llama.cpp-src" / "examples" / "llama.vim"
    ex1.parent.mkdir(parents=True)
    ex2.parent.mkdir(parents=True)
    ex1.write_text("fake example 1\n", encoding="utf-8")
    ex2.write_text("fake example 2\n", encoding="utf-8")
    ex1_hash = _sha(ex1)
    ex2_hash = _sha(ex2)

    assert _installer(run_cmd, repo_root, env, "--install").returncode == 0
    assert _installer(run_cmd, repo_root, env, "--remove").returncode == 0

    assert not (home / ".vim" / "pack" / "bachelorprojekt" / "opt" / "llama-vim").exists()
    assert _sha(home / ".vimrc") == orig_hash
    assert _sha(ex1) == ex1_hash
    assert _sha(ex2) == ex2_hash


def test_req_vim_ai_001_real_external_example_copies_unchanged_across_install_and_remove(repo_root, run_cmd, env):
    """REQ-VIM-AI-001 real external example copies unchanged across install and remove"""
    real = Path("/home/patrick/.unsloth/llama.cpp/examples/llama.vim")
    if not real.is_file():
        pytest.skip("Real example missing")
    ex1_hash = _sha(real)

    assert _installer(run_cmd, repo_root, env, "--install").returncode == 0
    assert _installer(run_cmd, repo_root, env, "--remove").returncode == 0

    assert _sha(real) == ex1_hash


def test_req_vim_ai_001_dry_run_install_and_remove_write_nothing(repo_root, run_cmd, env, home):
    """REQ-VIM-AI-001 dry-run install and remove write nothing"""
    before = _tree(home)

    assert _installer(run_cmd, repo_root, env, "--install", "--dry-run").returncode == 0
    assert _tree(home) == before

    assert _installer(run_cmd, repo_root, env, "--remove", "--dry-run").returncode == 0
    assert _tree(home) == before


def test_req_vim_ai_005_typo_endpiont_fim_blocks_auto_fim_and_suggests_endpoint_fim(repo_root, run_cmd, env, tmp_path):
    """REQ-VIM-AI-005 typo endpiont_fim blocks auto-FIM and suggests endpoint_fim"""
    if shutil.which("vim") is None:
        pytest.skip("vim fehlt")
    case = tmp_path / "case.vim"
    result_file = tmp_path / "result.txt"
    case.write_text(
        "let g:llama_config = {'endpiont_fim': 'http://127.0.0.1:8094/infill'}\n"
        "runtime plugin/llama.vim\n\n"
        "let s:res = llama#config#load()\n"
        "let s:diag = join(s:res.diagnostics, '; ')\n"
        "let s:elig = llama#config#eligibility(bufnr('%'), 0)\n\n"
        f"call writefile(['ok=1', 'auto_allowed=' . s:elig.allowed, 'diag=' . s:diag], \"{result_file}\")\n"
        "qa!\n",
        encoding="utf-8",
    )
    _run_vim(run_cmd, repo_root, env, case)
    lines = _result(result_file)
    assert "auto_allowed=0" in lines
    assert any("endpoint_fim" in l for l in lines)


def test_req_vim_ai_005_excluded_markdown_sends_no_auto_request_while_manual_fim_stays_available(
    repo_root, run_cmd, env, tmp_path
):
    """REQ-VIM-AI-005 excluded markdown sends no auto request while manual FIM stays available"""
    if shutil.which("vim") is None:
        pytest.skip("vim fehlt")
    case = tmp_path / "case.vim"
    result_file = tmp_path / "result.txt"
    case.write_text(
        "let g:llama_config = {'filetype_exclude': ['markdown']}\n"
        "runtime plugin/llama.vim\n\n"
        "set filetype=markdown\n"
        "let s:auto_elig = llama#config#eligibility(bufnr('%'), 0)\n"
        "let s:manual_elig = llama#config#eligibility(bufnr('%'), 1)\n\n"
        f"call writefile(['ok=1', 'auto=' . s:auto_elig.allowed, 'manual=' . s:manual_elig.allowed], \"{result_file}\")\n"
        "qa!\n",
        encoding="utf-8",
    )
    _run_vim(run_cmd, repo_root, env, case)
    lines = _result(result_file)
    assert "auto=0" in lines
    assert "manual=1" in lines


def test_req_vim_ai_005_llamareloadconfig_applies_new_exclusion_and_debounce_without_re_enable(
    repo_root, run_cmd, env, tmp_path
):
    """REQ-VIM-AI-005 LlamaReloadConfig applies new exclusion and debounce without re-enable"""
    if shutil.which("vim") is None:
        pytest.skip("vim fehlt")
    case = tmp_path / "case.vim"
    result_file = tmp_path / "result.txt"
    case.write_text(
        "runtime plugin/llama.vim\n"
        "set filetype=markdown\n\n"
        "let s:e1 = llama#config#eligibility(bufnr('%'), 0).allowed\n"
        "let g:llama_config = {'filetype_exclude': ['markdown']}\n"
        "LlamaReloadConfig\n"
        "let s:e2 = llama#config#eligibility(bufnr('%'), 0).allowed\n\n"
        f"call writefile(['ok=1', 'before=' . s:e1, 'after=' . s:e2], \"{result_file}\")\n"
        "qa!\n",
        encoding="utf-8",
    )
    _run_vim(run_cmd, repo_root, env, case)
    lines = _result(result_file)
    assert "before=1" in lines
    assert "after=0" in lines


def test_req_vim_ai_009_effective_defaults_target_loopback_8094_qwen38_220k_512_64_32(repo_root, run_cmd, env, tmp_path):
    """REQ-VIM-AI-009 effective defaults target loopback 8094 qwen38-220k 512 64 32"""
    if shutil.which("vim") is None:
        pytest.skip("vim fehlt")
    case = tmp_path / "case.vim"
    result_file = tmp_path / "result.txt"
    case.write_text(
        "runtime plugin/llama.vim\n"
        "let s:c = llama#config#current()\n\n"
        "call writefile([\n"
        "  \\ 'ok=1',\n"
        "  \\ 'endpoint=' . s:c.endpoint_fim,\n"
        "  \\ 'model=' . s:c.model_fim,\n"
        "  \\ 'prefix=' . s:c.n_prefix,\n"
        "  \\ 'suffix=' . s:c.n_suffix,\n"
        "  \\ 'ring=' . s:c.ring_n_chunks\n"
        f"  \\ ], \"{result_file}\")\n"
        "qa!\n",
        encoding="utf-8",
    )
    _run_vim(run_cmd, repo_root, env, case)
    lines = _result(result_file)
    assert "endpoint=http://127.0.0.1:8094/infill" in lines
    assert "model=qwen38-220k" in lines
    assert "prefix=512" in lines
    assert "suffix=64" in lines
    assert "ring=32" in lines


def test_req_vim_ai_009_enable_and_health_probe_run_no_server_management_command(repo_root, run_cmd, env, tmp_path):
    """REQ-VIM-AI-009 enable and health probe run no server-management command"""
    if shutil.which("vim") is None:
        pytest.skip("vim fehlt")
    case = tmp_path / "case.vim"
    result_file = tmp_path / "result.txt"
    case.write_text(
        "runtime plugin/llama.vim\n"
        "LlamaEnable\n"
        f"call writefile(['ok=1'], \"{result_file}\")\n"
        "qa!\n",
        encoding="utf-8",
    )
    _run_vim(run_cmd, repo_root, env, case)
    assert result_file.is_file() and result_file.stat().st_size > 0
    # mgmt.log wird von den Shims nur bei Aufruf eines Management-Befehls geschrieben.
    assert not (tmp_path / "mgmt.log").exists()


def _run_vim(run_cmd, repo_root: Path, env: dict, case: Path) -> None:
    run_cmd(["timeout", "40", "vim", "-Nu", "NONE", "-i", "NONE", "-n", "-es",
             "--cmd", f"set runtimepath^={repo_root}/editor/llama-vim", "-S", str(case)],
            env=env, timeout=120)


def _result(result_file: Path) -> set:
    if not (result_file.is_file() and result_file.stat().st_size > 0):
        pytest.fail("result.txt fehlt oder leer")
    return set(result_file.read_text(encoding="utf-8").splitlines())
