"""Native migration of tests/spec/fleet-operations/penpot-secret-keys.bats."""
from pathlib import Path

import pytest

# environments/.secrets is git-crypt encrypted where the key is absent (CI); like the
# original grep, binary content simply yields no match instead of a decode error.
PENPOT_KEYS = [
    "PENPOT_DB_PASSWORD",
    "PENPOT_SECRET_KEY",
    "PENPOT_MINIO_SECRET_KEY",
    "POCKET_ID_PENPOT_SECRET",
]
PLAINTEXT_FILES = ["fleet-mentolder.yaml", "fleet-staging.yaml"]
SEALED_FILES = ["fleet-mentolder.yaml", "staging.yaml", "mentolder.yaml"]


@pytest.fixture
def dirs(repo_root: Path):
    return {
        "secrets": repo_root / "environments" / ".secrets",
        "sealed": repo_root / "environments" / "sealed-secrets",
    }


def test_keine_penpot_keys_in_plaintext_files_t900030(dirs):
    for secret_file in PLAINTEXT_FILES:
        filepath = dirs["secrets"] / secret_file
        if not filepath.is_file():
            # Original: "File fehlt" plus 'return 0' beendet den Test erfolgreich.
            return
        lines = filepath.read_text(encoding="utf-8", errors="replace").splitlines()
        for key in PENPOT_KEYS:
            assert not any(line.startswith(f"{key}:") for line in lines), \
                f"{key} darf nicht in {filepath} vorkommen"


def test_keine_penpot_keys_in_sealedsecret_files_t900030(dirs):
    for secret_file in SEALED_FILES:
        filepath = dirs["sealed"] / secret_file
        if not filepath.is_file():
            return
        text = filepath.read_text(encoding="utf-8", errors="replace")
        for key in PENPOT_KEYS:
            assert f"{key}:" not in text, f"{key} darf nicht in {filepath} vorkommen"


def test_keine_penpot_refenzen_in_secrets_t900030(dirs):
    for secret_file in PLAINTEXT_FILES:
        filepath = dirs["secrets"] / secret_file
        if not filepath.is_file():
            continue
        text = filepath.read_text(encoding="utf-8", errors="replace").lower()
        for key in PENPOT_KEYS:
            assert key.lower() not in text, f"Penpot-Referenz '{key}' gefunden in {filepath}"
