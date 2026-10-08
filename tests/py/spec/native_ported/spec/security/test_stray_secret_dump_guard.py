"""Native migration of tests/spec/security/stray-secret-dump-guard.bats."""

GUARD = "scripts/stray-secret-dump-guard.sh"


def test_stray_ws_secret_dump_in_target_dir_guard_fails_and_names_the_file(run_cmd, repo_root, tmp_path):
    scan_dir = tmp_path / "scan-secret"
    scan_dir.mkdir()
    (scan_dir / "ws-secret.json").write_text(
        '{"apiVersion":"v1","kind":"Secret","data":{"ANTHROPIC_API_KEY":"c2stZmFrZQ=="}}', encoding="utf-8")
    r = run_cmd(["bash", str(repo_root / GUARD), "--dir", str(scan_dir)])
    assert r.returncode != 0, "expected: FAIL (guard must detect the stray ws-secret.json dump)\n" + r.output
    assert "ws-secret.json" in r.output, "expected: FAIL (guard should name the offending file)\n" + r.output


def test_clean_target_dir_guard_exits_0(run_cmd, repo_root, tmp_path):
    clean_dir = tmp_path / "scan-clean"
    clean_dir.mkdir()
    (clean_dir / "normal.txt").write_text("no secret dump\n", encoding="utf-8")
    r = run_cmd(["bash", str(repo_root / GUARD), "--dir", str(clean_dir)])
    assert r.returncode == 0, "expected: FAIL (guard must let a clean dir pass)\n" + r.output


def test_stray_secret_dump_guard_skips_node_modules_and_worktrees_during_scan(run_cmd, repo_root, tmp_path):
    scan_dir = tmp_path / "scan-prune"
    (scan_dir / "node_modules").mkdir(parents=True)
    (scan_dir / ".worktrees" / "nested").mkdir(parents=True)
    (scan_dir / "node_modules" / "ws-secret.json").write_text('{"kind":"Secret"}', encoding="utf-8")
    (scan_dir / ".worktrees" / "nested" / "ws-secret.json").write_text('{"kind":"Secret"}', encoding="utf-8")
    (scan_dir / "normal.txt").write_text("clean root\n", encoding="utf-8")
    r = run_cmd(["bash", str(repo_root / GUARD), "--dir", str(scan_dir)])
    assert r.returncode == 0, "expected: FAIL (node_modules and .worktrees must be pruned)\n" + r.output
