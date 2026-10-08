"""Native migration of tests/spec/website-core/web-audit.bats."""
# Runs scripts/web-audit.mjs against fixtures under tests/fixtures/web-audit and checks exit status
# and output. Command output verification [T002448-M4]. The script's report goes to the fixed,
# git-ignored location <repo>/tmp/claude-scratch (the script has no output override), as in the

# BATS original.

import re
from datetime import datetime, timezone

import pytest

AUDIT = "scripts/web-audit.mjs"
FIXTURE_HTML = "tests/fixtures/web-audit/route-sample.html"
FIXTURE_AXE = "tests/fixtures/web-audit/axe-sample.json"
FIXTURE_LH = "tests/fixtures/web-audit/lighthouse-sample.json"


@pytest.fixture
def audit(run_cmd, repo_root):
    script = str(repo_root / AUDIT)

    def _run(*args, timeout_s=None):
        cmd = ["node", script, *args]
        if timeout_s is not None:
            cmd = ["timeout", str(timeout_s), *cmd]
        return run_cmd(cmd, cwd=repo_root, timeout=max(60, (timeout_s or 0) + 30))

    return _run


@pytest.fixture
def extract(audit, repo_root):
    def _run():
        res = audit("--extract-fixture", str(repo_root / FIXTURE_HTML))
        assert res.returncode == 0, res.output
        return res.output

    return _run


# -- Scenario 1: semantic extract ----------------------------------------------

def test_extract_enthaelt_erwartete_alt_texte_mit_bild_urls_positiv_anker(extract):
    out = extract()
    assert '"alt": "Portraitfoto der Coachin"' in out
    assert '"alt": "Mentolder Coaching Logo"' in out
    assert '"alt": "header-bg-2.webp"' in out
    assert '"src": "/images/portrait.jpg"' in out
    assert '"src": "/images/header-bg-2.webp"' in out


def test_extract_output_enthaelt_kein_html_markup(extract):
    out = extract()
    assert not re.search(r"<(img|a|div|span|h[1-6]|meta|header|main|footer|nav|section|body|html|p|title|link)", out)
    assert "</" not in out


def test_extract_enthaelt_meta_tags(extract):
    out = extract()
    assert '"name": "description"' in out
    assert "Professionelles Coaching" in out
    assert '"name": "viewport"' in out
    assert '"name": "charset"' in out


def test_extract_enthaelt_ueberschriften_hierarchie(extract):
    out = extract()
    assert '"level": 1' in out
    assert "Willkommen bei Mentolder" in out
    assert '"level": 2' in out
    assert "Unsere Leistungen" in out


def test_extract_enthaelt_link_labels_mit_ziel(extract):
    out = extract()
    assert '"text": "Start"' in out
    assert '"href": "/"' in out
    assert '"text": "Kontaktformular öffnen"' in out
    assert '"href": "/kontakt"' in out
    assert '"text": "Mehr erfahren"' in out
    assert '"href": "/coaching"' in out


# -- Scenario 2: prompt below 32000 tokens --------------------------------------

def test_prompt_bleibt_bei_drei_routen_unter_32000_token(audit, repo_root):
    res = audit("--extract-fixture", str(repo_root / FIXTURE_HTML),
                "--check-tokens", "--routes", "/,/ueber-mich,/kontakt")
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    token_count = int(lines[0]) if lines and lines[0].strip() else None
    assert token_count is not None
    assert token_count >= 1
    assert token_count < 32000


# -- Scenario 3: enable_thinking false -------------------------------------------

def test_chat_template_kwargs_enable_thinking_auf_false_gesetzt(repo_root):
    text = (repo_root / AUDIT).read_text(encoding="utf-8")
    assert re.search(r"enable_thinking\s*:\s*false", text), "enable_thinking: false nicht gefunden"
    assert re.search(r"chat_template_kwargs.*enable_thinking", text), "chat_template_kwargs nicht gefunden"


# -- Scenario 4: llm-proxy unreachable -------------------------------------------

def test_proxy_unreachable_stufen_1_2_vollstaendig_stufe_3_als_ausgefallen_exit_0(audit, repo_root):
    res = audit("--brand", "mentolder", "--routes", "/",
                "--axe-fixture", str(repo_root / FIXTURE_AXE),
                "--lighthouse-fixture", str(repo_root / FIXTURE_LH),
                "--proxy-url", "http://127.0.0.1:19999", "--proxy-timeout", "1000",
                timeout_s=15)
    assert res.returncode == 0, res.output
    assert "Stage 1" in res.output
    assert "Stage 2" in res.output
    assert ("FAIL" in res.output) or ("unreachable" in res.output)


# -- Scenario 5: axe failed - semantic check still runs -------------------------

def test_axe_fehlgeschlagen_exit_code_gemeldet_semantische_pruefung_laeuft_dennoch(audit, repo_root):
    res = audit("--brand", "mentolder", "--routes", "/",
                "--axe-exit-code", "2",
                "--lighthouse-fixture", str(repo_root / FIXTURE_LH),
                "--proxy-url", "http://127.0.0.1:19999", "--proxy-timeout", "1000",
                timeout_s=15)
    assert res.returncode == 0, res.output
    assert "Stage 1" in res.output
    assert "FAIL" in res.output
    assert "Stage 3" in res.output

    # web-audit.mjs uses new Date().toISOString(), whose date component is UTC.
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    report = repo_root / "tmp" / "claude-scratch" / f"web-audit-mentolder-{date_str}.md"
    assert report.is_file(), f"report missing: {report}"
    text = report.read_text(encoding="utf-8")
    assert "Simulated axe failure" in text
    assert "FAILED" in text
