"""Native migration of tests/spec/pocket-id-client-seed-secret-writeback.bats."""

import re


def _manifest(repo_root):
    return (repo_root / "k3d" / "pocket-id-client-seed.yaml").read_text(encoding="utf-8")


def _awk_block(text: str, start_re: str, stop_re: str) -> str:
    """awk '/start/{f=1} f&&/stop/{exit} f' — Zeilen ab Start bis vor der Stop-Zeile."""
    out, f = [], False
    for line in text.splitlines():
        if re.search(start_re, line):
            f = True
        if f and re.search(stop_re, line):
            break
        if f:
            out.append(line)
    return "\n".join(out)


def test_existing_client_branch_does_not_call_post_secret(repo_root):
    output = _awk_block(_manifest(repo_root), r'-X PUT -H "\$AUTH" -H "\$CT"', "else")
    assert '/secret" </dev/null)' not in output, "existing-client branch still rotates the secret"


def test_create_branch_writes_the_generated_secret_back_via_patch_secret(repo_root):
    assert re.search(r'patch_secret "\$secret_key" "\$plaintext"', _manifest(repo_root))


def test_patch_secret_uses_the_jobs_own_service_account_token_not_a_hardcoded_credential(repo_root):
    assert "${KSA_DIR}/token" in _manifest(repo_root)


def test_job_runs_under_a_dedicated_non_default_service_account(repo_root):
    assert re.search(r"serviceAccountName: pocket-id-client-seed", _manifest(repo_root))


def test_rbac_role_is_scoped_to_exactly_the_workspace_secrets_object(repo_root):
    text = (repo_root / "k3d" / "pocket-id-client-seed-rbac.yaml").read_text(encoding="utf-8")
    assert re.search(r'resourceNames: \["workspace-secrets"\]', text)


def test_rbac_role_grants_only_get_patch_no_broader_verbs(repo_root):
    lines = (repo_root / "k3d" / "pocket-id-client-seed-rbac.yaml").read_text(encoding="utf-8").splitlines()
    out = []
    for i, line in enumerate(lines):
        if 'resourceNames: ["workspace-secrets"]' in line:
            out.extend(lines[i:i + 2])
    assert 'verbs: ["get", "patch"]' in "\n".join(out)


def test_rbac_is_wired_into_the_k3d_kustomization(repo_root):
    assert re.search(r"pocket-id-client-seed-rbac\.yaml", (repo_root / "k3d" / "kustomization.yaml").read_text(encoding="utf-8"))
