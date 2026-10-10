"""Tests for the grouped export mode of scripts/generate-bitwarden-export.py."""

import importlib.util
import json
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "scripts" / "generate-bitwarden-export.py"

FIXTURE_SCHEMA = {
    "derivation": {"version": 1},
    "groups": [
        {"name": "db", "suffix": ["_DB_PASSWORD"]},
        {"name": "oidc", "prefix": ["POCKET_ID_"], "suffix": ["_OIDC_SECRET"]},
        {"name": "api", "suffix": ["_API_KEY", "_TOKEN"]},
        {"name": "mail", "prefix": ["SMTP_"]},
        {"name": "network", "prefix": ["WG_MESH_"], "exact": ["SIGNALING_SECRET"]},
        {"name": "ssh", "suffix": ["_SSH_PRIVATE_KEY"]},
        {"name": "misc"},
    ],
    "secrets": [
        {"name": "A_DB_PASSWORD", "required": True, "generate": True, "length": 32},
        {"name": "B_TOKEN", "required": False, "generate": True, "length": 32,
         "derive_version": 3},
        {"name": "C_KEEP", "required": False, "generate": True, "derived": False},
        {"name": "SMTP_PASSWORD", "required": True, "generate": False},
        {"name": "ANTHROPIC_API_KEY", "required": False, "generate": False},
        {"name": "SIGNALING_SECRET", "required": False, "generate": False},
    ],
    "env_vars": [],
    "setup_vars": [],
}

FIXTURE_SECRETS = {
    "A_DB_PASSWORD": "pw-a",
    "B_TOKEN": "tok-b",
    "C_KEEP": "keep-c",
    "SMTP_PASSWORD": "smtp-pw",
    "ANTHROPIC_API_KEY": "anthropic-key",
    "SIGNALING_SECRET": "sig",
}

FIXTURE_ENV = {"env_vars": {}, "setup_vars": {}}


