"""Native migration of tests/unit/oracle-task-vars.bats."""
from pathlib import Path

import pytest

TASKFILE = """version: '3'

tasks:
  workspace:deploy:
    desc: "Deploy workspace to any environment"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - echo deploy

  fleet:deploy:brand:
    desc: "Deploy ONE brand's core stack to fleet"
    requires:
      vars: [BRAND]
    cmds:
      - echo deploy-brand

  fleet:deploy:
    desc: "Full deploy: both brands via fleet:deploy:brand"
    cmds:
      - task: fleet:deploy:brand
        vars: { BRAND: fleet-mentolder }
      - task: fleet:deploy:brand
        vars: { BRAND: fleet-korczewski }

  test:all:
    desc: "Run all offline tests"
    cmds:
      - echo test
"""

SPLIT_TASKFILE = """version: '3'

tasks:
  split:deploy:brand:
    desc: "Split-file brand deploy"
    requires:
      vars: [BRAND]
    cmds:
      - echo deploy-split-brand
"""


@pytest.fixture
def fixture_dir(tmp_path: Path) -> Path:
    fdir = tmp_path / "fixture"
    fdir.mkdir()
    (fdir / "Taskfile.yml").write_text(TASKFILE, encoding="utf-8")
    return fdir


@pytest.fixture
def oracle_lib(repo_root: Path) -> Path:
    return repo_root / "scripts" / "vda" / "oracle-task-vars.sh"


def _call(run_cmd, lib: Path, fn: str, *args: str):
    """Source the production library and call one of its functions with the given args."""
    return run_cmd(["bash", "-c", 'source "$0"; "$@"', str(lib), fn, *args])


def test_task_required_var_detects_env_requiring_task_default_valued_vars_block(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "task_required_var", "workspace:deploy", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == "ENV"


def test_task_required_var_detects_brand_requiring_task(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "task_required_var", "fleet:deploy:brand", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == "BRAND"


def test_task_required_var_returns_empty_for_task_with_no_vars(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "task_required_var", "test:all", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == ""


def test_materialize_task_env_arg_maps_mentolder_token_to_brand_fleet_mentolder(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "materialize_task_env_arg", "fleet:deploy:brand", "mentolder", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == "BRAND=fleet-mentolder"


def test_materialize_task_env_arg_passes_through_already_prefixed_fleet_token(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "materialize_task_env_arg", "fleet:deploy:brand", "fleet-korczewski", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == "BRAND=fleet-korczewski"


def test_materialize_task_env_arg_emits_env_for_plain_workspace_task(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "materialize_task_env_arg", "workspace:deploy", "mentolder", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == "ENV=mentolder"


def test_materialize_task_env_arg_is_empty_for_task_requiring_neither_var(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "materialize_task_env_arg", "test:all", "mentolder", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == ""


def test_task_required_var_ignores_vars_passed_to_sub_task_calls_no_requires_block(run_cmd, oracle_lib, fixture_dir):
    # Code-review finding (T001583): nur der eigene requires:vars-Block zaehlt.
    result = _call(run_cmd, oracle_lib, "task_required_var", "fleet:deploy", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == ""


def test_materialize_task_env_arg_does_not_materialize_var_for_orchestrating_task(run_cmd, oracle_lib, fixture_dir):
    result = _call(run_cmd, oracle_lib, "materialize_task_env_arg", "fleet:deploy", "mentolder", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == ""


def test_task_required_var_finds_brand_task_in_split_taskfile(run_cmd, oracle_lib, fixture_dir):
    # C4 split (T900560): Tasks liegen auch in taskfiles/.
    (fixture_dir / "taskfiles").mkdir()
    (fixture_dir / "taskfiles" / "Taskfile.split.yml").write_text(SPLIT_TASKFILE, encoding="utf-8")
    result = _call(run_cmd, oracle_lib, "task_required_var", "split:deploy:brand", str(fixture_dir))
    assert result.returncode == 0, result.output
    assert result.output == "BRAND"
