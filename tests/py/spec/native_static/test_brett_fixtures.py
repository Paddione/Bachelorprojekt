"""Native fixture and database cases from tests/spec/brett.bats."""

import os
import re
import pytest


@pytest.fixture
def brett_src(repo_root):
    return repo_root / "components/brett/src"


@pytest.fixture
def staged_templates(brett_src):
    migration = brett_src / "server/migrations/005_board_templates_full_staging.sql"
    text = migration.read_text()
    names = ["Familiensystem 4 Personen", "Team-Konflikt", "Innere Anteile"]
    for name in names:
        assert name in text
    def blocks(start, end=None):
        selected = []
        active = False
        for line in text.splitlines():
            if start in line:
                active = True
            if active:
                selected.append(line)
                if end and end in line:
                    active = False
        return "\n".join(selected)
    return [blocks(names[0], names[1]), blocks(names[1], names[2]), blocks(names[2])]


def test_four_locale_dictionaries_export_defaults(brett_src):
    for locale in ("de", "en", "fr", "es"):
        text = (brett_src / f"client/locales/{locale}.ts").read_text()
        assert text
        assert "export default" in text


def test_locale_dictionaries_have_equal_nonzero_key_counts(brett_src):
    counts = [
        len(re.findall(r"^\s*'[a-zA-Z0-9_.]+':", (brett_src / f"client/locales/{locale}.ts").read_text(), re.M))
        for locale in ("de", "en", "fr", "es")
    ]
    assert counts[0] > 0
    assert len(set(counts)) == 1


def test_migration_stages_all_three_template_names(staged_templates):
    assert len(staged_templates) == 3


def test_each_template_has_distinct_colors_facing_and_pose(staged_templates):
    for block in staged_templates:
        assert len(set(re.findall(r'"color":"#[0-9a-fA-F]{6}"', block))) >= 2
        assert "facingY" in block
        assert '"preset":' in block


def test_each_template_has_zones_anchors_and_optik(staged_templates):
    for block in staged_templates:
        for field in ("zones", "anchors", "floor", "sky", "lightMood"):
            assert f'"{field}":' in block


def test_staging_migration_double_apply_is_idempotent(brett_src, run_cmd):
    database = os.environ.get("DATABASE_URL")
    if not database:
        pytest.skip("DATABASE_URL unset: no PostgreSQL for migration double-apply")
    probe = run_cmd(["psql", database, "-tAc", "SELECT 1"], env={"PGCONNECT_TIMEOUT": "2"})
    if probe.returncode:
        pytest.skip("PostgreSQL not reachable via DATABASE_URL")
    migration = str(brett_src / "server/migrations/005_board_templates_full_staging.sql")
    count = "SELECT count(*) FROM brett.board_templates WHERE is_system IS TRUE"
    duplicates = (
        "SELECT count(*) FROM (SELECT brand, name FROM brett.board_templates "
        "WHERE is_system IS TRUE GROUP BY brand, name HAVING count(*) > 1) d"
    )
    for _ in range(3):
        result = run_cmd(
            ["psql", database, "-v", "ON_ERROR_STOP=1", "-q", "-f", migration,
             "-tAc", count, "-f", migration, "-tAc", count, "-tAc", duplicates],
            env={"PGCONNECT_TIMEOUT": "2", "PGOPTIONS": "-c client_min_messages=WARNING"},
        )
        if result.returncode == 0 or "ERROR:" in result.output:
            break
    if result.returncode and "ERROR:" not in result.output:
        pytest.skip("PostgreSQL connection failed after three attempts")
    assert result.returncode == 0, result.output
    first, second, dupes = map(int, result.stdout.strip().splitlines()[:3])
    assert first >= 3
    assert first == second
    assert dupes == 0
