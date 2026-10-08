"""Native migration of tests/spec/application-pipeline/evidence-catalog.bats."""

def _select(repo_root, run_cmd, text):
    script = repo_root / "scripts/lib/application-pipeline-evidence.sh"
    result = run_cmd(
        ["bash", "-c", 'source "$1"; app_pipeline_select_evidence "$2"', "bash", str(script), text]
    )
    return result.stdout.rstrip("\n")


def _id_lines(output):
    return [line for line in output.splitlines() if '"id"' in line]


def test_t900230_evidence_catalog_selects_relevant_entries_for_platform_devops_posting(repo_root, run_cmd):
    output = _select(repo_root, run_cmd, "Kubernetes testing")
    assert '"id":"fleet-k3s"' in output
    assert '"id":"bats-quality-gates"' in output


def test_t900230_evidence_catalog_matches_multiple_keywords_per_entry(repo_root, run_cmd):
    output = _select(repo_root, run_cmd, "Kubernetes k3s container orchestration")
    assert '"id":"fleet-k3s"' in output
    count = len(_id_lines(output))
    assert 1 <= count <= 5


def test_t900230_missing_keyword_match_falls_back_to_default_evidence_set(repo_root, run_cmd):
    output = _select(repo_root, run_cmd, "some random text xyz qrf wvu")
    assert output != ""
    assert '"default":true' in output or '"match_count":0' in output


def test_t900230_ai_llm_job_matcht_freetoken_moe_und_typst_renderer(repo_root, run_cmd):
    output = _select(repo_root, run_cmd, "LLM model serving GPU inference MoE")
    assert '"id":"freetoken-moe"' in output


def test_t900230_ci_cd_job_matcht_bats_quality_gates(repo_root, run_cmd):
    output = _select(repo_root, run_cmd, "CI/CD pipeline automation testing quality gates")
    assert '"id":"bats-quality-gates"' in output


def test_t900230_max_5_entries_returned(repo_root, run_cmd):
    output = _select(repo_root, run_cmd, "Kubernetes CI/CD testing AI development fluxcd postgres gpu Helm")
    assert len(_id_lines(output)) <= 5


def test_t900230_empty_input_returns_default_evidence_set(repo_root, run_cmd):
    output = _select(repo_root, run_cmd, "")
    assert output != ""
    assert '"id":"' in output


def test_t900230_case_insensitive_matching(repo_root, run_cmd):
    lower = _select(repo_root, run_cmd, "kubernetes ci cd")
    upper = _select(repo_root, run_cmd, "KUBERNETES CI CD")
    mixed = _select(repo_root, run_cmd, "Kubernetes ci Cd")
    assert '"id":"fleet-k3s"' in lower
    assert '"id":"fleet-k3s"' in upper
    assert '"id":"fleet-k3s"' in mixed
