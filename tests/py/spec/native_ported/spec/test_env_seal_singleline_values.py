"""env-seal only understands single-line values (T901720).

env-seal.sh and seal-extra-namespaces.sh parse .secrets files line by line:
a multi-line value is silently truncated to its first line at seal time.
Multi-line secrets must therefore be stored single-line with \\n escapes
(which kubeseal's YAML parser turns back into real newlines).
"""

import os
import re
from pathlib import Path

import pytest
import yaml

KUBESEAL_STUB = """#!/usr/bin/env bash
cat
"""

SCHEMA_ESCAPED = """version: 1
secrets:
  - name: ESCAPED_KEY
    required: true
    generate: false
    extra_namespaces:
      - namespace: website-test
        secret: website-secrets
"""
# File bytes contain a literal backslash-n inside a single-line value.
SECRETS_ESCAPED = 'ESCAPED_KEY: "alpha\\nbeta"\n'

# .secrets files consumed by env-seal (have a sealed-secrets/ output twin).
SEAL_INPUT_FILES = (
    "fleet-mentolder.yaml",
    "fleet-korczewski.yaml",
    "staging.yaml",
    "dev.yaml",
)


@pytest.fixture
def seal_script(repo_root):
    script = repo_root / "scripts" / "env-seal.sh"
    if not script.is_file():
        pytest.skip(f"env-seal.sh not found at {script}")
    return script


def _is_locked(path: Path) -> bool:
    try:
        head = path.read_bytes()[:16]
    except OSError:
        return True
    if head.startswith(b"\x00GITCRYPT"):
        return True
    try:
        path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, ValueError):
        return True
    return False


def _key_block_span(lines: "list[str]", start: int) -> int:
    """Physical line span of the KEY block starting at `start`.

    env-seal.sh reads exactly one line per key, so a value spanning more
    than one physical line is silently truncated at seal time. Both plain
    and backslash-n-escaped single-line values have span 1.
    """
    end = start
    while end < len(lines) and not lines[end].rstrip().endswith(('"', "'")):
        end += 1
    return end - start + 1


def test_env_seal_inputs_have_only_single_line_values(repo_root):
    """Every env-seal input value must fit on one physical line (T901720)."""
    secrets_dir = repo_root / "environments" / ".secrets"
    truncated = []
    for fname in SEAL_INPUT_FILES:
        path = secrets_dir / fname
        if not path.is_file():
            pytest.skip(f"{path} not found")
        if _is_locked(path):
            pytest.skip(f"{path} is git-crypt locked in this checkout")
        lines = path.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            m = re.match(r"^([A-Za-z0-9_]+):[ \t]*(.*)$", line)
            if m and _key_block_span(lines, i) > 1:
                truncated.append(f"{fname}:{m.group(1)}")
    assert not truncated, (
        "BUG (T901720): these values span multiple lines and env-seal would "
        "silently seal only their first line. Store them single-line with "
        "\\n escapes: " + ", ".join(sorted(truncated))
    )


def test_env_seal_backslash_n_escapes_survive_into_manifest(
    tmp_path, run_cmd, seal_script
):
    """\\n escapes pass the line parser through to the Secret manifest."""
    stub_dir = tmp_path / "kubeseal-stub"
    stub_dir.mkdir()
    stub = stub_dir / "kubeseal"
    stub.write_text(KUBESEAL_STUB)
    stub.chmod(0o755)

    work = tmp_path / "env-seal"
    for sub in (".secrets", "certs", "sealed-secrets"):
        (work / sub).mkdir(parents=True, exist_ok=True)
    (work / "test.yaml").write_text(
        "environment: test\ncontext: test-cluster\ndomain: test.local\n"
    )
    (work / "schema.yaml").write_text(SCHEMA_ESCAPED)
    (work / ".secrets" / "test.yaml").write_text(SECRETS_ESCAPED)
    (work / "certs" / "test.pem").write_text("")

    path = f"{stub_dir}:{os.environ.get('PATH', '')}"
    res = run_cmd(
        ["bash", str(seal_script), "--env", "test", "--env-dir", str(work), "--reuse-cert"],
        env={"PATH": path},
    )
    assert res.returncode == 0, f"seal failed unexpectedly\n{res.output}"
    output_file = work / "sealed-secrets" / "test.yaml"
    assert output_file.is_file(), "seal did not run: output file not created"
    text = output_file.read_text(encoding="utf-8")
    # The manifest kubeseal receives must keep the escape sequence intact.
    assert 'ESCAPED_KEY: "alpha\\nbeta"' in text, (
        "BUG: escape sequence lost between .secrets and Secret manifest.\n" + text
    )
    # And YAML double-quote semantics turn it back into a real newline.
    manifest = yaml.safe_load(text.split("---")[0])
    assert manifest["stringData"]["ESCAPED_KEY"] == "alpha\nbeta", (
        "BUG: manifest value does not round-trip to a real newline.\n" + text
    )
