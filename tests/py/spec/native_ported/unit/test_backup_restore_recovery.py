"""Native migration of tests/unit/backup-restore-recovery.bats."""
import os
import shlex
import stat

import pytest

KUBECTL_STUB = """#!/usr/bin/env bash
args="$*"
case "$args" in
  *"create configmap"*)
    # cmd_recovery_verify speist eine Erfolgs-ConfigMap aus
    # `kubectl create … --dry-run=client -o yaml | kubectl apply -f -` (T002063).
    # Der Stub muss gueltiges YAML liefern, sonst bekommt der zweite apply einen
    # leeren Stream und ueberschreibt das zuvor aufgenommene Job-Manifest.
    cat <<'YAML'
apiVersion: v1
kind: ConfigMap
metadata:
  name: recovery-verify-status
YAML
    exit 0 ;;
  *"apply"*)
    # Nur den ERSTEN apply aufnehmen; spaetere (aus Pipes) verwerfen.
    if [[ ! -s "__CAPTURE__" ]]; then cat > "__CAPTURE__"; else cat > /dev/null; fi
    exit 0 ;;
  *"delete"*) exit 0 ;;
  *"wait"*)   exit 0 ;;
  *"logs"*)   exit 0 ;;
  *"get configmap domain-config"*)
    if [[ "$args" == *"-o json"* && "$args" != *"-o jsonpath"* ]]; then
      echo '{"data": {"RECOVER_DOMAIN": "recover.localhost"}}'
    else
      echo "recover.localhost"
    fi
    exit 0 ;;
  *)
    # Laut statt still: ein stiller Default-Case verschluckt jedes kuenftige
    # Subkommando, das das Produktskript hinzubekommt.
    echo "kubectl stub: unsupported invocation: $args" >&2
    exit 1 ;;
esac
"""


@pytest.fixture
def recovery(repo_root, run_cmd, tmp_path):
    """Stub kubectl on PATH, capture the first applied manifest, REPO_ROOT -> tmp_path."""
    fake_bin = tmp_path / "fakebin"
    fake_bin.mkdir()
    capture = tmp_path / "applied.yaml"
    (tmp_path / "k3d").mkdir()
    (tmp_path / "k3d" / "recovery-browser.yaml").write_text(
        "# stub recovery-browser.yaml (Plan 2)\n", encoding="utf-8"
    )
    stub = fake_bin / "kubectl"
    stub.write_text(KUBECTL_STUB.replace("__CAPTURE__", str(capture)), encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    env = {
        "CAPTURE": str(capture),
        "PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '')}",
        "REPO_ROOT": str(tmp_path),
    }
    script = repo_root / "scripts" / "backup-restore.sh"

    class Recovery:
        def run(self, *args: str, timeout: int = 60):
            return run_cmd(["bash", str(script), *args], env=env, timeout=timeout)

        def run_shell(self, command: str, timeout: int = 60):
            return run_cmd(["bash", "-c", command], env=env, timeout=timeout)

        def applied(self) -> str:
            return capture.read_text(encoding="utf-8")

    return Recovery(), script


def test_stage_without_args_fails_with_usage(recovery):
    rec, _ = recovery
    result = rec.run("stage")
    assert result.returncode != 0
    assert "Usage" in result.output


def test_stage_of_a_db_renders_a_pg_restore_job_into_db_recovery_live_db_untouched(recovery):
    rec, _ = recovery
    result = rec.run("stage", "20260530-020001", "website", "-y")
    assert result.returncode == 0
    applied = rec.applied()
    assert "kind: Job" in applied
    assert "website.dump.enc" in applied
    assert "createdb -h shared-db -U postgres -O website website_recovery" in applied
    assert "pg_restore -h shared-db -U postgres -d website_recovery" in applied
    # never drops the live db during staging
    assert "dropdb -h shared-db -U postgres --if-exists website " not in applied


def test_stage_of_a_service_extracts_into_recovery_pvc_under_recovery_ts_service(recovery):
    rec, _ = recovery
    result = rec.run("stage", "pvc-20260530-030001", "nextcloud-files", "-y")
    assert result.returncode == 0
    applied = rec.applied()
    assert "nextcloud-files.tar.gz.enc" in applied
    assert "claimName: recovery-pvc" in applied
    assert "/recovery/pvc-20260530-030001/nextcloud-files" in applied
    # backup source mounted read-only
    assert "claimName: backup-pvc" in applied


def test_verify_renders_a_job_that_restores_into_a_temp_db_counts_and_drops_it(recovery):
    rec, _ = recovery
    result = rec.run("verify", "20260530-020001", "website")
    assert result.returncode == 0
    applied = rec.applied()
    assert "website.dump.enc" in applied
    assert "createdb -h shared-db -U postgres" in applied
    assert "information_schema.tables" in applied
    assert "dropdb -h shared-db -U postgres --if-exists" in applied


def test_restore_file_copies_one_path_from_staging_into_the_live_pvc_with_y(recovery):
    rec, _ = recovery
    result = rec.run("restore-file", "pvc-20260530-030001", "nextcloud-files", "admin/files/Doc.pdf", "-y")
    assert result.returncode == 0
    applied = rec.applied()
    assert "claimName: recovery-pvc" in applied
    assert "claimName: nextcloud-data-pvc" in applied
    assert "/recovery/pvc-20260530-030001/nextcloud-files/admin/files/Doc.pdf" in applied


def test_restore_file_requires_confirmation_without_y(recovery):
    rec, script = recovery
    command = (
        f"echo no | bash {shlex.quote(str(script))} restore-file "
        "pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf"
    )
    result = rec.run_shell(command)
    assert result.returncode != 0
    assert "Aborted" in result.output


def test_restore_table_renders_pg_restore_t_table_into_the_live_db_with_y(recovery):
    rec, _ = recovery
    result = rec.run("restore-table", "20260530-020001", "website", "site_settings", "-y")
    assert result.returncode == 0
    applied = rec.applied()
    assert "website.dump.enc" in applied
    assert "pg_restore -h shared-db -U postgres -d website" in applied
    assert "-t site_settings" in applied


def test_browse_applies_the_recovery_browser_manifest_and_prints_the_url(recovery):
    rec, _ = recovery
    result = rec.run("browse")
    assert result.returncode == 0
    assert "recover." in result.output


def test_unstage_drops_recovery_dbs_and_clears_the_staging_dir_for_a_timestamp(recovery):
    rec, _ = recovery
    result = rec.run("unstage", "pvc-20260530-030001", "-y")
    assert result.returncode == 0
    assert "/recovery/pvc-20260530-030001" in rec.applied()


def test_usage_lists_the_recovery_commands(recovery):
    rec, _ = recovery
    result = rec.run("--help")
    assert result.returncode == 0
    for word in ("stage", "verify", "restore-file", "restore-table", "browse"):
        assert word in result.output
