"""Native migration of tests/spec/e2e-test-infrastructure/vision-sweep.bats."""

import shutil

import pytest

TARGET = "test:e2e:visual-sweep:vision"
PROXY = "127.0.0.1:18235"


@pytest.fixture
def paths(repo_root):
    return {"repo": repo_root, "spec": repo_root / "tests/e2e/specs/k8-headed-verify.spec.ts",
            "skill": repo_root / ".claude/skills/dev-flow-e2e/SKILL.md"}


@pytest.fixture
def need_task():
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")


def _task(run_cmd, repo, *args):
    return run_cmd(["bash", "-c", f"cd '{repo}' && task {' '.join(args)} 2>&1"])


def _no_cr(path):
    return path.read_bytes().replace(b"\r", b"").decode("utf-8")


def test_t012781_task_list_kennt_das_vision_sweep_ziel(run_cmd, paths, need_task):
    r = _task(run_cmd, paths["repo"], "--list")
    output = r.output
    assert len(output) > 100
    assert "test:e2e:visual-sweep" in output
    assert TARGET in output


def test_t012781_gerendertes_kommando_ist_headed_und_auf_drei_worker_gedeckelt(run_cmd, paths, need_task):
    r = _task(run_cmd, paths["repo"], "--dry", f"'{TARGET}'")
    assert r.returncode == 0
    assert len(r.output) > 50
    assert "--workers=3" in r.output
    assert "--headed" in r.output
    assert "VISUAL_SWEEP_VISION=1" in r.output


def test_t012781_alle_vier_sweep_projects_laufen_in_einem_aufruf(run_cmd, paths, need_task):
    r = _task(run_cmd, paths["repo"], "--dry", f"'{TARGET}'")
    assert r.returncode == 0
    for project in ("visual-sweep-mentolder-desktop", "visual-sweep-mentolder-mobile",
                    "visual-sweep-korczewski-desktop", "visual-sweep-korczewski-mobile"):
        assert project in r.output


def test_t012781_der_lauf_prueft_anzeige_und_vision_endpunkt_bevor_er_startet(run_cmd, paths, need_task):
    r = _task(run_cmd, paths["repo"], "--dry", f"'{TARGET}'")
    assert r.returncode == 0
    assert "DISPLAY" in r.output
    assert PROXY in r.output


def test_t012781_kein_workflow_ruft_das_vision_ziel_auf(paths):
    wf_dir = paths["repo"] / ".github" / "workflows"
    assert wf_dir.is_dir()
    files = [p for p in sorted(wf_dir.rglob("*")) if p.is_file()]
    # Positiv-Anker: das Verzeichnis wurde wirklich durchsucht.
    anchor = [p for p in files if "task " in p.read_text(encoding="utf-8", errors="replace")]
    assert len(anchor) > 0
    hits = [p for p in files if TARGET in p.read_text(encoding="utf-8", errors="replace")]
    assert len(hits) == 0


def test_t012781_k8_headed_verify_zeigt_auf_den_proxy_nicht_auf_8094_8091(paths):
    assert paths["spec"].is_file()
    body = _no_cr(paths["spec"])
    assert len(body) > 200
    assert "K8_VISION_URL" in body
    assert PROXY in body
    assert ":8094" not in body
    assert ":8091" not in body


def test_t012781_k8_headed_verify_sendet_einen_modellnamen_mit(paths):
    assert paths["spec"].is_file()
    body = _no_cr(paths["spec"])
    assert len(body) > 200
    assert "gemma12-vision" in body


def test_t012781_dev_flow_e2e_schritt_8_5_nennt_den_proxy_nicht_8094_8091(paths):
    assert paths["skill"].is_file()
    body = _no_cr(paths["skill"])
    assert len(body) > 200
    assert "headed-verify" in body
    assert PROXY in body
    assert ":8094" not in body
    assert ":8091" not in body
