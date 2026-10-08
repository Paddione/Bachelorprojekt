"""Native migration of tests/local/mandatory-sequences.bats."""

# Regression test: verify critical task sequences still exist.
# These sequences are documented in CLAUDE.md for cluster-reset and feature deployments.

def _task_list(repo_root, run_cmd):
    return run_cmd(["task", "--list-all"], cwd=repo_root, timeout=120)


def _assert_task_listed(repo_root, run_cmd, name):
    listing = _task_list(repo_root, run_cmd)
    listing.check(0)
    assert name in listing.output, f"task {name} missing from `task --list-all`"


def test_cluster_reset_sequence_task_exists_sealed_secrets_install(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "sealed-secrets:install")


def test_cluster_reset_sequence_task_exists_env_fetch_cert(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "env:fetch-cert")


def test_cluster_reset_sequence_task_exists_env_seal(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "env:seal")


def test_cluster_reset_sequence_task_exists_cert_install(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "cert:install")


def test_cluster_reset_sequence_task_exists_workspace_deploy(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "workspace:deploy")


def test_feature_fan_out_task_exists_feature_website(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "feature:website")


def test_feature_fan_out_task_exists_feature_brett(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "feature:brett")


def test_feature_fan_out_task_exists_feature_deploy(repo_root, run_cmd):
    _assert_task_listed(repo_root, run_cmd, "feature:deploy")


# NOTE: the flux:sync / flux:status tasks were removed with the Flux GitOps
# teardown. Fleet is push-based (no reconciler), so there is no flux task to assert.


def test_workspace_validate_runs_without_error(repo_root, run_cmd):
    result = run_cmd(["task", "workspace:validate"], cwd=repo_root, timeout=300)
    result.check(0)


def test_admin_actions_migration_file_exists(repo_root):
    assert (repo_root / "components/website/src/db/migrations/20260525_admin_actions.sql").is_file()


def test_admin_api_ts_helper_exists_and_is_valid(repo_root):
    path = repo_root / "components/website/src/lib/admin-api.ts"
    assert path.is_file()
    assert "export async function apiCall" in path.read_text(encoding="utf-8")


def test_admin_api_ts_exports_toast_function(repo_root):
    path = repo_root / "components/website/src/lib/admin-api.ts"
    assert "export function toast" in path.read_text(encoding="utf-8")
