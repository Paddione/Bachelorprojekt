"""Native migration of tests/unit/quality-loop.bats."""

# quality-loop.bats — Unit tests for scripts/code-quality/loop.sh
# Stubs: ticket.sh, psql seam (QUALITY_LOOP_PSQL_CMD), groups seam.
# All tests run offline — no live cluster or DB required.

import os
import re
from pathlib import Path

import pytest

GROUPS_JSON = """[
  {
    "gate": "S1",
    "subsystem": "website",
    "count": 15,
    "title": "CQ-GATE:S1:website — 15 Dateien kürzen",
    "violation_keys": ["S1:components/website/src/pages/foo.astro", "S1:components/website/src/pages/bar.astro"]
  },
  {
    "gate": "S3",
    "subsystem": "infra-manifests",
    "count": 3,
    "title": "CQ-GATE:S3:infra-manifests — 3 Hostnames extrahieren",
    "violation_keys": ["S3:k3d/foo.yaml:x.mentolder.de"]
  }
]
"""

TICKET_STUB = """#!/usr/bin/env bash
echo "$@" >> "${TICKET_CALLS_LOG}"
case "${1:-}" in
  create) echo "T000999|42" ;;
  *) exit 0 ;;
esac
"""

KUBECTL_STUB = """#!/usr/bin/env bash
echo "UNEXPECTED kubectl: $*" >&2; exit 1
"""

PSQL_STUB = """#!/usr/bin/env bash
# Reads SQL from stdin, returns empty (no open tickets)
cat > /dev/null
echo ""
"""

DEDUP_PSQL_STUB = """#!/usr/bin/env bash
sql="$(cat)"
if echo "$sql" | grep -q "S1:website"; then
  echo "CQ-GATE:S1:website — 15 Dateien kürzen"
else
  echo ""
fi
"""


def _write_exec(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)
    return path


@pytest.fixture
def stubs(repo_root, tmp_path):
    fake_bin = tmp_path / "fake-bin"
    fake_bin.mkdir()
    _write_exec(fake_bin / "ticket.sh", TICKET_STUB)
    _write_exec(fake_bin / "kubectl", KUBECTL_STUB)
    calls_log = tmp_path / "ticket_calls.log"
    groups = tmp_path / "groups.json"
    groups.write_text(GROUPS_JSON, encoding="utf-8")
    psql = _write_exec(fake_bin / "psql-stub.sh", PSQL_STUB)
    env = {
        "PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '')}",
        "FAKE_BIN": str(fake_bin),
        "TICKET_CALLS_LOG": str(calls_log),
        "QUALITY_GROUPS_FIXTURE": str(groups),
        "QUALITY_LOOP_PSQL_CMD": str(psql),
    }
    script = repo_root / "scripts" / "code-quality" / "loop.sh"
    return {"env": env, "fake_bin": fake_bin, "calls_log": calls_log, "groups": groups, "script": script}


def _create_count(calls_log: Path) -> int:
    """grep -c "^create" on the ticket.sh call log, 0 if the log is absent."""
    if not calls_log.is_file():
        return 0
    return sum(1 for line in calls_log.read_text(encoding="utf-8").splitlines() if line.startswith("create"))


# ── DRY_RUN tests ─────────────────────────────────────────────────────────────


def test_dry_run_1_with_empty_baseline_exits_0_and_creates_zero_tickets(run_cmd, stubs):
    env = dict(stubs["env"], DRY_RUN="1", QUALITY_LOOP_GROUPS_CMD="printf '[]'")
    result = run_cmd(["bash", str(stubs["script"])], env=env, timeout=300)
    assert result.returncode == 0, result.output
    assert not stubs["calls_log"].exists()


def test_dry_run_1_with_two_groups_prints_both_groups_and_no_side_effects(run_cmd, stubs):
    env = dict(stubs["env"], DRY_RUN="1", QUALITY_LOOP_GROUPS_CMD=f"cat {stubs['groups']}")
    result = run_cmd(["bash", str(stubs["script"])], env=env, timeout=300)
    assert result.returncode == 0, result.output
    assert "CQ-GATE:S1:website" in result.output
    assert "CQ-GATE:S3:infra-manifests" in result.output
    assert "[DRY_RUN]" in result.output
    assert not stubs["calls_log"].exists()


# ── Throttle test ─────────────────────────────────────────────────────────────


def test_max_new_1_with_2_eligible_groups_creates_exactly_one_ticket(run_cmd, stubs):
    # psql stub already returns empty (no existing tickets)
    env = dict(stubs["env"], MAX_NEW="1", QUALITY_LOOP_GROUPS_CMD=f"cat {stubs['groups']}")
    result = run_cmd(["bash", str(stubs["script"])], env=env, timeout=300)
    assert result.returncode == 0, result.output
    assert _create_count(stubs["calls_log"]) == 1


# ── Dedup test ────────────────────────────────────────────────────────────────


def test_open_cq_gate_s1_website_ticket_causes_that_group_to_be_skipped(run_cmd, stubs):
    # psql stub: echo the open-ticket title when SQL contains S1:website, else empty
    dedup = _write_exec(stubs["fake_bin"] / "dedup-psql-stub.sh", DEDUP_PSQL_STUB)
    env = dict(
        stubs["env"],
        MAX_NEW="2",
        QUALITY_LOOP_GROUPS_CMD=f"cat {stubs['groups']}",
        QUALITY_LOOP_PSQL_CMD=str(dedup),
    )
    result = run_cmd(["bash", str(stubs["script"])], env=env, timeout=300)
    assert result.returncode == 0, result.output
    # Only S3:infra-manifests should have been created
    assert _create_count(stubs["calls_log"]) == 1
    log = stubs["calls_log"].read_text(encoding="utf-8")
    assert re.search("S3:infra-manifests", log), "S3:infra-manifests ticket missing from ticket.sh log"
