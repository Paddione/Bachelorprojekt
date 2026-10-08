"""Native migration of tests/spec/application-pipeline/auto-sync.bats."""

import time

import pytest


def _lib(repo_root):
    return repo_root / "scripts/lib/application-pipeline-auto-sync.sh"


def _db_lib(repo_root):
    return repo_root / "scripts/lib/application-pipeline-db.sh"


def _cli(repo_root):
    return repo_root / "scripts/vda/apply/auto-sync.sh"


def _fn(run_cmd, repo_root, name, *args, cwd=None):
    """Source the auto-sync and db libraries, then call production function `name` with args."""
    return run_cmd(
        ["bash", "-c", 'source "$1"; source "$2"; shift 2; "$@"', "bash",
         str(_lib(repo_root)), str(_db_lib(repo_root)), name, *args],
        cwd=cwd,
    )


def _sql(run_cmd, repo_root, sql):
    return run_cmd(
        ["bash", "-c", 'source "$1"; source "$2"; shift 2; _app_pipeline_exec_sql "$@"', "bash",
         str(_lib(repo_root)), str(_db_lib(repo_root)), sql]
    )


@pytest.fixture
def ts():
    return str(time.time_ns())


def test_t900231_application_pipeline_auto_sync_sh_exists(repo_root):
    assert _lib(repo_root).is_file()


def test_t900231_app_pipeline_sync_json_file_function_is_available_after_source(repo_root, run_cmd):
    result = run_cmd(
        ["bash", "-c", 'source "$1"; command -v app_pipeline_sync_json_file >/dev/null 2>&1',
         "bash", str(_lib(repo_root))]
    )
    assert result.returncode == 0, result.output


def test_t900231_auto_sync_cli_exists_and_is_executable(repo_root):
    import os
    assert _cli(repo_root).is_file()
    assert os.access(_cli(repo_root), os.X_OK)


