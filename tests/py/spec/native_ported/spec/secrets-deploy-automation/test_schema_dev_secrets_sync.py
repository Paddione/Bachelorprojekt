"""Native migration of tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats."""

import yaml
import pytest

LEGACY = [
    "BRAINSTORM_OIDC_SECRET", "CLAUDE_CODE_OIDC_SECRET", "COMFY_OIDC_SECRET",
    "DOCS_OIDC_SECRET", "MAIL_OIDC_SECRET", "NEXTCLOUD_OIDC_SECRET",
    "RECOVERY_OIDC_SECRET", "TRAEFIK_OIDC_SECRET", "VAULTWARDEN_OIDC_SECRET",
    "WEBSITE_OIDC_SECRET",
]


@pytest.fixture
def paths(repo_root):
    return {"schema": repo_root / "environments/schema.yaml", "dev": repo_root / "k3d/secrets.yaml"}


def _load(path):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _dev_keys(dev_path):
    keys = set()
    with open(dev_path, encoding="utf-8") as fh:
        for doc in yaml.safe_load_all(fh):
            if doc and doc.get("kind") == "Secret" and (doc.get("metadata") or {}).get("name") == "workspace-secrets":
                keys |= set((doc.get("stringData") or doc.get("data") or {}).keys())
    return keys


def test_every_dev_absent_secret_carries_a_non_empty_dev_absent_reason_and_is_not_required(paths):
    schema = _load(paths["schema"])
    secs = schema.get("secrets") or []
    total = len(secs)
    dev_absent = sum(1 for x in secs if x.get("dev_absent") is True)
    # Positiv-Anker (T002356-M1)
    assert total > 0
    assert dev_absent > 0

    bad = []
    for x in secs:
        if x.get("dev_absent") is not True:
            continue
        if not str(x.get("dev_absent_reason", "") or "").strip():
            bad.append(f"{x['name']}: dev_absent without dev_absent_reason")
        if x.get("required") is True:
            bad.append(f"{x['name']}: required:true must not be dev_absent")
    assert not bad, "\n".join(bad)


def test_no_dev_absent_secret_is_present_in_k3d_secrets_yaml_workspace_secrets(paths):
    schema = _load(paths["schema"])
    absent = {x["name"] for x in (schema.get("secrets") or []) if x.get("dev_absent") is True}
    dev = _dev_keys(paths["dev"])
    # Positiv-Anker: beide Seiten muessen Eintraege haben.
    assert dev and absent, "Anker: leere Schluesselmengen"
    stale = sorted(absent & dev)
    assert not stale, "\n".join(f"stale dev_absent annotation (key IS present in dev): {k}" for k in stale)


def test_legacy_keycloak_era_oidc_secret_keys_are_gone_from_k3d_secrets_yaml_workspace_secrets(paths):
    schema = _load(paths["schema"])
    known = {x["name"] for x in (schema.get("secrets") or [])}
    dev = _dev_keys(paths["dev"])
    successors = sorted(k for k in known if k.startswith("POCKET_ID_") and k.endswith("_SECRET"))
    # Positiv-Anker: Nachfolger-Familie im Schema und Dev-Schluessel vorhanden.
    assert dev, "Anker: keine dev-Schluessel"
    assert len(successors) >= 10, "Anker: zu wenige POCKET_ID_*_SECRET-Nachfolger"
    found = sorted(k for k in LEGACY if k in dev)
    assert not found, "\n".join(f"legacy Keycloak key still in dev secrets: {k}" for k in found)


def test_pocket_id_claude_code_secret_is_declared_in_environments_schema_yaml(paths):
    schema = _load(paths["schema"])
    known = {x["name"] for x in (schema.get("secrets") or [])}
    assert known, "Anker: schema_secrets leer"
    assert "POCKET_ID_CLAUDE_CODE_SECRET" in known
