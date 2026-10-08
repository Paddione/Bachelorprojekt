"""Native migration of tests/spec/sdlc-cockpit/build-target-runtime-env.bats."""
# Pruefmodus: Quelltext-Pruefung (dokumentierter Ausnahmefall der Output-Verifikation).

import pytest


@pytest.fixture
def dockerfile(repo_root):
    return repo_root / "components/website/Dockerfile"


@pytest.fixture
def runtime_stage(dockerfile):
    # Rumpf der letzten Stage: alles ab dem letzten FROM bis Dateiende.
    lines = dockerfile.read_text(encoding="utf-8").splitlines(keepends=True)
    last_from = max(i for i, line in enumerate(lines) if line.startswith("FROM "))
    return "".join(lines[last_from:])


def test_components_website_dockerfile_exists_and_declares_more_than_one_stage(dockerfile):
    assert dockerfile.is_file()
    stages = [line for line in dockerfile.read_text(encoding="utf-8").splitlines() if line.startswith("FROM ")]
    assert len(stages) >= 2


def test_the_runtime_stage_is_correctly_identified_positive_anchor_git_sha(runtime_stage):
    # Positiv-Anker: GIT_SHA liegt in der runtime-Stage.
    assert runtime_stage.count("ENV GIT_SHA") >= 1


def test_the_runtime_stage_declares_arg_build_target(runtime_stage):
    assert runtime_stage.count("ARG BUILD_TARGET") >= 1


def test_the_runtime_stage_exports_build_target_as_an_environment_variable(runtime_stage):
    assert runtime_stage.count("ENV BUILD_TARGET") >= 1


def test_the_sdlc_console_workflow_passes_build_target_as_a_build_argument(repo_root):
    workflow = repo_root / ".github/workflows/build-sdlc-console.yml"
    assert workflow.read_text(encoding="utf-8").count("BUILD_TARGET=sdlc") >= 1
