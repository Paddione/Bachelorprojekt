"""Native migration of tests/spec/security/alibaba-token-key-guard.bats."""

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def scan_dir():
    """Scan directory outside the repo and outside tmp paths (BATS teardown cleanup)."""
    holder = {"path": None}
    yield holder
    if holder["path"]:
        shutil.rmtree(holder["path"], ignore_errors=True)


def test_gitleaks_config_erfasst_das_alibaba_token_format_sk_separated_api_key(run_cmd, repo_root, scan_dir):
    if shutil.which("gitleaks") is None:
        pytest.skip("gitleaks nicht installiert (CI: security-scan-Job deckt den Scan ab)")
    # Positiv-Anker: ein plaintext-Key im sk-sp-Format MUSS einen Fund ausloesen.
    # Scan-Verzeichnis ohne 'tmp' im Pfad (/dev/shm), siehe Original T011580.
    if not os.path.isdir("/dev/shm"):
        pytest.skip("kein /dev/shm vorhanden — Test braucht einen Scan-Pfad ohne 'tmp'-Segment")
    scan = Path(tempfile.mkdtemp(prefix="alk.", dir="/dev/shm"))
    scan_dir["path"] = str(scan)
    shutil.copy(repo_root / "tests" / "spec" / "security" / "fixtures" / "alibaba-token-key-leak.txt", scan)
    r = run_cmd(
        ["gitleaks", "detect", "--config", str(repo_root / ".gitleaks.toml"), "--no-git",
         "--source", str(scan / "alibaba-token-key-leak.txt")],
    )
    assert r.returncode == 1, r.output
    assert "leaks found" in r.output


def test_agent_models_jsonc_enthaelt_keinen_plaintext_sk_api_key(repo_root):
    text = (repo_root / ".opencode" / "agent-models.jsonc").read_text(encoding="utf-8")
    # Positiv-Anker: mindestens ein Provider ist definiert.
    assert '"llamacpp-local"' in text
    # Negativ: kein sk-...-Token und kein apiKey-Feld mit sk-...-Wert.
    assert not re.search(r"sk-[A-Za-z0-9._-]{20,}", text)
    assert not re.search(r'"apiKey"[ \t]*:[ \t]*"sk-', text)
