"""Tests for three-way secret consistency (migrated from tests/unit/secrets-sync.bats)."""

from pathlib import Path
import yaml


def _schema_keys(schema_path: Path) -> set[str]:
    with open(schema_path) as f:
        data = yaml.safe_load(f)
    return {s["name"] for s in data.get("secrets", [])}


def _schema_keys_required_in_dev(schema_path: Path) -> set[str]:
    with open(schema_path) as f:
        data = yaml.safe_load(f)
    return {s["name"] for s in data.get("secrets", []) if s.get("dev_absent") is not True}


def _schema_required_keys(schema_path: Path) -> set[str]:
    with open(schema_path) as f:
        data = yaml.safe_load(f)
    return {s["name"] for s in data.get("secrets", []) if s.get("required", False)}


def _dev_workspace_keys(dev_secrets_path: Path) -> set[str]:
    with open(dev_secrets_path) as f:
        docs = list(yaml.safe_load_all(f))
    keys = set()
    for doc in docs:
        if doc and doc.get("kind") == "Secret" and doc.get("metadata", {}).get("name") == "workspace-secrets":
            data = doc.get("stringData") or doc.get("data") or {}
            keys.update(data.keys())
    return keys


def _sealed_keys(sealed_file_path: Path) -> set[str]:
    with open(sealed_file_path) as f:
        docs = list(yaml.safe_load_all(f))
    keys = set()
    for doc in docs:
        if not doc:
            continue
        if doc.get("metadata", {}).get("name") != "workspace-secrets":
            continue
        enc = doc.get("spec", {}).get("encryptedData", {})
        keys.update(enc.keys())
    return keys


def test_every_schema_secret_exists_in_dev_secrets(repo_root: Path):
    schema_path = repo_root / "environments" / "schema.yaml"
    dev_path = repo_root / "k3d" / "secrets.yaml"

    required_in_dev = _schema_keys_required_in_dev(schema_path)
    dev_keys = _dev_workspace_keys(dev_path)

    missing = sorted(required_in_dev - dev_keys)
    assert not missing, f"Keys in schema but missing from k3d/secrets.yaml: {missing}"


def test_every_dev_secret_exists_in_schema(repo_root: Path):
    schema_path = repo_root / "environments" / "schema.yaml"
    dev_path = repo_root / "k3d" / "secrets.yaml"

    all_schema_keys = _schema_keys(schema_path)
    dev_keys = _dev_workspace_keys(dev_path)

    orphans = sorted(dev_keys - all_schema_keys)
    assert not orphans, f"Keys in k3d/secrets.yaml but missing from schema (orphans): {orphans}"


def test_every_required_schema_secret_exists_in_fleet_mentolder(repo_root: Path):
    schema_path = repo_root / "environments" / "schema.yaml"
    sealed_path = repo_root / "environments" / "sealed-secrets" / "fleet-mentolder.yaml"

    required = _schema_required_keys(schema_path)
    sealed = _sealed_keys(sealed_path)

    missing = sorted(required - sealed)
    assert not missing, f"Required keys in schema but missing from fleet-mentolder.yaml: {missing}"


def test_every_required_schema_secret_exists_in_fleet_korczewski(repo_root: Path):
    schema_path = repo_root / "environments" / "schema.yaml"
    sealed_path = repo_root / "environments" / "sealed-secrets" / "fleet-korczewski.yaml"

    required = _schema_required_keys(schema_path)
    sealed = _sealed_keys(sealed_path)

    missing = sorted(required - sealed)
    assert not missing, f"Required keys in schema but missing from fleet-korczewski.yaml: {missing}"
