"""Native migration of tests/spec/health-goals/llm-stack-goals.bats."""

import json
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

UNSET_VARS = (
    "CI",
    "LLM_PROXY_URL",
    "LLM_MEASURE_LOADOUTS",
    "LLM_MEASURE_BACKENDS_CMD",
    "LLM_MEASURE_MCP_REGISTRY",
    "LLM_MEASURE_UNIT_DIRS",
    "LLM_MEASURE_UNIT_STATE_CMD",
)


class Fixture:
    """Python counterpart of the BATS $FIX directory plus its helper functions."""

    def __init__(self, root, repo_root, run_cmd, monkeypatch):
        self.dir = root
        self.measure = repo_root / "scripts" / "lib" / "llm-stack-measure.sh"
        self.run_cmd = run_cmd
        self.mp = monkeypatch
        self.procs = []
        for var in UNSET_VARS:
            monkeypatch.delenv(var, raising=False)

    def run(self, *args):
        return self.run_cmd(["bash", str(self.measure), *args])

    def free_port(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    def serve_dir(self, directory):
        port = self.free_port()
        log = open(self.dir / f"http-{port}.log", "w", encoding="utf-8")
        proc = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1",
             "--directory", str(directory)],
            stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
        )
        self.procs.append(proc)
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1).close()
                break
            except Exception:
                time.sleep(0.05)
        return port

    def write_loadouts(self, text):
        path = self.dir / "loadouts.json"
        path.write_text(text, encoding="utf-8")
        self.mp.setenv("LLM_MEASURE_LOADOUTS", str(path))

    def backend_cmd(self, *lines):
        path = self.dir / "backends.txt"
        path.write_text("".join(f"{line}\n" for line in lines), encoding="utf-8")
        self.mp.setenv("LLM_MEASURE_BACKENDS_CMD", f"cat {path}")

    def write_mcp_registry(self, text):
        path = self.dir / "mcp.yaml"
        path.write_text(text, encoding="utf-8")
        self.mp.setenv("LLM_MEASURE_MCP_REGISTRY", str(path))

    def unit_state_cmd(self, state):
        script = self.dir / "unit-state.sh"
        script.write_text(f"#!/usr/bin/env bash\nprintf '%s' '{state}'\n", encoding="utf-8")
        script.chmod(0o755)
        self.mp.setenv("LLM_MEASURE_UNIT_STATE_CMD", f"bash {script}")

    def close(self):
        for proc in self.procs:
            proc.kill()
            proc.wait()


@pytest.fixture
def fx(tmp_path, repo_root, run_cmd, monkeypatch):
    if shutil.which("python3") is None:
        pytest.skip("python3 not installed")
    fixture = Fixture(tmp_path, repo_root, run_cmd, monkeypatch)
    yield fixture
    fixture.close()


def _is_number(output):
    return re.fullmatch(r"[0-9]+", output) is not None


def _unit(name):
    return (
        f"[Unit]\nDescription={name}\n[Service]\nExecStart=/bin/true\n"
        "[Install]\nWantedBy=default.target\n"
    )


# ── G-LLM01 ──────────────────────────────────────────────────────────────────

