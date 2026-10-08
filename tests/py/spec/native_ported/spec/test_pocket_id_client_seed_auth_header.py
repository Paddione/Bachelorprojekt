"""Native migration of tests/spec/pocket-id-client-seed-auth-header.bats."""

import re


def _manifest(repo_root):
    return (repo_root / "k3d" / "pocket-id-client-seed.yaml").read_text(encoding="utf-8")


def test_pocket_id_client_seed_admin_api_auth_uses_x_api_key_not_authorization_bearer(repo_root):
    # [T015100] Manifest schuetzt ${POCKET_ID_API_KEY} via $$-Escaping; beide Formen akzeptiert.
    assert re.search(r'AUTH="X-API-KEY: [$][$]?\{POCKET_ID_API_KEY\}"', _manifest(repo_root))


def test_pocket_id_client_seed_no_remaining_authorization_bearer_auth_header_for_the_admin_api(repo_root):
    assert not re.search(r'AUTH="Authorization: Bearer', _manifest(repo_root))
