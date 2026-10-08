"""Native migration of tests/spec/warden-mcp/launcher.bats."""

# [T900404/T900991]

import os
import subprocess

import pytest

DUMMY_SECRET = "dummy-secret-value"
DUMMY_MASTER = "dummy-master-value"
PKG = "@icoretech/warden-mcp@0.2.44"


@pytest.fixture
def home(tmp_path):
    h = tmp_path / "home"
    h.mkdir()
    return h


@pytest.fixture
def conf_dir(home):
    return home / ".config" / "warden-mcp"


def _env(home, extra=None):
    env = {k: v for k, v in os.environ.items() if not k.startswith("BW_")}
    env.update({"HOME": str(home), "USERPROFILE": str(home)})
    env.update(extra or {})
    return env


def _write_env(conf_dir, *lines):
    conf_dir.mkdir(parents=True, exist_ok=True)
    path = conf_dir / "server.env"
    path.write_text("".join(f"{l}\n" for l in lines), encoding="utf-8")
    path.chmod(0o600)


def _launch(repo_root, home, extra=None):
    proc = subprocess.run(
        ["node", str(repo_root / "scripts/warden-mcp/launch.mjs")],
        cwd=str(repo_root), env=_env(home, extra),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60,
    )
    return proc.returncode, proc.stdout.strip()


def test_launcher_refuses_to_start_without_server_env_and_names_the_expected_path(repo_root, home):
    rc, out = _launch(repo_root, home)
    assert rc != 0
    assert ".config/warden-mcp/server.env" in out


def test_launcher_refuses_to_start_when_bw_clientsecret_is_empty_and_names_the_key(repo_root, home, conf_dir):
    _write_env(conf_dir, "BW_HOST=https://vault.example.test", "BW_CLIENTID=user.dummy",
               "BW_CLIENTSECRET=", f"BW_PASSWORD='{DUMMY_MASTER}'")
    rc, out = _launch(repo_root, home)
    assert rc != 0
    assert "BW_CLIENTSECRET" in out
    assert DUMMY_MASTER not in out


def test_launcher_without_bw_password_the_launcher_falls_back_to_session_only_mode(repo_root, home, conf_dir):
    _write_env(conf_dir, "BW_HOST=https://vault.example.test", "BW_CLIENTID=user.dummy",
               f"BW_CLIENTSECRET={DUMMY_SECRET}", "BW_BIN=/usr/bin/true")
    rc, out = _launch(repo_root, home, {"WARDEN_MCP_DRY_RUN": "1"})
    assert rc == 0, out
    assert "passwort=Nur-Session" in out
    assert DUMMY_SECRET not in out


def test_launcher_a_plaintext_bw_password_still_works_but_warns_without_leaking_it(repo_root, home, conf_dir):
    _write_env(conf_dir, "BW_HOST=https://vault.example.test", "BW_CLIENTID=user.dummy",
               f"BW_CLIENTSECRET={DUMMY_SECRET}", f"BW_PASSWORD='{DUMMY_MASTER}'", "BW_BIN=/usr/bin/true")
    rc, out = _launch(repo_root, home, {"WARDEN_MCP_DRY_RUN": "1"})
    assert rc == 0, out
    assert "BW_PASSWORD steht im Klartext" in out
    assert "passwort=server.env" in out
    assert DUMMY_MASTER not in out


def test_launcher_dry_run_resolves_the_pinned_package_without_leaking_secret_values(repo_root, home, conf_dir):
    _write_env(conf_dir, "BW_HOST=https://vault.example.test", "BW_CLIENTID=user.dummy",
               f"BW_CLIENTSECRET={DUMMY_SECRET}", f"BW_PASSWORD='{DUMMY_MASTER}'", "BW_BIN=/usr/bin/true")
    rc, out = _launch(repo_root, home, {"WARDEN_MCP_DRY_RUN": "1"})
    assert rc == 0, out
    assert PKG in out
    assert "--stdio" in out
    assert "bw-profiles" in out
    assert DUMMY_SECRET not in out
    assert DUMMY_MASTER not in out


def test_launcher_a_bitwarden_cli_newer_than_2026_6_x_only_warns_and_does_not_block_the_start(repo_root, home, conf_dir, tmp_path):
    _write_env(conf_dir, "BW_HOST=https://vault.example.test", "BW_CLIENTID=user.dummy",
               f"BW_CLIENTSECRET={DUMMY_SECRET}", f"BW_PASSWORD='{DUMMY_MASTER}'")
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    bw = fake_bin / "bw"
    bw.write_text('#!/bin/sh\necho "Bitwarden CLI 2026.9.0"\n', encoding="utf-8")
    bw.chmod(0o755)
    rc, out = _launch(repo_root, home, {
        "PATH": f"{fake_bin}:{os.environ.get('PATH', '')}",
        "WARDEN_MCP_DRY_RUN": "1",
    })
    assert rc == 0, out
    assert "2026.9.0" in out
    assert PKG in out
