"""Native migration of tests/spec/omp-harness.bats."""

import json
import os
import re
import shutil
import socket
import subprocess
import time
import urllib.request

import pytest
import yaml

STUB_OMP = """#!/usr/bin/env bash
printf '%s\\n' "$@" > "${OMP_STUB_LOG}.args"
cp "${PI_CODING_AGENT_DIR}/models.json" "${OMP_STUB_LOG}.models"
echo "$PI_CODING_AGENT_DIR" > "${OMP_STUB_LOG}.dir"
[ -z "${OMP_STUB_TOUCH:-}" ] || echo probe > "$OMP_STUB_TOUCH"
[ -z "${OMP_STUB_STRAY:-}" ] || echo stray > "$OMP_STUB_STRAY"
[ -z "${OMP_STUB_STRAY2:-}" ] || echo stray > "$OMP_STUB_STRAY2"
echo '{"type":"agent_end"}'
exit 0
"""

STUB_OMP_EARLY = """#!/usr/bin/env bash
echo "STARTED" > "${OMP_STUB_LOG}"
exit 0
"""

REGISTRY_YAML = """capabilities:
  demo-fixture:
    skill:fixture-skill:
      state: canonical
      use_when: "Nur fuer den Harness-Test"
      roles: [omp]
    skill:shared-skill:
      state: canonical
      use_when: "Darf bei der Rolle omp nicht auftauchen"
      roles: [all]
"""

