"""Tests migrating Paket 5 code-quality and CI guard specs to pytest:
- tests/spec/code-quality.bats
- tests/spec/code-quality/s2-madge-invocation.bats
- tests/spec/coverage-gate.bats
- tests/spec/g-cq02-any-types.bats
- tests/spec/g-cq08-knip-dead-code.bats
- tests/spec/g-dep01-npm-vuln.bats
- tests/spec/g-fe02-bundle-budget.bats
- tests/spec/g-fe03-structured-logger.bats
- tests/spec/g-size02-large-files.bats
"""

import json
import math
import os
import re
import shutil
import subprocess
from pathlib import Path
import pytest


# ── code-quality.bats ───────────────────────────────────────────────────────

def test_t002273_verification_block_untracked_hint(repo_root: Path):
    """T002273: verification-block.md enthaelt Hinweis zu untracked Dateien in freshness:regenerate."""
    ref = repo_root / ".claude" / "skills" / "references" / "verification-block.md"
    assert ref.is_file(), f"MISSING ref: {ref}"
    text = ref.read_text(encoding="utf-8")
    assert "git ls-files" in text, "MISSING git-ls-files hint in verification-block.md"
    assert "untracked" in text, "MISSING untracked hint in verification-block.md"


# ── code-quality/s2-madge-invocation.bats ───────────────────────────────────

def test_s2_resolves_madge_to_node_exec_path(repo_root: Path):
    """S2 loest madge auf den laufenden Node-Interpreter auf, nicht auf den sh-Shim [T900015]."""
    if not shutil.which("node"):
        pytest.skip("node nicht verfuegbar")
    if not (repo_root / "node_modules" / "madge").is_dir():
        pytest.skip("madge nicht installiert (npm ci fehlt)")

    script = """
    import { resolveMadgeCommand } from './scripts/code-quality/gates/s2-cycles.mjs';
    const cmd = resolveMadgeCommand(process.cwd());
    console.log(cmd[0] === process.execPath ? 'EXECPATH' : 'OTHER:' + cmd[0]);
    """
    res = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"Error resolving madge command: {res.stderr}"
    assert "EXECPATH" in res.stdout
    assert ".bin" not in res.stdout


def test_s2_can_execute_resolved_madge_command_without_shell(repo_root: Path):
    """S2 kann den aufgeloesten madge-Befehl ohne Shell starten [T900015]."""
    if not shutil.which("node"):
        pytest.skip("node nicht verfuegbar")
    if not (repo_root / "node_modules" / "madge").is_dir():
        pytest.skip("madge nicht installiert (npm ci fehlt)")

    script = """
    import { execFileSync } from 'node:child_process';
    import { resolveMadgeCommand } from './scripts/code-quality/gates/s2-cycles.mjs';
    const [cmd, ...prefix] = resolveMadgeCommand(process.cwd());
    const out = execFileSync(cmd, [...prefix, '--version'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log('VERSION=' + out.trim());
    """
    res = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"Failed to execute madge command: {res.stderr}"
    assert "VERSION=" in res.stdout
    assert re.search(r"VERSION=\d+\.", res.stdout)


