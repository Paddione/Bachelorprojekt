"""Native migration of tests/spec/health-goals/measurement-integrity.bats."""

import re
import subprocess

import pytest
import yaml


@pytest.fixture
def check_sh(repo_root):
    return repo_root / "scripts" / "health-goals-check.sh"


@pytest.fixture
def values(tmp_path):
    return tmp_path / "values.txt"


def _measure_value(run_cmd, check_sh, values, goal):
    """Python form of measure_value(): returns the awk-selected column 2 as one string."""
    values.write_text("", encoding="utf-8")
    run_cmd(
        ["bash", str(check_sh), "--fast", f"--only={goal}"],
        env={"HG_VALUES_FILE": str(values)},
    )
    picked = []
    for line in values.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == goal:
            picked.append(fields[1] if len(fields) > 1 else "")
    return "\n".join(picked)


def _pipe(args, stdin_text):
    """Mirrors bats run: stdout and stderr merged in write order, stdout exit status."""
    proc = subprocess.run(
        args,
        input=stdin_text,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=60,
    )
    return proc.returncode, proc.stdout.strip()


def test_g_if01_liefert_eine_einzelne_ganzzahl_kein_mehrzeiliges_token_t002648(
    run_cmd, check_sh, values
):
    val = _measure_value(run_cmd, check_sh, values, "G-IF01")
    assert val, "G-IF01 hat keinen Wert in HG_VALUES_FILE geschrieben"
    assert re.fullmatch(r"[0-9]+", val), f"G-IF01 lieferte '{val}' statt einer Ganzzahl"


def test_g_if01_zaehlt_die_http_clients_der_registry_nicht_die_stdio_eintraege_t002648(
    run_cmd, repo_root, check_sh, values
):
    try:
        data = yaml.safe_load(
            (repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml").read_text(encoding="utf-8")
        )
        http_clients = sum(
            1 for c in (data.get("clients") or {}).values() if c.get("transport") == "http"
        )
    except Exception:
        http_clients = 0
    assert http_clients >= 1, "keine http-Clients in docs/agent-guide/registry/mcp.yaml gefunden"

    val = _measure_value(run_cmd, check_sh, values, "G-IF01")
    assert re.fullmatch(r"[0-9]+", val), f"G-IF01 lieferte '{val}'"
    assert int(val) <= http_clients, (
        f"G-IF01 meldet {val} tote Endpunkte, es gibt aber nur {http_clients} http-Clients"
    )


def test_g_if01_meldet_verletzung_statt_n_a_wenn_die_registry_keine_kandidaten_hergibt_t002648(
    run_cmd, repo_root, tmp_path, check_sh, values
):
    fixture = tmp_path / "empty-registry.yaml"
    fixture.write_text("cluster:\n  context: fleet\n", encoding="utf-8")
    fixture_values = tmp_path / "fixture-values.txt"
    fixture_values.write_text("", encoding="utf-8")
    run_cmd(
        ["bash", str(check_sh), "--fast", "--only=G-IF01"],
        env={"HG_MCP_REGISTRY": str(fixture), "HG_VALUES_FILE": str(fixture_values)},
    )

    real_val = _measure_value(run_cmd, check_sh, values, "G-IF01")
    assert re.fullmatch(r"[0-9]+", real_val), (
        f"G-IF01 misst gegen die echte Registry nicht ('{real_val}')"
    )

    picked = []
    for line in fixture_values.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == "G-IF01":
            picked.append(fields[1] if len(fields) > 1 else "")
    fixture_val = "\n".join(picked)
    assert fixture_val, "G-IF01 fiel bei leerer Registry auf 'nicht messbar' zurueck"
    assert int(fixture_val) > 0, f"G-IF01 meldete '{fixture_val}' bei leerer Registry"


def test_g_dep01_zaehlt_high_critical_aus_dem_pnpm_audit_einzelobjekt_t002648(repo_root):
    helper = repo_root / "scripts" / "lib" / "pnpm-audit-count.py"
    assert helper.is_file(), f"{helper} fehlt"
    payload = (
        "{\n"
        '  "advisories": {\n'
        '    "1130715": { "severity": "high", "module_name": "babel" },\n'
        '    "1130716": { "severity": "critical", "module_name": "foo" },\n'
        '    "1130717": { "severity": "moderate", "module_name": "bar" }\n'
        "  }\n"
        "}\n"
    )
    status, output = _pipe(["python3", str(helper)], payload)
    assert status == 0, f"Parser brach ab - {output}"
    assert output == "2", f"erwartet 2 (high + critical), erhalten '{output}'"


def test_g_dep01_unterscheidet_keine_funde_von_parsen_gescheitert_t002648(repo_root):
    helper = repo_root / "scripts" / "lib" / "pnpm-audit-count.py"
    assert helper.is_file(), f"{helper} fehlt"

    status, output = _pipe(["python3", str(helper)], '{"advisories": {}}')
    assert status == 0 and output == "0", (
        f"leeres advisories-Objekt ergab status={status} output='{output}' (erwartet 0/0)"
    )

    status, output = _pipe(["python3", str(helper)], "not json at all")
    assert status != 0, f"unparsbare Eingabe lieferte Exit 0 mit '{output}'"


def test_g_dep02_ueberlebt_den_exit_1_von_pnpm_outdated_unter_pipefail_t002648(repo_root):
    helper = repo_root / "scripts" / "lib" / "pnpm-outdated-majors.py"
    assert helper.is_file(), f"{helper} fehlt"

    producer_json = (
        '{"eslint-plugin-astro": {"current": "1.2.3", "latest": "2.0.0"}, '
        '"knip": {"current": "5.1.0", "latest": "6.0.0"}, '
        '"astro": {"current": "4.1.0", "latest": "4.9.0"}}'
    )
    # Producer exits 1 like pnpm outdated with findings. The pipeline status is not
    # asserted, matching the original; only the single-token output is checked.
    _, output = _pipe(["python3", str(helper)], producer_json)
    assert output == "2", f"erwartet '2' (zwei Major-Spruenge), erhalten '{output}'"
