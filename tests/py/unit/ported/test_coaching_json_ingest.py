"""Native migration of tests/unit/coaching-json-ingest.bats."""
import shutil

import pytest


@pytest.fixture
def project(repo_root):
    return repo_root


def test_coaching_ingest_json_task_exists_in_taskfile_suite(project):
    taskfile = project / "taskfiles" / "Taskfile.data.yml"
    count = sum(1 for line in taskfile.read_text(encoding="utf-8").splitlines()
                if "coaching:ingest-json:" in line)
    assert str(count) == "1"


def test_ingest_json_mts_script_exists(project):
    assert (project / "scripts" / "coaching" / "ingest-json.mts").is_file()


def test_ingest_json_core_ts_exists_in_components_website_src_lib(project):
    assert (project / "components" / "website" / "src" / "lib" / "ingest-json-core.ts").is_file()


def test_ingest_json_mts_exits_2_with_no_args(run_cmd, project):
    if shutil.which("npx") is None:
        pytest.skip("npx nicht verfuegbar")
    cmd = (f"cd '{project}/components/website' && "
           "npx tsx ../../scripts/coaching/ingest-json.mts 2>&1; echo EXIT:$?")
    r = run_cmd(["bash", "-c", cmd], timeout=300)
    assert "EXIT:2" in r.output
    assert "Usage:" in r.output


def test_ingest_json_mts_exits_1_on_malformed_json_content(run_cmd, project, tmp_path):
    if shutil.which("npx") is None:
        pytest.skip("npx nicht verfuegbar")
    bad_json = tmp_path / "bad.json"
    bad_json.write_text('[{"id":"x"}]\n', encoding="utf-8")
    cmd = (f"PGHOST=127.0.0.1 PGPORT=1 cd '{project}/components/website' && "
           f"npx tsx ../../scripts/coaching/ingest-json.mts '{bad_json}' test-slug 2>&1; echo EXIT:$?")
    r = run_cmd(["bash", "-c", cmd], timeout=300)
    assert '"content" fehlt oder ist leer' in r.output
