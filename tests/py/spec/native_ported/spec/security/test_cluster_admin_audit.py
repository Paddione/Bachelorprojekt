"""Native migration of tests/spec/security/cluster-admin-audit.bats."""

SCRIPT = "scripts/security/cluster-admin-audit.sh"
FIXTURES = "tests/spec/security/fixtures"


def test_1_3_1_audit_passes_on_allowlisted_bindings(run_cmd, repo_root):
    assert (repo_root / SCRIPT).is_file(), f"erwartet: {SCRIPT}"
    r = run_cmd(["bash", str(repo_root / SCRIPT), "--file", str(repo_root / FIXTURES / "crb-allowlisted.json")])
    assert r.returncode == 0, r.output
    # Positiv-Anker: "7" ist in der Ausgabe (Allowlist mit 7 Bindings).
    assert "7" in r.output, f"Erwartet 7 cluster-admin bindings in output: {r.output}"


def test_1_3_2_audit_reports_an_unmanaged_cluster_admin_serviceaccount(run_cmd, repo_root):
    r = run_cmd(["bash", str(repo_root / SCRIPT), "--file", str(repo_root / FIXTURES / "crb-dev-deployer.json")])
    assert r.returncode == 1, r.output
    assert "dev-deployer" in r.output, f"Erwartet 'dev-deployer' in output: {r.output}"
    assert "kube-system/dev-deployer" in r.output, f"Erwartet 'kube-system/dev-deployer' in output: {r.output}"


def test_1_3_3_audit_rejects_missing_input(run_cmd, repo_root):
    r = run_cmd(["bash", str(repo_root / SCRIPT), "--file", "/nonexistent/path/file.json"])
    assert r.returncode == 2, r.output


def test_1_3_3b_audit_shows_help_when_no_arguments_given(run_cmd, repo_root):
    r = run_cmd(["bash", "-c", f"bash '{repo_root / SCRIPT}' 2>&1"])
    assert r.returncode == 2, r.output
    assert "--file" in r.output or "--context" in r.output or "Usage" in r.output, f"Kein Usage/Help gefunden: {r.output}"