PLAN_TEXT = "# Smoke-Plan\n\n- [ ] Lege hello.txt an\n"
SCRIPT_RELATIVE = ("scripts", "omp-run.sh")


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _write_exec(path, body):
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _merged(args, cwd, env):
    proc = subprocess.run(
        args, cwd=str(cwd), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout.rstrip("\n")


def _last_line(text):
    lines = text.splitlines()
    return lines[-1] if lines else ""


def _grep_a1_last(path, needle):
    """grep -A1 -x -- NEEDLE FILE | tail -1 (the last line grep would print)."""
    lines = path.read_text(encoding="utf-8").splitlines()
    indices = set()
    for i, line in enumerate(lines):
        if line == needle:
            indices.add(i)
            if i + 1 < len(lines):
                indices.add(i + 1)
    return lines[max(indices)] if indices else ""


@pytest.fixture
def omp(tmp_path, repo_root, monkeypatch):
    state = {
        "tmp": tmp_path,
        "root": repo_root,
        "env": {},
        "procs": [],
        "touch": None,
        "stray": [],
        "plan": tmp_path / "plan.md",
    }
    state["plan"].write_text(PLAN_TEXT, encoding="utf-8")
    yield state
    for proc in state["procs"]:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    if state["touch"] is not None and state["touch"].exists():
        state["touch"].unlink()
    for path in state["stray"]:
        if path.exists():
            path.unlink()


def _run(state, args, extra_env=None):
    env = dict(os.environ)
    env.update(state["env"])
    env.update(extra_env or {})
    script = str(state["root"] / "scripts" / "omp-run.sh")
    return _merged(["bash", script, *args], state["root"], env)


def _start_endpoint(state, name, body):
    directory = state["tmp"] / f"ep-{name}"
    (directory / "v1").mkdir(parents=True, exist_ok=True)
    (directory / "v1" / "models").write_text(body, encoding="utf-8")
    port = _free_port()
    proc = subprocess.Popen(
        ["python3", "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(directory)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    state["procs"].append(proc)
    url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"{url}/v1/models", timeout=1) as resp:
                resp.read()
                break
        except Exception:
            time.sleep(0.1)
    return url


def _pool(state):
    ep1 = _start_endpoint(state, "one", '{"data":[{"id":"alpha-model","meta":{"n_ctx":32768}}]}')
    ep2 = _start_endpoint(state, "two", '{"data":[{"id":"beta-model"},{"id":"text-embedding-bge-m3"}]}')
    state["EP1"], state["EP2"] = ep1, ep2
    state["env"]["OMP_ENDPOINTS"] = f"{ep1},http://127.0.0.1:9,{ep2}"


def _stub_omp(state):
    bin_dir = state["tmp"] / "bin"
    bin_dir.mkdir(exist_ok=True)
    _write_exec(bin_dir / "omp", STUB_OMP)
    state["env"]["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"
    state["env"]["OMP_STUB_LOG"] = str(state["tmp"] / "omp")
    state["env"]["XDG_STATE_HOME"] = str(state["tmp"] / "state")
    state["stub_log"] = state["tmp"] / "omp"


def test_omp_harness_taskfile_omp_yml_bietet_install_status_uninstall_und_run_mit_gepinnter_version(repo_root):
    with open(repo_root / "taskfiles" / "Taskfile.omp.yml", encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    tasks = doc["tasks"]
    assert {"install", "status", "uninstall", "run"} <= set(tasks), sorted(tasks)
    cmds = "\n".join(str(c) for c in tasks["install"]["cmds"])
    assert "@oh-my-pi/pi-coding-agent@" in cmds, cmds
    assert "@mariozechner/pi-coding-agent" not in cmds, cmds
    pinned = str(doc["vars"]["OMP_VERSION"])
    assert re.search(r'default "\d+\.\d+\.\d+"', pinned), pinned


def test_omp_harness_l0_startet_blank_ohne_kontextdateien_ohne_skills_nur_basis_tools(omp):
    status, output = _run(omp, [str(omp["plan"]), "--level", "L0", "--dry-run"])
    assert status == 0, output
    assert "--no-rules" in output
    assert "--no-skills" in output
    assert "--no-extensions" in output
    assert "--tools read,write,edit,bash" in output
    assert "--skill" not in output
    assert "--append-system-prompt" not in output


def test_omp_harness_l2_erweitert_die_tools_und_haengt_den_harness_kontext_an(omp):
    status, output = _run(omp, [str(omp["plan"]), "--level", "L2", "--dry-run"])
    assert status == 0, output
    assert "--tools read,write,edit,bash,grep,find,ls" in output
    assert "--append-system-prompt" in output


def test_omp_harness_l3_filtert_die_discovery_auf_die_skills_der_rolle_omp(omp):
    tmp = omp["tmp"]
    skills = tmp / ".claude" / "skills"
    (skills / "fixture-skill").mkdir(parents=True)
    (skills / "fixture-skill" / "SKILL.md").write_text(
        "---\nname: fixture-skill\ndescription: Fixture-Skill fuer den Harness-Test\n---\n", encoding="utf-8"
    )
    registry = tmp / "capabilities.yaml"
    registry.write_text(REGISTRY_YAML, encoding="utf-8")
    status, output = _run(
        omp,
        [str(omp["plan"]), "--level", "L3", "--dry-run"],
        {"TOOLSET_REGISTRY": str(registry), "OMP_SKILLS_DIR": str(skills)},
    )
    assert status == 0, output
    assert "--skills" in output
    assert "fixture-skill" in output
    assert "shared-skill" not in output


def test_omp_harness_unbekannte_stufe_bricht_fail_closed_ab_und_nennt_die_gueltigen_stufen(omp):
    status, output = _run(omp, [str(omp["plan"]), "--level", "L9", "--dry-run"])
    assert status == 1, output
    assert "L0 L1 L2 L3" in output


def test_omp_harness_nicht_erreichbarer_endpunkt_bricht_ab_bevor_omp_ueberhaupt_startet(omp):
    bin_dir = omp["tmp"] / "bin"
    bin_dir.mkdir(exist_ok=True)
    _write_exec(bin_dir / "omp", STUB_OMP_EARLY)
    stub_log = omp["tmp"] / "omp.log"
    status, output = _run(
        omp,
        [str(omp["plan"]), "--level", "L0"],
        {
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
            "OMP_STUB_LOG": str(stub_log),
            "OMP_LOCAL_BASE_URL": "http://127.0.0.1:9",
        },
    )
    assert status == 2, output
    assert "http://127.0.0.1:9" in output
    assert not stub_log.exists()


def test_omp_harness_list_models_zeigt_chat_modelle_aller_erreichbaren_endpunkte_und_meldet_stumme(omp):
    _pool(omp)
    status, output = _run(omp, ["--list-models"])
    assert status == 0, output
    assert f"alpha-model\t{omp['EP1']}" in output
    assert f"beta-model\t{omp['EP2']}" in output
    assert "text-embedding" not in output
    assert "http://127.0.0.1:9" in output


def test_omp_harness_model_wird_an_den_endpunkt_geroutet_der_das_modell_serviert(omp):
    _pool(omp)
    _stub_omp(omp)
    status, output = _run(omp, [str(omp["plan"]), "--level", "L0", "--model", "beta-model", "--skip-tests"])
    assert status == 0, output
    provider = _grep_a1_last(omp["stub_log"].with_name("omp.args"), "--provider")
    model = _grep_a1_last(omp["stub_log"].with_name("omp.args"), "--model")
    assert model == "beta-model"
    models_file = omp["stub_log"].with_name("omp.models")
    base_url = subprocess.run(
        ["jq", "-r", "--arg", "p", provider, ".providers[$p].baseUrl", str(models_file)],
        capture_output=True, text=True, timeout=60,
    ).stdout.strip()
    assert base_url == f"{omp['EP2']}/v1"
    agent_dir = omp["stub_log"].with_name("omp.dir").read_text(encoding="utf-8").strip()
    assert not os.path.exists(agent_dir)


def test_omp_harness_unbekanntes_modell_bricht_vor_dem_omp_start_ab_und_listet_die_auswahl(omp):
    _pool(omp)
    _stub_omp(omp)
    status, output = _run(omp, [str(omp["plan"]), "--level", "L0", "--model", "no-such-model", "--skip-tests"])
    assert status == 2, output
    assert "alpha-model" in output
    assert "beta-model" in output
    assert not omp["stub_log"].with_name("omp.args").exists()


def test_omp_harness_json_liefert_den_bericht_als_ein_json_objekt_skip_tests_meldet_test_exit_null(omp):
    _pool(omp)
    _stub_omp(omp)
    status, output = _run(omp, [str(omp["plan"]), "--level", "L0", "--json", "--skip-tests"])
    assert status == 0, output
    last = _last_line(output)
    proc = subprocess.run(
        ["jq", "-r", '[.model, (.omp_exit|tostring), (.test_exit|tostring), .endpoint] | join(" ")'],
        input=last, capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == f"alpha-model 0 null {omp['EP1']}"


def test_omp_harness_lm_studio_endpunkt_liefert_typ_und_architektur_embeddings_fallen_per_typ_heraus(omp):
    ep = _start_endpoint(omp, "lms", '{"data":[]}')
    directory = omp["tmp"] / "ep-lms"
    (directory / "api" / "v0").mkdir(parents=True, exist_ok=True)
    (directory / "api" / "v0" / "models").write_text(
        '{"data":[{"id":"abc123hash","type":"llm","arch":"qwen3","quantization":"Q4_K_XL","state":"not-loaded"},'
        '{"id":"nomic","type":"embeddings","arch":"bert","state":"not-loaded"}]}',
        encoding="utf-8",
    )
    status, output = _run(omp, ["--list-models"], {"OMP_LOCAL_BASE_URL": ep})
    assert status == 0, output
    assert f"abc123hash\t{ep}\tqwen3 Q4_K_XL not-loaded" in output
    assert "nomic" not in output


def test_omp_harness_changed_files_zaehlt_nur_was_der_lauf_selbst_geaendert_hat(omp):
    _pool(omp)
    _stub_omp(omp)
    worktree = omp["tmp"] / "worktree"
    worktree.mkdir()
    subprocess.run(["git", "init", "-q", str(worktree)], check=True)
    omp["env"]["OMP_WORKTREE"] = str(worktree)
    touch = worktree / f"omp-probe-{os.getpid()}.txt"
    omp["env"]["OMP_STUB_TOUCH"] = str(touch)
    omp["touch"] = touch
    status, output = _run(omp, [str(omp["plan"]), "--level", "L0", "--json", "--skip-tests"])
    assert status == 0, output
    proc = subprocess.run(
        ["jq", "-r", ".changed_files"], input=_last_line(output), capture_output=True, text=True, timeout=60
    )
    assert proc.stdout.strip() == "1"


def test_omp_harness_changed_files_ignoriert_parallele_schreiber_im_echten_checkout_t901070(omp):
    _pool(omp)
    _stub_omp(omp)
    worktree = omp["tmp"] / "worktree"
    worktree.mkdir()
    subprocess.run(["git", "init", "-q", str(worktree)], check=True)
    omp["env"]["OMP_WORKTREE"] = str(worktree)
    touch = worktree / f"omp-probe-{os.getpid()}.txt"
    omp["env"]["OMP_STUB_TOUCH"] = str(touch)
    omp["touch"] = touch
    # Zwei Stray-Dateien im echten Checkout simulieren parallele Schreiber zwischen
    # den dirty-Snapshots. Untracked, nach dem Test entfernt; keine getrackten Dateien.
    stray = omp["root"] / f"omp-stray-{os.getpid()}.txt"
    stray2 = omp["root"] / f"omp-stray2-{os.getpid()}.txt"
    omp["env"]["OMP_STUB_STRAY"] = str(stray)
    omp["env"]["OMP_STUB_STRAY2"] = str(stray2)
    omp["stray"].extend([stray, stray2])
    status, output = _run(omp, [str(omp["plan"]), "--level", "L0", "--json", "--skip-tests"])
    assert status == 0, output
    proc = subprocess.run(
        ["jq", "-r", ".changed_files"], input=_last_line(output), capture_output=True, text=True, timeout=60
    )
    assert proc.stdout.strip() == "1"