@pytest.fixture(scope="module")
def exporter():
    spec = importlib.util.spec_from_file_location("bitwarden_export", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def fixture_env(tmp_path):
    env_dir = tmp_path / "env"
    secrets_dir = env_dir / ".secrets"
    export_dir = env_dir / ".export"
    secrets_dir.mkdir(parents=True)
    (env_dir / "schema.yaml").write_text(yaml.safe_dump(FIXTURE_SCHEMA))
    for tenant in ("mentolder", "korczewski"):
        (env_dir / f"fleet-{tenant}.yaml").write_text(yaml.safe_dump(FIXTURE_ENV))
        (secrets_dir / f"fleet-{tenant}.yaml").write_text(yaml.safe_dump(FIXTURE_SECRETS))
    return {"env_dir": env_dir, "secrets_dir": secrets_dir, "export_dir": export_dir}


def test_match_group_families(exporter):
    groups = FIXTURE_SCHEMA["groups"]
    assert exporter.match_group("A_DB_PASSWORD", groups) == "db"
    assert exporter.match_group("POCKET_ID_X_SECRET", groups) == "oidc"
    assert exporter.match_group("BRETT_OIDC_SECRET", groups) == "oidc"
    assert exporter.match_group("ANTHROPIC_API_KEY", groups) == "api"
    assert exporter.match_group("SMTP_PASSWORD", groups) == "mail"
    assert exporter.match_group("WG_MESH_NODE_PRIVATE", groups) == "network"
    assert exporter.match_group("SIGNALING_SECRET", groups) == "network"
    assert exporter.match_group("BOX_SSH_PRIVATE_KEY", groups) == "ssh"
    assert exporter.match_group("SOMETHING_ELSE", groups) == "misc"


def test_match_group_first_match_wins(exporter):
    groups = FIXTURE_SCHEMA["groups"]
    # Matches both db (suffix) and oidc (prefix) — db is ordered first.
    assert exporter.match_group("POCKET_ID_DB_PASSWORD", groups) == "db"


def test_grouped_export_layout(exporter, fixture_env):
    reports = exporter.build_grouped_export(
        env_dir=str(fixture_env["env_dir"]),
        secrets_dir=str(fixture_env["secrets_dir"]),
        export_dir=str(fixture_env["export_dir"]),
    )
    assert set(reports) == {"Mentolder", "Korczewski"}
    for tenant in ("mentolder", "korczewski"):
        path = fixture_env["export_dir"] / f"{tenant}.json"
        assert path.exists()
        data = json.loads(path.read_text())
        assert data["brand"] == tenant
        assert data["derivation_version"] == 1
        # Must-store keys grouped WITH values.
        assert data["groups"]["mail"] == {"SMTP_PASSWORD": "smtp-pw"}
        assert data["groups"]["api"] == {"ANTHROPIC_API_KEY": "anthropic-key"}
        assert data["groups"]["network"] == {"SIGNALING_SECRET": "sig"}
        assert data["groups"]["misc"] == {"C_KEEP": "keep-c"}
        # Derivable keys as references WITHOUT values.
        assert set(data["derived"]) == {"A_DB_PASSWORD", "B_TOKEN"}
        for ref in data["derived"].values():
            assert ref["derived"] is True
            assert "value" not in ref and "password" not in ref
        assert data["derived"]["A_DB_PASSWORD"]["version"] == 1
        assert data["derived"]["B_TOKEN"]["version"] == 3
        assert data["derived"]["A_DB_PASSWORD"]["group"] == "db"


def test_grouped_export_never_embeds_secret_values(exporter, fixture_env):
    exporter.build_grouped_export(
        env_dir=str(fixture_env["env_dir"]),
        secrets_dir=str(fixture_env["secrets_dir"]),
        export_dir=str(fixture_env["export_dir"]),
    )
    for tenant in ("mentolder", "korczewski"):
        text = (fixture_env["export_dir"] / f"{tenant}.json").read_text()
        assert "pw-a" not in text
        assert "tok-b" not in text


def test_bitwarden_default_smoke_stable_counts(exporter, fixture_env, tmp_path):
    out = tmp_path / "bitwarden.json"
    reports, total = exporter.build_bitwarden_export(
        env_dir=str(fixture_env["env_dir"]),
        secrets_dir=str(fixture_env["secrets_dir"]),
        output_path=str(out),
    )
    # Per tenant: 6 secret items + 6 web logins + 1 third-party
    # (ANTHROPIC_API_KEY present) + 1 bundled note = 14.
    assert total == 28
    assert set(reports) == {"Mentolder", "Korczewski"}
    data = json.loads(out.read_text())
    assert data["encrypted"] is False
    assert len(data["folders"]) == 2
    assert len(data["items"]) == 28
    names = [i["name"] for i in data["items"]]
    assert "[Mentolder] A_DB_PASSWORD" in names
    assert "[Korczewski] Bundled Non-Secret Environment Configuration" in names
    # Second run is byte-identical (uuid5-deterministic, stable counts).
    out2 = tmp_path / "bitwarden2.json"
    _, total2 = exporter.build_bitwarden_export(
        env_dir=str(fixture_env["env_dir"]),
        secrets_dir=str(fixture_env["secrets_dir"]),
        output_path=str(out2),
    )
    assert total2 == total
    assert out2.read_bytes() == out.read_bytes()


def test_no_writes_outside_fixture(exporter, fixture_env, tmp_path):
    repo_output = REPO_ROOT / "bitwarden.json"
    repo_export_dir = REPO_ROOT / "environments" / ".export"
    assert not repo_output.exists()
    assert not repo_export_dir.exists()
    exporter.build_grouped_export(
        env_dir=str(fixture_env["env_dir"]),
        secrets_dir=str(fixture_env["secrets_dir"]),
        export_dir=str(fixture_env["export_dir"]),
    )
    exporter.build_bitwarden_export(
        env_dir=str(fixture_env["env_dir"]),
        secrets_dir=str(fixture_env["secrets_dir"]),
        output_path=str(tmp_path / "bitwarden.json"),
    )
    assert not repo_output.exists()
    assert not repo_export_dir.exists()


def test_real_schema_has_derivation_and_groups():
    schema = yaml.safe_load((REPO_ROOT / "environments" / "schema.yaml").read_text())
    assert schema["derivation"]["version"] == 1
    assert [g["name"] for g in schema["groups"]] == [
        "db", "oidc", "api", "mail", "network", "ssh", "misc",
    ]