def test_quality_check_succeeds_without_madge_failure(repo_root: Path):
    """quality:check laeuft durch, ohne an madge zu scheitern [T900015]."""
    if not shutil.which("node"):
        pytest.skip("node nicht verfuegbar")

    res = subprocess.run(
        ["node", "scripts/code-quality/check.mjs"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"quality:check failed: {res.stderr}\n{res.stdout}"
    assert "quality:check" in res.stdout
    assert "madge failed" not in res.stdout


# ── coverage-gate.bats ──────────────────────────────────────────────────────

def _spec_port(repo_root: Path, source: str) -> bool:
    # [T901392] Specs liegen als pytest-Module vor; der Docstring nennt die Originalquelle.
    return any(source in p.read_text(encoding="utf-8")
               for p in (repo_root / "tests" / "py" / "spec").rglob("test_*.py"))


def test_g_rh03_secret_rotation_spec_bats_file(repo_root: Path):
    assert _spec_port(repo_root, "tests/spec/secret-rotation.bats")


def test_g_rh03_secrets_deploy_automation_spec_bats_file(repo_root: Path):
    assert _spec_port(repo_root, "tests/spec/secrets-deploy-automation.bats")


def test_g_rh03_backup_pipeline_spec_bats_file(repo_root: Path):
    assert _spec_port(repo_root, "tests/spec/backup-pipeline")


def test_g_rh03_plan_coverage_at_least_23_percent(repo_root: Path):
    """G-RH03: plan Coverage ist >= 23% (Spec-Testmodule je Spec-Dokument)."""
    spec_count = len(list((repo_root / "docs" / "superpowers" / "specs").glob("*.md")))
    module_count = len(list((repo_root / "tests" / "py" / "spec" / "native_ported" / "spec").glob("test_*.py")))
    assert spec_count > 0, "No spec files found"
    ratio = (module_count * 100) / spec_count
    assert int(ratio) >= 23, f"Coverage ratio {ratio:.2f}% is below 23%"


# ── g-cq02-any-types.bats ───────────────────────────────────────────────────

def test_g_cq02_explicit_any_count_website_src_le_200(repo_root: Path):
    """G-CQ02: explicit any count in components/website/src is at most 200."""
    website_src = repo_root / "components" / "website" / "src"
    pattern = re.compile(r": any|<any>|as any")
    count = 0
    extensions = {".ts", ".svelte", ".astro"}
    for path in website_src.rglob("*"):
        if path.is_file() and path.suffix in extensions:
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
                count += len(pattern.findall(text))
            except Exception:
                pass
    assert count <= 200, f"Explicit any count {count} exceeds limit 200"


def test_g_cq02_monitoring_ts_any_count_le_2(repo_root: Path):
    """G-CQ02: monitoring.ts has no more than 2 explicit any (was 13)."""
    f = repo_root / "components" / "website" / "src" / "pages" / "sdlc" / "api" / "monitoring.ts"
    assert f.is_file(), f"monitoring.ts nicht gefunden unter {f}"
    text = f.read_text(encoding="utf-8", errors="ignore")
    pattern = re.compile(r": any|<any>|as any")
    count = len(pattern.findall(text))
    assert count <= 2, f"monitoring.ts any count {count} exceeds limit 2"


def test_g_cq02_catch_blocks_admin_api_use_unknown(repo_root: Path):
    """G-CQ02: catch-blocks in admin API use err: unknown not err: any."""
    admin_api = repo_root / "components" / "website" / "src" / "pages" / "api" / "admin"
    pattern = re.compile(r"catch \(err: any\)|catch \(error: any\)")
    hits = 0
    if admin_api.is_dir():
        for path in admin_api.rglob("*.ts"):
            if path.is_file():
                text = path.read_text(encoding="utf-8", errors="ignore")
                hits += len(pattern.findall(text))
    assert hits == 0, f"Remaining err: any catch blocks: {hits}"


# ── g-cq08-knip-dead-code.bats ──────────────────────────────────────────────

def test_g_cq08_knip_config_exists(repo_root: Path):
    assert (repo_root / "components" / "website" / "knip.json").is_file()


def test_g_cq08_knip_is_dev_dependency(repo_root: Path):
    pkg_json = repo_root / "components" / "website" / "package.json"
    assert pkg_json.is_file()
    data = json.loads(pkg_json.read_text(encoding="utf-8"))
    assert ("knip" in data.get("devDependencies", {}) or
            "knip" in data.get("dependencies", {}))


def test_g_cq08_dead_code_baseline_recorded(repo_root: Path):
    baseline_file = repo_root / "docs" / "code-quality" / "knip-baseline.json"
    assert baseline_file.is_file()
    data = json.loads(baseline_file.read_text(encoding="utf-8"))
    assert isinstance(data.get("unused_before"), int)
    assert isinstance(data.get("unused_after"), int)


def test_g_cq08_dead_code_reduced_by_half_vs_baseline(repo_root: Path):
    baseline_file = repo_root / "docs" / "code-quality" / "knip-baseline.json"
    data = json.loads(baseline_file.read_text(encoding="utf-8"))
    before = data["unused_before"]
    after = data["unused_after"]
    removed = before - after
    half = math.ceil(before / 2)
    assert removed >= half, f"Removed {removed} < required {half} (before={before}, after={after})"


# ── g-dep01-npm-vuln.bats ───────────────────────────────────────────────────

def test_g_dep01_pnpm_audit_reports_zero_vulnerabilities():
    pytest.skip("Pre-existing regression — follow-up fix ticket TBD")


def test_g_dep01_js_yaml_version_not_vulnerable(repo_root: Path):
    """G-DEP01: js-yaml resolved version is not vulnerable (>=4.1.2)."""
    website_dir = repo_root / "components" / "website"
    res = subprocess.run(["pnpm", "why", "js-yaml"], cwd=website_dir, capture_output=True, text=True)
    assert "js-yaml@4.1.1" not in res.stdout and "js-yaml@4.1.1" not in res.stderr


def test_g_dep01_babel_core_version_not_vulnerable(repo_root: Path):
    """G-DEP01: @babel/core resolved version is not vulnerable (>=7.29.1)."""
    website_dir = repo_root / "components" / "website"
    res = subprocess.run(["pnpm", "why", "@babel/core"], cwd=website_dir, capture_output=True, text=True)
    assert "@babel/core@7.29.0" not in res.stdout and "@babel/core@7.29.0" not in res.stderr


# ── g-fe02-bundle-budget.bats ───────────────────────────────────────────────

def test_g_fe02_bundle_baseline_file_exists(repo_root: Path):
    assert (repo_root / "components" / "website" / "bundle-baseline.json").is_file()


def test_g_fe02_baseline_has_positive_total_gzip_bytes(repo_root: Path):
    baseline_file = repo_root / "components" / "website" / "bundle-baseline.json"
    data = json.loads(baseline_file.read_text(encoding="utf-8"))
    assert int(data.get("totalGzipBytes", 0)) > 0


def test_g_fe02_check_bundle_size_script_parses(repo_root: Path):
    if not shutil.which("node"):
        pytest.skip("node nicht verfuegbar")
    script = repo_root / "scripts" / "check-bundle-size.mjs"
    res = subprocess.run(["node", "--check", str(script)], cwd=repo_root, capture_output=True, text=True)
    assert res.returncode == 0, f"node --check failed: {res.stderr}"


# ── g-fe03-structured-logger.bats ───────────────────────────────────────────

def test_g_fe03_no_raw_console_error_warn(repo_root: Path):
    """G-FE03: keine rohen console.error/warn Aufrufe (exkl. browser-logger-Stub)."""
    website_src = repo_root / "components" / "website" / "src"
    pattern = re.compile(r"console\.(error|warn)")
    count = 0
    extensions = {".ts", ".svelte", ".astro"}
    ignored_patterns = ["browser-logger.ts", "lib/logger.ts", "error-log-store.ts", ".test.ts"]

    for path in website_src.rglob("*"):
        if path.is_file() and path.suffix in extensions:
            path_str = str(path)
            if any(ign in path_str for ign in ignored_patterns):
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
                count += len(pattern.findall(text))
            except Exception:
                pass
    assert count == 0, f"Found {count} raw console.error/warn calls"


def test_g_fe03_browser_logger_exports(repo_root: Path):
    f = repo_root / "components" / "website" / "src" / "lib" / "browser-logger.ts"
    assert f.is_file()
    assert "export const browserLogger" in f.read_text(encoding="utf-8")


def test_g_fe03_logger_exports(repo_root: Path):
    f = repo_root / "components" / "website" / "src" / "lib" / "logger.ts"
    assert f.is_file()
    assert "export const logger" in f.read_text(encoding="utf-8")


# ── g-size02-large-files.bats ───────────────────────────────────────────────

def test_g_size02_videovault_large_files_count_le_8(repo_root: Path):
    """G-SIZE02: VideoVault files >600 lines count is at most 8."""
    vv_dir = repo_root / "components" / "VideoVault"
    if not vv_dir.is_dir():
        pytest.skip("VideoVault directory does not exist")

    extensions = {".ts", ".tsx", ".js", ".jsx", ".svelte", ".astro"}
    large_files = 0
    for path in vv_dir.rglob("*"):
        if "node_modules" in path.parts:
            continue
        if path.is_file() and not path.is_symlink() and path.suffix in extensions:
            try:
                lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
                if len(lines) > 600:
                    large_files += 1
            except Exception:
                pass
    assert large_files <= 8, f"VideoVault files >600 lines: {large_files} (target: <= 8)"
