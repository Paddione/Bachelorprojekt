"""Native migration of tests/spec/workspace-deploy-secrets-scope.bats."""

# (T001404)

import os
import re
import subprocess
import textwrap

import pytest
import yaml

KUBESEAL_STUB = textwrap.dedent("""\
    #!/usr/bin/env bash
    cat
    cat <<'ENVELOPE'
    ---
    apiVersion: bitnami.com/v1alpha1
    kind: SealedSecret
    metadata:
      name: stub-envelope
      namespace: stub
    spec:
      encryptedData: {}
    ENVELOPE
    """)

SCHEMA_SKIP_BASE = textwrap.dedent("""\
    version: 1
    secrets:
      - name: RUSTDESK_ID_ED25519
        required: true
        extra_namespaces:
          - namespace: rustdesk
            secret: rustdesk-secrets
            dest_key: id_ed25519
    """)

SCHEMA_KEEP = textwrap.dedent("""\
    version: 1
    secrets:
      - name: RUSTDESK_ID_ED25519
        required: true
        extra_namespaces:
          - namespace: rustdesk
            secret: rustdesk-secrets
            dest_key: id_ed25519
            owner_brand: [mentolder]
      - name: CRON_SECRET
        required: true
        extra_namespaces:
          - namespace: website
            secret: website-secrets
    """)

SECRETS_VALUES = textwrap.dedent("""\
    RUSTDESK_ID_ED25519: "stub-rustdesk-key"
    CRON_SECRET: "stub-cron-key"
    """)


@pytest.fixture
def seal(repo_root):
    script = repo_root / "scripts" / "env-seal.sh"
    if not script.is_file():
        pytest.skip(f"env-seal.sh not found at {script}")
    return str(script)


def _setup_seal_inputs(d, mode, env_name):
    """Mirror of BATS setup_seal_inputs(): build the env-seal input tree in d."""
    for sub in (".secrets", "certs", "sealed-secrets"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    (d / f"{env_name}.yaml").write_text(f"environment: {env_name}\ncontext: test-cluster\ndomain: test.local\n")
    if mode == "schema-only":
        (d / "schema.yaml").write_text(SCHEMA_SKIP_BASE)
    elif mode in ("korczewski-skip", "mentolder-keep"):
        (d / "schema.yaml").write_text(SCHEMA_KEEP)
        (d / ".secrets" / f"{env_name}.yaml").write_text(SECRETS_VALUES)
    (d / "certs" / f"{env_name}.pem").write_text("")


def _seal(run_cmd, seal, d, env_name, stub_dir):
    env = {"PATH": f"{stub_dir}{os.pathsep}{os.environ.get('PATH', '')}"}
    return run_cmd(["bash", seal, "--env", env_name, "--env-dir", str(d), "--reuse-cert"], env=env)


@pytest.fixture
def stub_dir(tmp_path):
    d = tmp_path / "kubeseal-stub"
    d.mkdir()
    stub = d / "kubeseal"
    stub.write_text(KUBESEAL_STUB)
    stub.chmod(0o755)
    return d


def test_schema_shared_namespace_entries_carry_owner_brand(repo_root):
    schema_file = repo_root / "environments" / "schema.yaml"
    if not schema_file.is_file():
        pytest.skip("environments/schema.yaml not found")
    schema = yaml.safe_load(schema_file.read_text()) or {}
    shared_ns = {"rustdesk", "coturn"}
    violations = []
    for entry in schema.get("secrets") or []:
        for mapping in entry.get("extra_namespaces") or []:
            if mapping.get("namespace") in shared_ns and not (mapping.get("owner_brand") or []):
                violations.append(f"{entry['name']} → {mapping['namespace']}")
    assert not violations, "VIOLATIONS:\n" + "\n".join(f"  - {v}" for v in violations)


def test_env_seal_korczewski_omits_shared_namespace_sealed_secret_documents(run_cmd, seal, tmp_path, stub_dir):
    work = tmp_path / "env-seal-korczewski"
    _setup_seal_inputs(work, "korczewski-skip", "korczewski")
    r = _seal(run_cmd, seal, work, "korczewski", stub_dir)
    out_file = work / "sealed-secrets" / "korczewski.yaml"
    assert out_file.is_file(), f"Output file {out_file} not created.\nrun output: {r.output}"
    hits = len(re.findall(r"namespace: rustdesk", out_file.read_text()))
    assert hits == 0, f"BUG: korczewski seal wrote {hits} rustdesk-namespace documents (expected 0).\n{out_file.read_text()}"


def test_env_seal_mentolder_keeps_shared_namespace_sealed_secret_with_owner_brand_annotation(run_cmd, seal, tmp_path, stub_dir):
    work = tmp_path / "env-seal-mentolder"
    _setup_seal_inputs(work, "mentolder-keep", "mentolder")
    r = _seal(run_cmd, seal, work, "mentolder", stub_dir)
    out_file = work / "sealed-secrets" / "mentolder.yaml"
    assert out_file.is_file(), f"Output file {out_file} not created.\nrun output: {r.output}"
    text = out_file.read_text()
    assert len(re.findall(r"namespace: rustdesk", text)) >= 1, f"BUG: mentolder seal did not include rustdesk-namespace document.\n{text}"
    assert re.search(r"secrets\.bachelorprojekt/owner-brand:.*mentolder", text), \
        f"BUG: owner-brand annotation missing or does not match mentolder.\n{text}"
