"""Native migration of tests/spec/application-pipeline/theme-validation.bats."""

def _bash_fn(repo_root, run_cmd, fn, *args):
    """Source the themes library and call one of its functions (stdout and stderr kept apart)."""
    script = repo_root / "scripts/lib/application-pipeline-themes.sh"
    return run_cmd(["bash", "-c", 'source "$1"; shift; "$@"', "bash", str(script), fn, *args])


def test_t900230_app_pipeline_resolve_theme_default_returns_correct_path(repo_root, run_cmd):
    output = _bash_fn(repo_root, run_cmd, "app_pipeline_resolve_theme", "default").stdout.rstrip("\n")
    assert output
    assert output.endswith("/templates/application-pipeline/themes/default.typ")


def test_t900230_app_pipeline_resolve_theme_accent_slate_returns_correct_path(repo_root, run_cmd):
    output = _bash_fn(repo_root, run_cmd, "app_pipeline_resolve_theme", "accent-slate").stdout.rstrip("\n")
    assert output
    assert output.endswith("/templates/application-pipeline/themes/accent-slate.typ")


def test_t900230_invalid_theme_name_is_rejected_with_exit_code_1(repo_root, run_cmd):
    result = _bash_fn(repo_root, run_cmd, "app_pipeline_resolve_theme", "nicht-existent")
    assert result.returncode != 0
    assert "unknown theme" in result.output
    assert "default" in result.output
    assert "accent-slate" in result.output


def test_t900230_empty_theme_name_returns_error(repo_root, run_cmd):
    result = _bash_fn(repo_root, run_cmd, "app_pipeline_resolve_theme", "")
    assert result.returncode != 0
    assert "required" in result.output


def test_t900230_app_pipeline_list_themes_lists_all_available_themes(repo_root, run_cmd):
    output = _bash_fn(repo_root, run_cmd, "app_pipeline_list_themes").stdout
    assert "default" in output
    assert "accent-slate" in output


def test_t900230_default_typ_exists_and_is_non_empty(repo_root):
    theme_file = repo_root / "templates/application-pipeline/themes/default.typ"
    assert theme_file.is_file()
    assert theme_file.stat().st_size > 0


def test_t900230_accent_slate_typ_exists_and_is_non_empty(repo_root):
    theme_file = repo_root / "templates/application-pipeline/themes/accent-slate.typ"
    assert theme_file.is_file()
    assert theme_file.stat().st_size > 0


def test_t900230_two_themes_have_different_color_definitions(repo_root):
    themes = repo_root / "templates/application-pipeline/themes"

    def first_color_primary(name):
        for line in (themes / name).read_text(encoding="utf-8").splitlines():
            if "color-primary" in line:
                return line
        return ""

    assert first_color_primary("default.typ") != first_color_primary("accent-slate.typ")
