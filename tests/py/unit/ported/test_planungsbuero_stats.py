"""Native migration of tests/unit/planungsbuero-stats.bats."""
import json
import os
import shutil
import time

import pytest

STATS_FN = """
function computeStats(items) {
  const planning = items.length;
  const ready = items.filter(i => i.dorScore === 4).length;
  const blocked = items.filter(i => i.dependsOn.length > 0 && i.dorScore < 4).length;
  return { planning, ready, blocked };
}
"""

VALID_EFFORTS = "['klein','mittel','gross']"


@pytest.fixture(autouse=True)
def _tools():
    if shutil.which("node") is None:
        pytest.skip("node required")


def _node(run_cmd, script):
    r = run_cmd(["node", "-e", script])
    r.check(0)
    return json.loads(r.stdout)


def test_fa_pb_01_stats_bei_leerer_liste_0_0_0(run_cmd):
    """FA-PB-01: Stats-Berechnung bei leerer Liste → 0/0/0"""
    result = _node(run_cmd, STATS_FN + "\nconsole.log(JSON.stringify(computeStats([])));\n")
    assert result["planning"] == 0 and result["ready"] == 0 and result["blocked"] == 0


def test_fa_pb_02_stats_bei_2_planning_1_ready_1_blocked(run_cmd):
    """FA-PB-02: Stats bei 2 planning, 1 ready, 1 blocked"""
    body = """
    const items = [
      { dorScore: 2, dependsOn: [] },
      { dorScore: 1, dependsOn: [] },
      { dorScore: 4, dependsOn: [] },
      { dorScore: 2, dependsOn: ['FE-01'] }
    ];
    console.log(JSON.stringify(computeStats(items)));
    """
    result = _node(run_cmd, STATS_FN + body)
    assert result["planning"] == 4 and result["ready"] == 1 and result["blocked"] == 1


def test_fa_pb_03_patch_validierung_lehnt_ungueltigen_effort_wert_ab(run_cmd):
    """FA-PB-03: PATCH-Validierung lehnt ungueltigen effort-Wert ab"""
    body = f"""
    const valid = {VALID_EFFORTS};
    const effort = 'riesig';
    console.log(JSON.stringify({{ ok: valid.includes(effort) }}));
    """
    result = _node(run_cmd, body)
    assert result["ok"] is False


def test_fa_pb_04_rang_update_via_patch_aktualisiert_planning_rank(run_cmd):
    """FA-PB-04: Rang-Update via PATCH aktualisiert planning_rank"""
    url = os.environ.get("TRACKING_DB_URL") or os.environ.get("SESSIONS_DB_URL") or ""
    if shutil.which("psql") is None:
        pytest.skip("keine DB verfügbar (offline)")
    probe = run_cmd(["psql", url, "-c", "SELECT 1"], timeout=300)
    if probe.returncode != 0:
        pytest.skip("keine DB verfügbar (offline)")

    sessions_url = os.environ.get("SESSIONS_DATABASE_URL", "")
    ext_id = f"pb-test-{int(time.time())}"
    run_cmd(
        [
            "psql", sessions_url, "-c",
            "\n    INSERT INTO tickets.tickets (type, brand, title, status, planning_rank, external_id, readiness)\n"
            f"    VALUES ('feature', 'mentolder', 'PB-Test', 'planning', 5, '{ext_id}', '{{}}'::jsonb)\n  ",
        ],
        timeout=300,
    ).check(0)
    run_cmd(
        [
            "psql", sessions_url, "-c",
            "\n    UPDATE tickets.tickets SET planning_rank = 0 WHERE external_id = '" + ext_id + "'\n  ",
        ],
        timeout=300,
    ).check(0)
    rank = run_cmd(
        [
            "psql", sessions_url, "-t", "-A", "-c",
            "\n    SELECT planning_rank FROM tickets.tickets WHERE external_id = '" + ext_id + "'\n  ",
        ],
        timeout=300,
    ).stdout.strip()
    run_cmd(
        ["psql", sessions_url, "-c", f"DELETE FROM tickets.tickets WHERE external_id = '{ext_id}'"],
        timeout=300,
    )
    assert rank == "0"


def test_fa_pb_05_get_response_enthaelt_stats_objekt_mit_korrekten_keys(run_cmd):
    """FA-PB-05: GET-Response enthaelt stats-Objekt mit korrekten Keys"""
    body = """
    const stats = computeStats([{ dorScore: 4, dependsOn: [] }]);
    console.log(JSON.stringify({
      hasKeys: ['planning','ready','blocked'].every(k => k in stats),
      values: Object.keys(stats).sort()
    }));
    """
    result = _node(run_cmd, STATS_FN + body)
    assert result["hasKeys"] is True
    assert result["values"] == ["blocked", "planning", "ready"]
