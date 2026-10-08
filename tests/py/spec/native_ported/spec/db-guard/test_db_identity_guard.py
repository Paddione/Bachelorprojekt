"""Native migration of tests/spec/db-guard/db-identity-guard.bats."""

import os
import re
import subprocess

import pytest

EXPECTED_UUID = "9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00"
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

KUBECTL_STUB = """#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then printf '%s\\n' "${POD_LINES:-pod/shared-db-0}"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  input="$(cat)"
  if [[ "$input" == *"db_identity"* ]]; then printf '%s' "${IDENTITY_ANSWER-}"; fi
  exit 0
fi
exit 0
"""


@pytest.fixture
def ctx(repo_root, tmp_path):
    """BATS setup: Pfade und kubectl-Stub (PATH-Vorrang)."""
    stubdir = tmp_path / "stub"
    stubdir.mkdir()
    kubectl = stubdir / "kubectl"
    kubectl.write_text(KUBECTL_STUB, encoding="utf-8")
    kubectl.chmod(0o755)
    return {
        "core": repo_root / "scripts/vda/ticket/_ticket-core.sh",
        "migration": repo_root / "migrations/20260824-db-identity-marker.sql",
        "stubdir": stubdir,
    }


def _run_bash(c, script, extra_env):
    """Wie `run env PATH=... bash -c ...`; stdin auf /dev/null (kubectl-Stub liest stdin via cat)."""
    env = os.environ.copy()
    env["PATH"] = f"{c['stubdir']}:{os.environ.get('PATH', '')}"
    # _ticket-core.sh schaltet den BATS-Sentinel-Regime (T002224) ueber BATS_TEST_NAME/BATS_VERSION
    # ein. Der Port setzt nur diese Ausloeser, die Testlogik laeuft ohne bats.
    env["BATS_TEST_NAME"] = "t015168-native-port"
    env.update(extra_env)
    return subprocess.run(
        ["bash", "-c", script],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )


def _pgpod(c, pod_lines, identity_answer, test_db_ok, extra_env=None):
    env = {"POD_LINES": pod_lines, "IDENTITY_ANSWER": identity_answer, "TICKET_TEST_DB_OK": test_db_ok}
    env.update(extra_env or {})
    script = f"source '{c['core']}'; NS='workspace'; CTX='fleet'; _pgpod"
    return _run_bash(c, script, env)


def _out(r):
    """BATS-$output-Nachbau: stdout und stderr, getrimmt."""
    parts = [r.stdout.rstrip("\n"), r.stderr.rstrip("\n")]
    return "\n".join(p for p in parts if p)


def test_t015168_pgpod_bricht_bei_zwei_running_pods_laut_ab_und_nennt_beide_kandidaten(ctx):
    r = _pgpod(ctx, "pod/shared-db-0\npod/shared-db-ghost", "", "1")
    assert r.returncode != 0, "_pgpod hat Mehrfachtreffer still durchgelassen"
    out = _out(r)
    assert "shared-db-0" in out and "shared-db-ghost" in out, f"Kandidatenliste unvollstaendig: {out}"


def test_t015168_fehlender_marker_bricht_ab_und_nennt_db_migrate_remediation(ctx):
    r = _pgpod(ctx, "pod/shared-db-0", "", "1")
    assert r.returncode != 0, "leerer Marker wurde durchgelassen"
    assert "db:migrate" in _out(r), f"Remediation fehlt: {_out(r)}"


def test_t015168_marker_mismatch_bricht_ab_und_nennt_beide_werte(ctx):
    r = _pgpod(ctx, "pod/shared-db-0", "00000000-0000-0000-0000-000000000000", "1")
    assert r.returncode != 0, "fremder Marker wurde akzeptiert"
    out = _out(r)
    assert EXPECTED_UUID in out and "00000000" in out, f"Mismatch-Meldung unvollstaendig: {out}"


def test_t015168_escape_hatch_ticket_allow_unverified_db_warnt_statt_abzubrechen(ctx):
    env = {
        "POD_LINES": "pod/shared-db-0",
        "IDENTITY_ANSWER": "",
        "TICKET_TEST_DB_OK": "1",
        "TICKET_ALLOW_UNVERIFIED_DB": "1",
    }
    r = _run_bash(ctx, f"source '{ctx['core']}'; NS='workspace'; CTX='fleet'; _pgpod", env)
    assert r.returncode == 0, f"Hatch hat trotzdem abgebrochen: {_out(r)}"
    assert "WARN" in _out(r), "Hatch ohne Warnung"


def test_t015168_bats_sentinel_regime_ueberspringt_die_marker_probe(ctx):
    # Kein TICKET_TEST_DB_OK -> Sentinel-Regime -> Probe skip, Aufruf gelingt.
    r = _pgpod(ctx, "pod/shared-db-0", "", "")
    assert r.returncode == 0, f"Probe lief im Sentinel-Regime: {_out(r)}"


def test_t015168_uuid_konstante_ist_in_migration_und_guard_identisch_paritaet(ctx):
    assert ctx["migration"].is_file(), f"Migrationsdatei fehlt: {ctx['migration']}"
    mig = UUID_RE.search(ctx["migration"].read_text(encoding="utf-8"))
    core = UUID_RE.search(ctx["core"].read_text(encoding="utf-8"))
    assert mig is not None, "keine UUID in Migration"
    assert core is not None, "keine UUID in _ticket-core.sh"
    assert mig.group(0) == core.group(0), f"Paritaet verletzt: migration={mig.group(0)} core={core.group(0)}"
