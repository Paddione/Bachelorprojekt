"""Tests for DB quality goals and restore verification (migrated from tests/spec/db-quality-goals.bats & tests/spec/db-restore-verification/)."""

import os
from pathlib import Path
import re
import subprocess
import yaml


def test_db_quality_goals(repo_root: Path):
    hgc = repo_root / "scripts" / "health-goals-check.sh"
    db_ids = ["G-DB01", "G-DB03", "G-DB04", "G-DB06", "G-DB08"]

    # bash -n
    res = subprocess.run(["bash", "-n", str(hgc)], cwd=repo_root, capture_output=True, text=True)
    assert res.returncode == 0

    # health-goals-check.sh --fast --only=<G-DB*>
    res = subprocess.run(
        ["bash", str(hgc), "--fast", "--only=" + ",".join(db_ids)],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode in (0, 1)
    for gid in db_ids:
        assert gid in res.stdout, f"{gid} missing in output: {res.stdout}"

    # migration checks
    fk_migration = repo_root / "components" / "website" / "src" / "db" / "migrations" / "20260719_add_missing_fk_indexes_batch2.sql"
    assert fk_migration.is_file()
    mig_content = fk_migration.read_text()

    for idx in [
        "idx_onboarding_state_brand",
        "idx_sessions_templates_created_from_template_id",
        "idx_studio_sessions_client_id",
        "idx_studio_sessions_template_of",
        "idx_billing_customers_customers_id",
        "idx_document_assignments_template_id",
        "idx_tickets_tickets_brand",
        "idx_tickets_tickets_reporter_id",
        "idx_questionnaire_questions_template_id",
        "idx_coaching_drafts_resulting_snippet_id",
    ]:
        assert idx in mig_content, f"index {idx} missing in {fk_migration}"

    assert "IF to_regclass(" in mig_content
    assert "arena.match_players" not in mig_content


def test_db_restore_verification_generation_lookup(repo_root: Path, tmp_path: Path):
    manifest = repo_root / "k3d" / "backup-restore-verify-cronjob.yaml"
    assert manifest.is_file()
    docs = list(yaml.safe_load_all(manifest.read_text()))
    cj = next((d for d in docs if d and d.get("kind") == "CronJob"), None)
    assert cj is not None
    arg0 = cj["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]["args"][0]

    # extract LATEST=$(find ...) expression
    m = re.search(r"LATEST=\$\(find .*?\)", arg0, re.S)
    assert m is not None, f"LATEST=$(find ...) not found in {arg0}"
    expr = m.group(0).replace("$$", "$").replace("/backups", str(tmp_path))

    # latest generation
    (tmp_path / "20261006-000059").mkdir()
    (tmp_path / "20261007-202706").mkdir()
    (tmp_path / "pvc-20261007-010007").mkdir()

    cmd = f'{expr}; echo "$LATEST"'
    res = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, check=True)
    latest = res.stdout.strip()
    assert os.path.basename(latest) == "20261007-202706"

    # pvc generations and alien dirs ignored
    tmp_path2 = tmp_path / "test2"
    tmp_path2.mkdir()
    (tmp_path2 / "20261006-000059").mkdir()
    (tmp_path2 / "pvc-20991231-235959").mkdir()
    (tmp_path2 / "lost+found").mkdir()

    expr2 = m.group(0).replace("$$", "$").replace("/backups", str(tmp_path2))
    cmd2 = f'{expr2}; echo "$LATEST"'
    res2 = subprocess.run(["bash", "-c", cmd2], capture_output=True, text=True, check=True)
    assert os.path.basename(res2.stdout.strip()) == "20261006-000059"


def test_db_restore_verification_cronjob(repo_root: Path):
    manifest = repo_root / "k3d" / "backup-restore-verify-cronjob.yaml"
    assert manifest.is_file()
    docs = list(yaml.safe_load_all(manifest.read_text()))
    cj = next((d for d in docs if d and d.get("kind") == "CronJob"), None)
    assert cj is not None
    assert cj["spec"]["schedule"] == "30 3 * * 0"

    arg0 = cj["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]["args"][0]
    assert "restore_verify_" in arg0
    assert "DROP DATABASE" in arg0
    assert "restore-verification.jsonl" in arg0

    # bash -n syntax check
    res = subprocess.run(["bash", "-n"], input=arg0, capture_output=True, text=True)
    assert res.returncode == 0

    kust = (repo_root / "k3d" / "kustomization.yaml").read_text()
    assert "backup-restore-verify-cronjob.yaml" in kust