def test_t900231_sync_json_file_requires_path_argument(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_json_file")
    assert "JSON path required" in result.output


def test_t900231_sync_json_file_rejects_non_existent_file(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_json_file", "/nonexistent/path.json")
    assert "file not found" in result.output


def test_t900231_sync_json_file_creates_job_from_json_entry(repo_root, run_cmd, tmp_path, ts):
    json_file = tmp_path / "jobs.json"
    comp = f"TestCorp{ts}"
    json_file.write_text(
        "{\n"
        '  "jobs": [\n'
        "    {\n"
        f'      "company": "{comp}",\n'
        '      "role": "Platform Engineer",\n'
        '      "source_url": "https://testcorp.com/careers/platform",\n'
        '      "requirements": "Kubernetes CI/CD Terraform",\n'
        '      "status": "found"\n'
        "    }\n"
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_json_file", str(json_file))
    assert comp in result.stdout


def test_t900231_sync_json_file_handles_bare_json_array(repo_root, run_cmd, tmp_path, ts):
    json_file = tmp_path / "jobs.json"
    comp = f"ArrayCorp{ts}"
    json_file.write_text(
        "[\n"
        "  {\n"
        f'    "company": "{comp}",\n'
        '    "role": "DevOps Lead",\n'
        '    "requirements": "Docker Kubernetes",\n'
        '    "status": "found"\n'
        "  }\n"
        "]\n",
        encoding="utf-8",
    )
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_json_file", str(json_file))
    assert comp in result.stdout


def test_t900231_sync_json_file_rejects_invalid_json_structure(repo_root, run_cmd, tmp_path):
    json_file = tmp_path / "invalid.json"
    json_file.write_text('{"data": []}\n', encoding="utf-8")
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_json_file", str(json_file))
    assert "JSON must have" in result.output


def test_t900231_sync_json_file_skips_entries_without_company_role(repo_root, run_cmd, tmp_path, ts):
    json_file = tmp_path / "partial.json"
    comp = f"GoodCorp{ts}"
    json_file.write_text(
        "{\n"
        '  "jobs": [\n'
        f'    {{"company": "{comp}", "role": "Engineer", "requirements": "Kubernetes"}},\n'
        '    {"company": ""},\n'
        '    {"role": "Engineer"}\n'
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_json_file", str(json_file))
    assert comp in result.output
    assert "missing company" in result.output


def test_t900231_sync_json_file_with_dry_run_does_not_modify_db(repo_root, run_cmd, tmp_path):
    json_file = tmp_path / "dry.json"
    json_file.write_text(
        "{\n"
        '  "jobs": [\n'
        "    {\n"
        '      "company": "DryCorp",\n'
        '      "role": "Test Engineer",\n'
        '      "requirements": "Testing",\n'
        '      "status": "found"\n'
        "    }\n"
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_json_file", str(json_file), "true")
    assert "DRY-RUN" in result.stdout

    count_result = _sql(run_cmd, repo_root, "SELECT COUNT(*) FROM applications.jobs WHERE company = 'DryCorp';")
    count = "".join(count_result.stdout.split())
    if count:
        assert count == "0"


def test_t900231_sync_directory_requires_path_argument(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_directory")
    assert "directory path required" in result.output


def test_t900231_sync_directory_rejects_non_existent_directory(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_directory", "/nonexistent/dir")
    assert "directory not found" in result.output


def test_t900231_sync_directory_imports_text_files(repo_root, run_cmd, tmp_path, ts):
    directory = tmp_path / "jobs"
    directory.mkdir()
    comp = f"CloudCorp{ts}"
    role = "SeniorDevOps"
    (directory / "position1.txt").write_text(
        f"{role} Engineer @ {comp}\n"
        f"https://{comp.lower()}.com/careers\n"
        "\n"
        "Requirements: Kubernetes CI/CD Python\n",
        encoding="utf-8",
    )
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_directory", str(directory))
    assert comp in result.stdout


def test_t900231_sync_directory_skips_json_files(repo_root, run_cmd, tmp_path):
    directory = tmp_path / "jobs"
    directory.mkdir()
    (directory / "test.json").write_text('{"company": "JsonCorp", "role": "Dev"}\n', encoding="utf-8")
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_directory", str(directory))
    assert "0 files processed" in result.stdout


def test_t900231_sync_directory_with_file_pattern(repo_root, run_cmd, tmp_path, ts):
    directory = tmp_path / "jobs"
    directory.mkdir()
    comp = f"PatternCorp{ts}"
    (directory / "pos.txt").write_text(f"Test Engineer @ {comp}\nRequirements: Testing\n", encoding="utf-8")
    result = _fn(run_cmd, repo_root, "app_pipeline_sync_directory", str(directory), "*.txt")
    assert comp in result.stdout


def test_t900231_app_pipeline_auto_match_requires_job_id(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_auto_match")
    assert "job_id required" in result.output


def test_t900231_auto_match_computes_score_for_valid_job(repo_root, run_cmd, ts):
    comp = f"AutoMatchTest{ts}"
    insert = _sql(
        run_cmd, repo_root,
        "INSERT INTO applications.jobs (company, role_title, raw_text, requirements, status) VALUES "
        f"('{comp}', 'Engineer', 'Kubernetes CI/CD test', 'Kubernetes CI/CD', 'found') RETURNING id;",
    )
    job_id = "".join(insert.stdout.split())
    if not job_id:
        pytest.skip("could not create test job (db issue)")

    result = _fn(run_cmd, repo_root, "app_pipeline_auto_match", job_id)
    assert "Auto-match complete" in result.stdout


def test_t900231_auto_match_fails_on_non_existent_job(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_auto_match", "99999")
    assert "not found" in result.output


def test_t900231_app_pipeline_auto_render_requires_job_id(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_auto_render")
    assert "job_id required" in result.output


def test_t900231_auto_render_with_unknown_theme_fails(repo_root, run_cmd):
    result = _fn(run_cmd, repo_root, "app_pipeline_auto_render", "1", "nonexistent-theme")
    assert "unknown theme" in result.output


def test_t900231_auto_render_on_non_existent_job_gracefully_fails(repo_root, run_cmd):
    # Original asserts nothing beyond "does not crash"; the call itself is the check.
    _fn(run_cmd, repo_root, "app_pipeline_auto_render", "99999", "default")


def test_t900231_auto_sync_cli_shows_help(repo_root, run_cmd):
    result = run_cmd(["bash", str(_cli(repo_root)), "--help"])
    assert "Auto-syncs" in result.output


def test_t900231_auto_sync_cli_requires_json_or_dir(repo_root, run_cmd):
    result = run_cmd(["bash", str(_cli(repo_root))])
    assert "--json or --dir is required" in result.output


def test_t900231_auto_sync_cli_rejects_both_json_and_dir(repo_root, run_cmd):
    result = run_cmd(["bash", str(_cli(repo_root)), "--json", "/tmp/a.json", "--dir", "/tmp/b"])
    assert "not both" in result.output


def test_t900231_auto_sync_cli_dry_run_flag_works(repo_root, run_cmd, tmp_path):
    json_file = tmp_path / "cli.json"
    json_file.write_text(
        "{\n"
        '  "jobs": [\n'
        '    {"company": "CLITest", "role": "Engineer", "status": "found"}\n'
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    result = run_cmd(["bash", str(_cli(repo_root)), "--json", str(json_file), "--dry-run", "--no-match"])
    assert "DRY RUN MODE" in result.stdout
    assert "DRY-RUN" in result.stdout


def test_t900231_auto_sync_cli_no_render_flag_skips_render_phase(repo_root, run_cmd, tmp_path):
    json_file = tmp_path / "cli.json"
    json_file.write_text(
        "{\n"
        '  "jobs": [\n'
        '    {"company": "NoRenderTest", "role": "Engineer", "status": "drafting"}\n'
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    result = run_cmd(["bash", str(_cli(repo_root)), "--json", str(json_file), "--no-render", "--no-match"])
    assert "Auto-Sync Complete" in result.stdout
    assert "Auto-Render" not in result.stdout
