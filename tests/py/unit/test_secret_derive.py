"""Tests for scripts/secret-derive.py (HKDF-SHA256 secret derivation)."""

import importlib.util
import string
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "scripts" / "secret-derive.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("secret_derive", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def derive_mod():
    return _load_module()


@pytest.fixture()
def seed() -> bytes:
    return bytes(range(32))


def test_rfc5869_case1(derive_mod):
    """HKDF-Primitive matches RFC 5869 Test Case 1 (SHA-256)."""
    ikm = bytes([0x0B] * 22)
    salt = bytes(range(0x00, 0x0D))
    info = bytes(range(0xF0, 0xFA))
    expected = bytes.fromhex(
        "3cb25f25faacd57a90434f64d0362f2a"
        "2d2d0a90cf1a5a4c5db02d56ecc4c5bf"
        "34007208d5b887185865"
    )
    assert derive_mod.hkdf(salt, ikm, info, 42) == expected


def test_derive_deterministic(derive_mod, seed):
    first = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, 32, "hex")
    second = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, 32, "hex")
    assert first == second


def test_derive_version_sensitive(derive_mod, seed):
    v1 = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, 32, "hex")
    v2 = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 2, 32, "hex")
    assert v1 != v2


def test_derive_brand_separation(derive_mod, seed):
    a = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, 32, "hex")
    b = derive_mod.derive(seed, "korczewski", "SHARED_DB_PASSWORD", 1, 32, "hex")
    assert a != b


def test_derive_key_separation(derive_mod, seed):
    a = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, 32, "hex")
    b = derive_mod.derive(seed, "mentolder", "WEBSITE_DB_PASSWORD", 1, 32, "hex")
    assert a != b


@pytest.mark.parametrize(
    ("encoding", "alphabet"),
    [
        ("hex", set(string.hexdigits.lower())),
        ("base64url", set(string.ascii_letters + string.digits + "-_")),
        ("alnum", set(string.ascii_letters + string.digits)),
    ],
)
def test_derive_encoding_alphabet_and_length(derive_mod, seed, encoding, alphabet):
    value = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, 32, encoding)
    assert len(value) == 32
    assert set(value) <= alphabet


def test_derive_length_respected(derive_mod, seed):
    for length in (16, 24, 48, 64):
        value = derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, length, "hex")
        assert len(value) == length


def test_derive_unknown_encoding_raises(derive_mod, seed):
    with pytest.raises(ValueError, match="encoding"):
        derive_mod.derive(seed, "mentolder", "SHARED_DB_PASSWORD", 1, 32, "rot13")


def test_cli_missing_seed_file_exits_nonzero(tmp_path, capsys):
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--brand",
            "mentolder",
            "--key",
            "SHARED_DB_PASSWORD",
            "--seed-file",
            str(tmp_path / "does-not-exist"),
        ],
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
    assert proc.stdout == ""
    assert "seed" in proc.stderr.lower()


def test_cli_single_key_roundtrip(tmp_path):
    seed_file = tmp_path / "seed"
    seed_file.write_bytes(bytes(range(32)))
    first = subprocess.run(
        [sys.executable, str(SCRIPT), "--brand", "mentolder",
         "--key", "SHARED_DB_PASSWORD", "--seed-file", str(seed_file)],
        capture_output=True,
        text=True,
    )
    second = subprocess.run(
        [sys.executable, str(SCRIPT), "--brand", "mentolder",
         "--key", "SHARED_DB_PASSWORD", "--seed-file", str(seed_file)],
        capture_output=True,
        text=True,
    )
    assert first.returncode == 0
    assert first.stdout.strip() == second.stdout.strip()
    assert len(first.stdout.strip()) == 32


def test_cli_key_and_all_are_mutually_exclusive(tmp_path):
    seed_file = tmp_path / "seed"
    seed_file.write_bytes(bytes(range(32)))
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--brand", "mentolder", "--key", "X",
         "--all", "--seed-file", str(seed_file)],
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