def test_g_llm01_ohne_loadout_registry_meldet_server_availability_n_a_nicht_0(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    fx.write_loadouts(json.dumps(
        {"version": 1, "loadouts": [{"slug": "a", "port": port, "exclusiveGroup": "g"}]}
    ))
    result = fx.run("server-availability")
    assert result.returncode == 0, result.output
    assert _is_number(result.output)

    monkeypatch.setenv("LLM_MEASURE_LOADOUTS", str(fx.dir / "gibt-es-nicht.json"))
    result = fx.run("server-availability")
    assert result.returncode == 0, result.output
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_llm01_exclusivegroup_zaehlt_nur_gruppen_ohne_lebendes_mitglied(fx, monkeypatch):
    live = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    (fx.dir / "health").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{live}")
    dead1, dead2 = fx.free_port(), fx.free_port()
    fx.write_loadouts(json.dumps({"version": 1, "loadouts": [
        {"slug": "a", "port": live, "exclusiveGroup": "g"},
        {"slug": "b", "port": dead1, "exclusiveGroup": "g"},
        {"slug": "c", "port": dead2, "exclusiveGroup": "g"},
    ]}))
    result = fx.run("server-availability")
    assert result.returncode == 0, result.output
    assert result.output == "0"

    dead3, dead4 = fx.free_port(), fx.free_port()
    fx.write_loadouts(json.dumps({"version": 1, "loadouts": [
        {"slug": "a", "port": live, "exclusiveGroup": "g"},
        {"slug": "b", "port": dead1, "exclusiveGroup": "g"},
        {"slug": "c", "port": dead2, "exclusiveGroup": "g"},
        {"slug": "d", "port": dead3, "exclusiveGroup": "tot"},
        {"slug": "e", "port": dead4, "exclusiveGroup": "tot"},
    ]}))
    result = fx.run("server-availability")
    assert result.returncode == 0, result.output
    assert result.output == "1"


def test_g_llm01_gruppenloser_loadout_port_ohne_listener_zaehlt_einzeln(fx, monkeypatch):
    live = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    (fx.dir / "health").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{live}")
    dead = fx.free_port()
    fx.write_loadouts(json.dumps({"version": 1, "loadouts": [
        {"slug": "a", "port": live, "exclusiveGroup": "g"},
        {"slug": "b", "port": dead},
    ]}))
    result = fx.run("server-availability")
    assert result.returncode == 0, result.output
    assert result.output == "1"


def test_g_llm01_objekt_statt_liste_reale_form_liefert_eine_zahl_kein_n_a(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    (fx.dir / "health").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    fx.write_loadouts(json.dumps({
        "version": 1, "modelRoots": {}, "defaults": {},
        "loadouts": [{"slug": "a", "port": port, "exclusiveGroup": "g"}],
    }))
    result = fx.run("server-availability")
    assert result.returncode == 0, result.output
    assert _is_number(result.output)


# ── G-LLM02 ──────────────────────────────────────────────────────────────────

def test_g_llm02_ohne_health_antwort_meldet_proxy_readiness_n_a_nicht_0(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "health").write_text(
        '{"status":"ok","ready":true,"degraded":[],"checked":1}\n', encoding="utf-8"
    )
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    result = fx.run("proxy-readiness")
    assert result.returncode == 0, result.output
    assert _is_number(result.output)

    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{fx.free_port()}")
    result = fx.run("proxy-readiness")
    assert result.returncode == 0, result.output
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_llm02_feldname_degraded_statt_providers_zaehlt_die_laenge_von_degraded(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "health").write_text(
        '{"status":"ok","ready":true,"degraded":[{"name":"deepseek"},{"name":"opencode-zen"}],"checked":3}\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    result = fx.run("proxy-readiness")
    assert result.returncode == 0, result.output
    assert result.output == "2"


def test_g_llm02_antwort_ohne_degraded_und_ohne_checked_meldet_n_a_form_anker(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "health").write_text('{"status":"ok","ready":true}\n', encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    result = fx.run("proxy-readiness")
    assert result.returncode == 0, result.output
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_llm02_ready_false_zaehlt_checked_als_zahl_kein_statuswort(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "health").write_text(
        '{"status":"ok","ready":false,"degraded":[{"name":"a"},{"name":"b"},{"name":"c"}],"checked":3}\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    result = fx.run("proxy-readiness")
    assert result.returncode == 0, result.output
    assert result.output == "3"
    assert _is_number(result.output)


# ── G-LLM03 ──────────────────────────────────────────────────────────────────

def test_g_llm03_ohne_loadout_registry_meldet_model_drift_n_a_nicht_0(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    fx.write_loadouts(json.dumps(
        {"version": 1, "loadouts": [{"slug": "a", "port": port, "model": "m1.gguf"}]}
    ))
    result = fx.run("model-drift")
    assert result.returncode == 0, result.output
    assert _is_number(result.output)

    monkeypatch.setenv("LLM_MEASURE_LOADOUTS", str(fx.dir / "gibt-es-nicht.json"))
    result = fx.run("model-drift")
    assert result.returncode == 0, result.output
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_llm03_v1_models_id_nicht_im_loadout_gefuehrt_zaehlt_gefuehrte_nicht(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    (fx.dir / "v1").mkdir()
    (fx.dir / "v1" / "models").write_text(
        '{"object":"list","data":[{"id":"gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"}]}\n',
        encoding="utf-8",
    )
    gemma = "unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
    fx.write_loadouts(json.dumps({"version": 1, "loadouts": [
        {"slug": "a", "port": port, "model": gemma},
        {"slug": "b", "port": port, "model": gemma},
        {"slug": "c", "port": port, "model": "gemma4/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf"},
    ]}))
    result = fx.run("model-drift")
    assert result.returncode == 0, result.output
    assert result.output == "0"

    (fx.dir / "v1" / "models").write_text(
        '{"object":"list","data":[{"id":"gptoss20/gpt-oss-20b-Q8_0.gguf"}]}\n',
        encoding="utf-8",
    )
    result = fx.run("model-drift")
    assert result.returncode == 0, result.output
    assert result.output == "1"


# ── G-LLM04 ──────────────────────────────────────────────────────────────────

def test_g_llm04_ohne_unit_dateien_meldet_autostart_coverage_n_a_nicht_0(fx, monkeypatch):
    units = fx.dir / "units"
    units.mkdir()
    (units / "foo.service").write_text(_unit("foo"), encoding="utf-8")
    monkeypatch.setenv("LLM_MEASURE_UNIT_DIRS", str(units))
    fx.unit_state_cmd("enabled")
    result = fx.run("autostart-coverage")
    assert result.returncode == 0, result.output
    assert _is_number(result.output)

    monkeypatch.setenv("LLM_MEASURE_UNIT_DIRS", str(fx.dir / "kein-units"))
    result = fx.run("autostart-coverage")
    assert result.returncode == 0, result.output
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_llm04_deklarierte_unit_ohne_enabled_zustand_zaehlt_enabled_nicht(fx, monkeypatch):
    units = fx.dir / "units"
    units.mkdir()
    (units / "foo.service").write_text(_unit("foo"), encoding="utf-8")
    (units / "bar.service").write_text(_unit("bar"), encoding="utf-8")
    monkeypatch.setenv("LLM_MEASURE_UNIT_DIRS", str(units))
    script = fx.dir / "unit-state.sh"
    script.write_text(
        "#!/usr/bin/env bash\n"
        "[ \"$1\" = 'foo.service' ] && printf '%s' enabled || printf '%s' disabled\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    monkeypatch.setenv("LLM_MEASURE_UNIT_STATE_CMD", f"bash {script}")
    result = fx.run("autostart-coverage")
    assert result.returncode == 0, result.output
    assert result.output == "1"


# ── G-LLM05 ──────────────────────────────────────────────────────────────────

def test_g_llm05_ohne_backend_registry_meldet_dead_endpoints_n_a_nicht_0(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    fx.backend_cmd(f"alive\thttp://127.0.0.1:{port}/v1")
    result = fx.run("dead-endpoints")
    assert result.returncode == 0, result.output
    assert _is_number(result.output)

    (fx.dir / "leer.txt").write_text("", encoding="utf-8")
    monkeypatch.setenv("LLM_MEASURE_BACKENDS_CMD", f"cat {fx.dir / 'leer.txt'}")
    result = fx.run("dead-endpoints")
    assert result.returncode == 0, result.output
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_llm05_familiengrenze_mcp_registry_endpunkt_wird_nicht_doppelt_gezaehlt(fx, monkeypatch):
    port = fx.serve_dir(fx.dir)
    (fx.dir / "livez").write_text("ok\n", encoding="utf-8")
    monkeypatch.setenv("LLM_PROXY_URL", f"http://127.0.0.1:{port}")
    dead = fx.free_port()
    fx.backend_cmd(
        f"a\thttp://127.0.0.1:{dead}/v1",
        f"b\thttp://127.0.0.1:{fx.free_port()}/v1",
    )
    fx.write_mcp_registry(
        "clients:\n  mcp-x:\n    transport: http\n"
        f"    endpoint: http://127.0.0.1:{dead}/mcp\n"
    )
    result = fx.run("dead-endpoints")
    assert result.returncode == 0, result.output
    assert result.output == "1"


# ── Querschnitt ──────────────────────────────────────────────────────────────

def test_llm_stack_measure_unbekanntes_subkommando_bricht_ab_statt_n_a_zu_melden(fx):
    result = fx.run("gibt-es-nicht")
    assert result.returncode != 0
    assert result.output != "n/a"
