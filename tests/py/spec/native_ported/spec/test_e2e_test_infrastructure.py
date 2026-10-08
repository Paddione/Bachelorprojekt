"""Native migration of tests/spec/e2e-test-infrastructure.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def e2e(repo_root):
    repo = repo_root
    return {
        "repo": repo,
        "seed": repo / "tests" / "e2e" / "lib" / "e2e-seed.ts",
        "specs": repo / "tests" / "e2e" / "specs",
        "pwconf": repo / "tests" / "e2e" / "playwright.config.ts",
    }


def _read(path: Path) -> str:
    """Liest eine Datei; fehlende Datei ergibt leeren Text (grep-Verhalten: kein Treffer)."""
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _project_block(pwconf: Path, project: str) -> str:
    """Zeilen nach 'name: '<project>'' bis zur naechsten 'name: '-Zeile (awk-Semantik)."""
    want = f"name: '{project}'"
    out = []
    inside = False
    for line in _read(pwconf).splitlines():
        if not inside and want in line:
            inside = True
            continue
        if inside and "name: '" in line:
            break
        if inside:
            out.append(line)
    return "\n".join(out)


def _dockerfile_runtime_stage(path: Path) -> str:
    """awk '/^FROM .* AS runtime/ { inside = 1 } inside' -> ab der Runtime-Stage bis EOF."""
    lines = _read(path).splitlines()
    for i, line in enumerate(lines):
        if re.search(r"^FROM .* AS runtime", line):
            return "\n".join(lines[i:])
    return ""


def _has_line(text: str, pattern: str) -> bool:
    return any(re.search(pattern, l) for l in text.splitlines())


# ── Module existence ──────────────────────────────────────────────────

def test_e2e_seed_ts_helper_module_exists(e2e):
    assert e2e["seed"].is_file()


# ── seedAvailable gate ────────────────────────────────────────────────

def test_e2e_seed_ts_exports_seedavailable_function(e2e):
    assert "seedAvailable" in _read(e2e["seed"])


def test_e2e_seed_ts_checks_both_cron_secret_and_sessions_database_url(e2e):
    text = _read(e2e["seed"])
    assert "CRON_SECRET" in text
    assert "SESSIONS_DATABASE_URL" in text


# ── seedAdminTicket ───────────────────────────────────────────────────

def test_e2e_seed_ts_exports_seedadminticket_function(e2e):
    assert "seedAdminTicket" in _read(e2e["seed"])


def test_e2e_seed_ts_inserts_with_is_test_data_true_by_default(e2e):
    assert "is_test_data" in _read(e2e["seed"])


def test_e2e_seed_ts_uses_insert_into_tickets_tickets(e2e):
    assert "INSERT INTO tickets.tickets" in _read(e2e["seed"])


# ── cleanupSeedTicket ─────────────────────────────────────────────────

def test_e2e_seed_ts_exports_cleanupseedticket_function(e2e):
    assert "cleanupSeedTicket" in _read(e2e["seed"])


def test_e2e_seed_ts_cleanup_uses_is_test_data_guard(e2e):
    assert "is_test_data" in _read(e2e["seed"])


# ── Auth-Setup fail-closed (T002199) ──────────────────────────────────

def test_admin_auth_setup_specs_do_not_write_an_empty_state_for_the_admin_path(e2e):
    # Negativ-Aussage: kein writeEmptyState fuer den Admin-Pfad.
    pattern = r"writeEmptyState\((['\"])[a-z-]*(website-admin|brett)\.json\1\)"
    for f in ("mentolder-auth-setup", "korczewski-auth-setup", "brett-mentolder-auth-setup"):
        text = _read(e2e["specs"] / f"{f}.spec.ts")
        m = re.search(pattern, text)
        assert m is None, f"{f}.spec.ts still degrades the admin path to an empty storageState: {m.group(0) if m else ''}"


def test_website_admin_auth_setups_gate_on_cron_secret_the_value_login_via_e2e_actually_uses(e2e):
    for f in ("mentolder-auth-setup", "korczewski-auth-setup"):
        path = e2e["specs"] / f"{f}.spec.ts"
        assert "CRON_SECRET" in _read(path), f"{f}.spec.ts does not reference CRON_SECRET — it gates on the wrong variable"


def test_brett_auth_setups_mark_themselves_fixme_instead_of_returning_silently(e2e):
    for f in ("brett-mentolder-auth-setup", "korczewski-auth-setup"):
        text = _read(e2e["specs"] / f"{f}.spec.ts")
        assert "testInfo.fixme(true" in text, f"{f}.spec.ts has no unconditional testInfo.fixme for the brett login"
    # ... und kein Code-Pfad liest noch die Passwort-Variable.
    text = _read(e2e["specs"] / "brett-mentolder-auth-setup.spec.ts")
    assert not _has_line(text, r"process.env.E2E_ADMIN_PASS")


def test_mentolder_auth_setup_awaits_the_storagestate_write(e2e):
    assert "await page.context().storageState" in _read(e2e["specs"] / "mentolder-auth-setup.spec.ts")


def test_korczewski_auth_setup_names_the_variable_it_actually_reads(e2e):
    assert "E2E_ADMIN_PASS not set" not in _read(e2e["specs"] / "korczewski-auth-setup.spec.ts")


# ── Playwright project assignment (T002199 / RC3) ─────────────────────

def test_fa_51_sidekick_spec_runs_in_the_authenticated_mentolder_project(e2e):
    assert "fa-51" in _project_block(e2e["pwconf"], "mentolder")


def test_fa_51_sidekick_spec_is_not_in_the_unauthenticated_website_project(e2e):
    assert "fa-51" not in _project_block(e2e["pwconf"], "website")


# ── R1: the deployed commit is observable ─────────────────────────────

def test_website_dockerfile_declares_git_sha_in_the_runtime_stage(e2e):
    section = _dockerfile_runtime_stage(e2e["repo"] / "components" / "website" / "Dockerfile")
    assert _has_line(section, r"^ARG GIT_SHA")
    assert _has_line(section, r"^ENV GIT_SHA")


def test_website_dockerfile_declares_built_at_in_the_runtime_stage(e2e):
    section = _dockerfile_runtime_stage(e2e["repo"] / "components" / "website" / "Dockerfile")
    assert _has_line(section, r"^ARG BUILT_AT")
    assert _has_line(section, r"^ENV BUILT_AT")


def test_the_website_build_workflow_passes_git_sha_as_a_build_arg(e2e):
    assert "GIT_SHA=" in _read(e2e["repo"] / ".github" / "workflows" / "build-website.yml")


def test_the_website_build_workflow_passes_built_at_as_a_build_arg(e2e):
    assert "BUILT_AT=" in _read(e2e["repo"] / ".github" / "workflows" / "build-website.yml")


def test_health_endpoint_reports_the_built_commit(e2e):
    health = _read(e2e["repo"] / "components" / "website" / "src" / "pages" / "api" / "health.ts")
    assert "GIT_SHA" in health
    assert "commit" in health


def test_health_endpoint_falls_back_to_unknown_rather_than_omitting_commit(e2e):
    health = _read(e2e["repo"] / "components" / "website" / "src" / "pages" / "api" / "health.ts")
    assert "unknown" in health


# ── R2: drift is visible during the run ───────────────────────────────

def test_globalsetup_compares_deployed_commit_against_tested_sha(e2e):
    gs = _read(e2e["specs"] / "global-db-cleanup.ts")
    assert "DEPLOY_DRIFT" in gs
    assert "GITHUB_SHA" in gs or "/api/health" in gs


# ── R3: drifted runs cannot open tickets ──────────────────────────────

def test_ingest_endpoint_gates_ticket_creation_on_deploy_drift(e2e):
    ingest = _read(e2e["repo"] / "components" / "website" / "src" / "pages" / "sdlc" / "api" / "tests" / "ingest-e2e.ts")
    assert "testedSha" in ingest
    assert "deploy-drift" in ingest


def test_ingest_drift_gate_treats_an_unknown_sha_as_drifted(e2e):
    ingest = _read(e2e["repo"] / "components" / "website" / "src" / "pages" / "sdlc" / "api" / "tests" / "ingest-e2e.ts")
    assert "unknown" in ingest


def test_e2e_workflow_submits_the_tested_sha_to_the_ingest_endpoint(e2e):
    assert "testedSha" in _read(e2e["repo"] / ".github" / "workflows" / "e2e.yml")


# ── R4: setup gates check the variable the code actually reads ────────

def test_login_via_e2e_still_authenticates_via_cron_secret(e2e):
    auth = _read(e2e["repo"] / "tests" / "e2e" / "lib" / "auth.ts")
    assert "const CRON_SECRET = process.env.CRON_SECRET" in auth
    assert "export async function loginViaE2E" in auth


def test_auth_setups_calling_login_via_e2e_gate_on_cron_secret(e2e):
    found = 0
    for f in sorted(e2e["specs"].glob("*-auth-setup.spec.ts")):
        text = f.read_text(encoding="utf-8")
        if "loginViaE2E(" not in text:
            continue
        found = 1
        assert "CRON_SECRET" in text, f"FAIL: {f} calls loginViaE2E but never gates on CRON_SECRET"
    assert found > 0


def test_no_auth_setup_gates_on_a_credential_login_via_e2e_does_not_read(e2e):
    for f in sorted(e2e["specs"].glob("*-auth-setup.spec.ts")):
        text = f.read_text(encoding="utf-8")
        if "loginViaE2E(" not in text:
            continue
        assert not re.search(r"if \(!\s*ADMIN_PASS\s*\)|if \(!process\.env\.E2E_ADMIN_PASS\)", text), \
            f"FAIL: {f} gates the e2e-login path on E2E_ADMIN_PASS"
