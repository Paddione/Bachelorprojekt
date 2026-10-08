"""Native migration of tests/spec/local-llm-proxy/bge-token-ssot.bats."""

import os
import re
import stat

import pytest


def write_env_var(path, key, val):
    """Python port of write_env_var() from the BATS source (same semantics)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "a").close()
    os.chmod(path, 0o600)
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines(keepends=True)
    if any(l.startswith(f"{key}=") for l in lines):
        kept = [l for l in lines if not l.startswith(f"{key}=")]
        kept.append(f"{key}={val}\n")
        with open(path, "w", encoding="utf-8") as fh:
            fh.writelines(kept)
        os.chmod(path, 0o600)
    else:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(f"{key}={val}\n")


def _count_lines(path, pattern):
    rx = re.compile(pattern)
    text = path.read_text(encoding="utf-8", errors="replace")
    return sum(1 for l in text.splitlines() if rx.search(l))


def test_bge_token_ssot_t002559_die_ssot_fuehrt_bge_mcp_token_als_schluessel(repo_root):
    ssot = repo_root / "environments/.secrets/dev-tools.yaml"
    assert ssot.is_file()
    # In CI ist git-crypt gesperrt: Binaerinhalt mit GITCRYPT-Signatur -> Skip.
    head = ssot.read_bytes()[:9]
    if b"GITCRYPT" in head:
        pytest.skip("git-crypt gesperrt (CI) — Schluesselnamen nicht lesbar")
    assert _count_lines(ssot, r"^GITHUB_PERSONAL_ACCESS_TOKEN:") == 1
    assert _count_lines(ssot, r"^BGE_MCP_TOKEN:") == 1


def test_bge_token_ssot_t002559_install_sh_bricht_ab_wenn_der_wert_leer_ist(repo_root):
    install = repo_root / "dotfiles/install.sh"
    assert _count_lines(install, "BGE_MCP_TOKEN_VAL") > 1
    assert _count_lines(install, re.escape('z "$BGE_MCP_TOKEN_VAL"')) == 1


def test_bge_token_ssot_t002559_write_env_var_legt_die_datei_mit_0600_an(tmp_path):
    f = tmp_path / "neu" / "proxy.env"
    write_env_var(str(f), "BGE_MCP_TOKEN", "platzhalter-a")
    assert f.is_file()
    assert stat.S_IMODE(os.stat(f).st_mode) == 0o600
    assert _count_lines(f, r"^BGE_MCP_TOKEN=platzhalter-a$") == 1


def test_bge_token_ssot_t002559_ein_zweiter_lauf_dupliziert_den_eintrag_nicht(tmp_path):
    f = tmp_path / "proxy.env"
    write_env_var(str(f), "BGE_MCP_TOKEN", "platzhalter-alt")
    write_env_var(str(f), "BGE_MCP_TOKEN", "platzhalter-neu")
    assert _count_lines(f, r"^BGE_MCP_TOKEN=") == 1
    assert _count_lines(f, r"^BGE_MCP_TOKEN=platzhalter-neu$") == 1


def test_bge_token_ssot_t002559_andere_eintraege_der_datei_bleiben_erhalten(tmp_path):
    f = tmp_path / "proxy.env"
    f.write_text("LLM_PROXY_PORT=18235\n", encoding="utf-8")
    write_env_var(str(f), "BGE_MCP_TOKEN", "platzhalter-b")
    assert _count_lines(f, r"^LLM_PROXY_PORT=18235$") == 1
    assert _count_lines(f, r"^BGE_MCP_TOKEN=") == 1


def test_bge_token_ssot_t002559_beide_verbraucher_werden_beliefert(repo_root):
    install = repo_root / "dotfiles/install.sh"
    assert _count_lines(install, "llm-proxy/proxy.env") > 0
    assert _count_lines(install, "bge-mcp/server.env") > 0
