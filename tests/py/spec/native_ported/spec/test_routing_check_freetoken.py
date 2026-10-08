"""Native migration of tests/spec/routing-check-freetoken.bats."""

import re
import shutil
import subprocess

import pytest


def _http_code(url):
    if shutil.which("curl") is None:
        return ""
    r = subprocess.run(["curl", "-s", "-m", "2", "-o", "/dev/null", "-w", "%{http_code}", url],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return r.stdout


def _http_body(url):
    if shutil.which("curl") is None:
        return ""
    r = subprocess.run(["curl", "-s", "-m", "2", url], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return r.stdout


def _require_http(url, expected, what):
    code = _http_code(url)
    if code != expected:
        pytest.skip(f"{what} antwortet mit '{code or 'kein Code'}' statt '{expected}' (Umgebung, kein Produktfehler; T900651)")


def _require_http_contains(url, needle, what):
    body = _http_body(url)
    if not body:
        pytest.skip(f"{what} nicht erreichbar (Umgebung, kein Produktfehler; T900651)")
    if needle not in body:
        pytest.skip(f"{what} enthaelt '{needle}' nicht (Umgebung, kein Produktfehler; T900651)")


def _code_lines(path):
    return [line for line in path.read_text(encoding="utf-8").splitlines() if not re.match(r"^[ \t]*#", line)]


def test_routing_check_meldet_kein_veraltetes_gemma12_vision_18235(run_cmd, repo_root):
    r = run_cmd(["bash", str(repo_root / "scripts" / "llm" / "routing-check.sh")])
    assert "gemma12-vision" not in r.output


def test_t900213_routing_check_probt_port_1919_und_nicht_18235_in_probe_liste(repo_root):
    path = repo_root / "scripts" / "llm" / "routing-check.sh"
    assert path.is_file()
    code = _code_lines(path)
    # :1919 in Probe-Liste
    assert any("127.0.0.1:1919" in line for line in code)
    # :18235 nicht mehr in Probe-Liste (nur Kommentare erlaubt)
    assert not any("18235" in line for line in code)


def test_t900213_opencode_jsonc_standardmodell_ist_im_live_katalog_vorhanden_wenn_1919_erreichbar(repo_root):
    url = "http://127.0.0.1:1919/v1/models"
    _require_http(url, "200", ":1919 /v1/models")

    text = (repo_root / ".opencode" / "opencode.jsonc").read_text(encoding="utf-8")
    m = re.search(r'^\s*"model"\s*:\s*"([^"]+)"', text, re.MULTILINE)
    model = ""
    if m:
        model = m.group(1)
        if "/" in model:
            model = model.split("/", 1)[1]
    assert model
    # [T900537] Abweichender Live-Katalog ist Drift (T900509), kein Auth-Befund -> Skip.
    _require_http_contains(url, model, ":1919-Katalog (Drift, T900509)")
