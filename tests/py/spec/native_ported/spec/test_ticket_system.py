"""Native migration of tests/spec/ticket-system.bats."""
# The ticket core keeps a fail-closed sentinel that is armed whenever
# BATS_TEST_NAME (or BATS_VERSION) is set in the environment, and real bats
# always exports BATS_TEST_NAME into every test. The autouse fixture below sets
# the same variable so the production guard stays active under pytest and no
# test reaches the live cluster (T002224).
# Static (grep) assertions are reimplemented as line-based searches over the

# source files, matching grep semantics: fixed-string or regex per assertion.

import os
import re
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def bats_regime_env(monkeypatch, request):
    monkeypatch.setenv("BATS_TEST_NAME", request.node.name)


@pytest.fixture
def root(repo_root: Path) -> Path:
    return repo_root


@pytest.fixture
def sh(run_cmd, root):
    def _sh(command: str, env=None):
        return run_cmd(["bash", "-c", command], cwd=root, env=env)
    return _sh


def _lines(root: Path, rel: str) -> list[str]:
    path = root / rel
    if not path.is_file():
        return []
    return path.read_text(encoding="utf-8", errors="replace").split("\n")


def _match(line: str, pattern: str, fixed: bool) -> bool:
    return (pattern in line) if fixed else re.search(pattern, line) is not None


def _has(root: Path, rel: str, pattern: str, fixed: bool = True) -> bool:
    return any(_match(l, pattern, fixed) for l in _lines(root, rel))


def _count(root: Path, rel: str, pattern: str, fixed: bool = True) -> int:
    return sum(1 for l in _lines(root, rel) if _match(l, pattern, fixed))


def _after(root: Path, rel: str, anchor: str, n: int, pattern: str, fixed: bool = True) -> int:
    """grep -A<n> anchor | grep -c pattern: count matching lines in the anchor windows."""
    lines = _lines(root, rel)
    selected = set()
    for i, line in enumerate(lines):
        if anchor in line:
            selected.update(range(i, min(len(lines), i + n + 1)))
    return sum(1 for i in sorted(selected) if _match(lines[i], pattern, fixed))


def _first_line(root: Path, rel: str, pattern: str, fixed: bool = True) -> int:
    for i, line in enumerate(_lines(root, rel), 1):
        if _match(line, pattern, fixed):
            return i
    return 0


US = "scripts/vda/ticket/update-status.sh"
GET = "scripts/vda/ticket/get.sh"
TRANSITION = "components/website/src/lib/tickets/transition.ts"
TICKET_SH = "scripts/ticket.sh"
CORE = "scripts/vda/ticket/_ticket-core.sh"
AUDIT = "scripts/vda/ticket/readiness-audit.sh"
MIGRATIONS_TS = "components/website/src/lib/tickets/migrations.ts"
TABLES_TS = "components/website/src/lib/tickets/tables/tickets.ts"
TYPE_VOCAB_TS = "components/website/src/lib/tickets/migrate-type-vocabulary.ts"
MISHAP_GO = "scripts/ticket-mcp/go/internal/tools/mishap.go"


# ── placeholder ──────────────────────────────────────────────────────────────

def test_ticket_system_spec_covered(sh):
    assert sh("true").returncode == 0


# ── [T002230] resolution survives an update-status call that omits it ───────

def test_t002230_update_status_preserves_existing_resolution_when_none_passed(root):
    assert _has(root, US, "COALESCE(NULLIF(:'res', ''), resolution)")


def test_t002230_update_status_no_longer_nulls_resolution_unconditionally(root):
    assert not _has(root, US, r"^ *resolution = NULLIF\(:'res', *''\), *$", fixed=False)


def test_t002230_update_status_still_clears_resolution_on_non_terminal_status(root):
    anchor = "WHEN :'status' IN ('done','archived') THEN COALESCE"
    assert _has(root, US, "WHEN :'status' IN ('done','archived') THEN COALESCE(NULLIF(:'res', ''), resolution)")
    lines = _lines(root, US)
    out = set()
    for i, line in enumerate(lines):
        if anchor in line:
            out.update([i, i + 1] if i + 1 < len(lines) else [i])
    assert any("ELSE NULL" in lines[i] for i in out)


# ── [T002284] get.sh projects resolution, severity, description ─────────────

def test_t002284_get_sh_projects_resolution_in_json_output(root):
    assert _has(root, GET, "'resolution', t.resolution")


def test_t002284_get_sh_projects_severity_and_description_in_json_output(root):
    assert _has(root, GET, "'severity', t.severity")
    assert _has(root, GET, "'description', t.description")


def test_t002230_both_write_paths_agree_that_resolution_is_terminal_only(root):
    assert _has(root, TRANSITION, "resolution = CASE")
    assert _has(root, TRANSITION, "COALESCE($2, resolution)")
    assert _has(root, TRANSITION, "ELSE NULL")


# ── [T002280] BRAND/NS resolution is never inferred from free-text args ─────

def test_t002280_freitext_in_title_does_not_influence_ns_resolution(sh, monkeypatch):
    res = sh("bash scripts/ticket.sh --resolve-ns-only create --type bug "
             "--title 'korczewski-home E2E test regression' --description 'irrelevant'")
    assert res.returncode == 0, res.output
    assert "NS=workspace" in res.output
    assert "workspace-korczewski" not in res.output


def test_t002280_explicit_brand_wins_against_contradicting_freitext(sh, monkeypatch):
    # Positiv-Anker: der Kontrast-Check greift ueberhaupt.
    res = sh("env BRAND=mentolder bash scripts/ticket.sh create --type bug --brand korczewski "
             "--title 'irrelevant' --description 'irrelevant'")
    assert res.returncode == 2, res.output
    assert "widerspricht top-level BRAND" in res.output

    # KERN: derselbe Widerspruch nur im Freitext.
    monkeypatch.delenv("BRAND", raising=False)
    res = sh("bash scripts/ticket.sh create --type bug --brand korczewski "
             "--title 'mentolder rollout notes' --description 'irrelevant'")
    assert "widerspricht top-level BRAND" not in res.output
    assert "no shared-db pod" in res.output

    res = sh("bash scripts/ticket.sh --resolve-ns-only create --type bug --brand korczewski "
             "--title 'mentolder rollout notes' --description 'irrelevant'")
    assert res.returncode == 0, res.output
    assert res.output == "NS=workspace"


def test_t002280_invalid_brand_value_is_rejected(sh):
    res = sh("bash scripts/ticket.sh --resolve-ns-only create --type bug --brand acme --title 'x'")
    assert res.returncode == 2


def test_t002280_no_signal_keeps_default_mentolder_unchanged(sh):
    res = sh("bash scripts/ticket.sh --resolve-ns-only update-status --id T000001 --status done")
    assert res.returncode == 0, res.output
    assert "NS=workspace" in res.output


# ── [T002282] update-status must respect the agent-lock claim ───────────────

def test_t002282_m3_update_status_refuses_write_on_foreign_agent_lock_claim(root, run_cmd, tmp_path, monkeypatch):
    ald = tmp_path / "ald"
    ald.mkdir()
    monkeypatch.delenv("CLAUDE_CODE_SESSION_ID", raising=False)
    monkeypatch.delenv("AGENT_LOCK_SID", raising=False)
    lock = str(root / "scripts" / "agent-lock.sh")

    res = run_cmd(["bash", lock, "claim", "ticket", "T002282", "--label", "foreign-session"],
                  env={"AGENT_LOCK_DIR": str(ald), "CLAUDE_CODE_SESSION_ID": "",
                       "CLAUDE_SESSION_ID": "t002282-session-a"})
    assert res.returncode == 0, res.output

    res = run_cmd(["bash", lock, "check", "ticket", "T002282"],
                  env={"AGENT_LOCK_DIR": str(ald), "CLAUDE_CODE_SESSION_ID": "",
                       "CLAUDE_SESSION_ID": "t002282-session-b"})
    assert res.returncode == 3, res.output

    res = run_cmd(["bash", str(root / "scripts" / "ticket.sh"), "update-status",
                   "--id", "T002282", "--status", "in_progress"],
                  cwd=root,
                  env={"AGENT_LOCK_DIR": str(ald), "CLAUDE_CODE_SESSION_ID": "",
                       "CLAUDE_SESSION_ID": "t002282-session-b"})
    assert res.returncode != 0
    assert "agent-lock" in res.output.lower(), f"keine agent-lock-Ablehnung: {res.output}"
    assert "no shared-db pod found" not in res.output, f"Guard griff nicht: {res.output}"


def test_t003102_update_status_done_is_let_through_despite_foreign_ticket_lock(root, run_cmd, tmp_path, monkeypatch):
    ald = tmp_path / "ald"
    ald.mkdir()
    monkeypatch.delenv("CLAUDE_CODE_SESSION_ID", raising=False)
    monkeypatch.delenv("AGENT_LOCK_SID", raising=False)
    lock = str(root / "scripts" / "agent-lock.sh")

    res = run_cmd(["bash", lock, "claim", "ticket", "T003102", "--label", "ticket-ops"],
                  env={"AGENT_LOCK_DIR": str(ald), "CLAUDE_CODE_SESSION_ID": "",
                       "CLAUDE_SESSION_ID": "t003102-session-a"})
    assert res.returncode == 0, res.output

    res = run_cmd(["bash", lock, "check", "ticket", "T003102"],
                  env={"AGENT_LOCK_DIR": str(ald), "CLAUDE_CODE_SESSION_ID": "",
                       "CLAUDE_SESSION_ID": "t003102-session-b"})
    assert res.returncode == 3, res.output

    res = run_cmd(["bash", str(root / "scripts" / "ticket.sh"), "update-status",
                   "--id", "T003102", "--status", "done"],
                  cwd=root,
                  env={"AGENT_LOCK_DIR": str(ald), "CLAUDE_CODE_SESSION_ID": "",
                       "CLAUDE_SESSION_ID": "t003102-session-b"})
    low = res.output.lower()
    assert "verweigert" not in low, f"Guard blockte den Abschluss trotz T003102: {res.output}"
    assert "durchgelassen" in low, f"Keine T003102-Warnung: {res.output}"
    assert ("no shared-db pod found" in low) or ("shared-db" in low), (
        f"Write kam nicht bis zum Cluster-Zugriff: {res.output}")


# ── [T002307] _pgpod must select a Running shared-db pod ────────────────────

KUBECTL_STUB = """#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  if [[ "$*" == *"--field-selector"*"status.phase=Running"* ]]; then
    echo "pod/shared-db-live"
  else
    echo "pod/shared-db-completed"
    echo "pod/shared-db-live"
  fi
  exit 0
fi
exit 0
"""


def test_t002307_pgpod_skips_completed_shared_db_pod_and_returns_running_one(run_cmd, root, tmp_path):
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    kubectl = mockdir / "kubectl"
    kubectl.write_text(KUBECTL_STUB, encoding="utf-8")
    kubectl.chmod(0o755)
    res = run_cmd(
        ["bash", "-c", f'source "{root}/scripts/vda/ticket/_ticket-core.sh"; _pgpod'],
        env={"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}"},
    )
    assert res.returncode == 0, res.output
    assert res.output == "pod/shared-db-live"


def test_t002307_pgpod_asks_api_server_for_running_pods_only(root):
    assert _has(root, CORE, "--field-selector status.phase=Running")


# ── [T002388] plan-meta must merge readiness, not replace it ────────────────

def test_t002388_plan_meta_set_merges_new_readiness_into_existing_column(root):
    assert _has(root, TICKET_SH,
                "readiness         = COALESCE(readiness,'{}'::jsonb) || COALESCE(")


def test_t002388_replacing_readiness_assignment_is_gone_not_merely_shadowed(root):
    assert not _has(root, TICKET_SH, "readiness         = COALESCE($readiness_sql, readiness)")


def test_t002388_omitted_readiness_is_a_no_op_rather_than_column_wipe(root):
    assert _has(root, TICKET_SH, "COALESCE($readiness_sql, '{}'::jsonb)")


def test_t002388_every_readiness_writer_in_ticket_sh_uses_merge_form(root):
    assert _count(root, TICKET_SH, r"readiness +=? *COALESCE\(\$[a-z_]+, *readiness\)", fixed=False) == 0


def test_t002388_readiness_audit_module_exists(root):
    assert (root / AUDIT).is_file()


def test_t002388_ticket_dispatcher_routes_readiness_audit_to_module(root):
    assert _has(root, "scripts/vda/ticket.sh", "readiness-audit")


def test_t002388_readiness_audit_never_writes_to_database(root):
    assert (root / AUDIT).is_file()
    assert _count(root, AUDIT, r"^[^#]*\b(UPDATE|INSERT|DELETE)\b", fixed=False) == 0


def test_t002388_lock_heuristic_tests_key_absence_not_falsy_value(root):
    assert _has(root, AUDIT, "'lastenheft_locked'")
    assert _count(root, AUDIT, r"NOT +[a-z_]*\.?readiness *\? *'lastenheft_locked'", fixed=False) > 0


# ── [T002329] tickets.type uses the Conventional-Commit vocabulary ──────────

def test_t002329_vocabulary_migration_lives_in_its_own_module(root):
    assert (root / TYPE_VOCAB_TS).is_file()


def test_t002329_migrations_ts_calls_the_extracted_vocabulary_migration(root):
    assert _count(root, MIGRATIONS_TS, "applyTypeVocabularyMigration") > 0


def test_t002329_type_check_is_set_as_named_constraint(root):
    assert _has(root, TYPE_VOCAB_TS, "ADD CONSTRAINT tickets_type_check")


def test_t002329_inline_check_clause_on_type_add_column_is_removed(root):
    assert _count(root, MIGRATIONS_TS, "ADD COLUMN IF NOT EXISTS type TEXT CHECK") == 0


def test_t002329_type_check_knows_the_six_new_values(root):
    assert _after(root, TYPE_VOCAB_TS, "ADD CONSTRAINT tickets_type_check", 5, "'refactor'") > 0


def test_t002329_type_check_accepts_legacy_values_during_transition(root):
    assert _after(root, TYPE_VOCAB_TS, "ADD CONSTRAINT tickets_type_check", 5, "'bug'") > 0


def test_t002329_existing_data_is_migrated_by_where_filtered_update(root):
    assert _count(root, TYPE_VOCAB_TS, "WHERE type IN ('bug','feature','task')") > 0


def test_t002329_constraint_is_extended_before_data_rewrite(root):
    c = _first_line(root, TYPE_VOCAB_TS, "ADD CONSTRAINT tickets_type_check")
    u = _first_line(root, TYPE_VOCAB_TS, "WHERE type IN ('bug','feature','task')")
    assert c and u, "constraint or update line missing"
    assert c < u


def test_t002329_v_active_features_reads_both_vocabularies(root):
    assert _after(root, TABLES_TS, "CREATE OR REPLACE VIEW tickets.v_active_features", 16,
                  "type IN ('feature','feat')") > 0


def test_t002329_v_factory_metrics_counts_both_vocabularies(root):
    assert _after(root, TABLES_TS, "CREATE OR REPLACE VIEW tickets.v_factory_metrics", 12,
                  "type IN ('feature','feat')") > 0


def test_t002329_notify_trigger_fires_for_feat_too(root):
    assert _count(root, MIGRATIONS_TS, r"NEW.type IN \('feature','feat'\)", fixed=False) > 0


def test_t002329_ticket_mcp_validates_against_new_vocabulary(root):
    assert _count(root, "scripts/ticket-mcp/go/internal/tools/triage.go", '"chore"') > 0


# ── [T002375-p3] CLI flag drift between stage-plan and archive-plan ─────────

def test_t002375_p3_stage_plan_accepts_plan_file_as_alias_of_plan(sh):
    res = sh("cd . && bash scripts/ticket.sh stage-plan --plan-file /nonexistent/x.md 2>&1 "
             "| grep -c 'Unknown stage-plan option'")
    assert res.output == "0", "--plan-file gilt weiterhin als unbekanntes Flag"

    res = sh("cd . && bash scripts/ticket.sh stage-plan --plan-file /nonexistent/x.md 2>&1 "
             "| grep -c 'ERROR: --id is required'")
    assert res.output == "1", "der Aufruf erreichte die --id-Pflichtpruefung nicht"


def test_t002375_p3_a_really_unknown_flag_exits_2_and_names_valid_flags(sh):
    res = sh("cd . && bash scripts/ticket.sh stage-plan --partials 1 2>&1 | grep -c 'Unknown stage-plan option'")
    assert res.output == "0", "gueltiges Flag --partials wurde als unbekannt gemeldet"

    res = sh("cd . && bash scripts/ticket.sh stage-plan --slug foo >/dev/null 2>&1")
    assert res.returncode == 2, f"erwartet Exit 2 fuer --slug, bekam {res.returncode}"

    res = sh("cd . && bash scripts/ticket.sh stage-plan --slug foo 2>&1 | grep -c 'Gueltige Flags:'")
    assert res.output == "1", "die Fehlermeldung nennt die gueltigen Flags nicht"

    res = sh("cd . && bash scripts/ticket.sh stage-plan --slug foo 2>&1 | grep -c 'plan-file'")
    assert int(res.output) >= 1, "die Fehlermeldung nennt --plan-file nicht"


def test_t002375_p3_error_message_warns_about_immediate_factory_pickup_without_hold(sh):
    res = sh("cd . && bash scripts/ticket.sh stage-plan --slug foo 2>&1 | grep -c -- '--hold'")
    assert int(res.output) >= 1, "die Fehlermeldung erwaehnt --hold nicht"


# ── [T002382-M2] update-status.sh guard: done -> non-terminal forbidden ─────

def test_t002382_m2_update_status_forbids_done_to_non_terminal_transitions(root):
    assert _has(root, US, "ERROR: Cannot transition from 'done'")
    assert _has(root, US, "terminal tickets can only transition to 'archived'")


def test_t002382_m2_update_status_forbids_archived_to_anything(root):
    assert _has(root, US, "ERROR: Cannot transition from 'archived'")


def test_t002382_m2_update_status_allows_done_to_archived(root):
    assert _has(root, US, "done:archived")


# ── [T002876] update-status.sh guard: plan_staged requires FACTORY-PLAN-REF ─

def test_t002876_update_status_forbids_plan_staged_without_factory_plan_ref_comment(root):
    assert _has(root, US, "plan_staged")
    assert _has(root, US, "FACTORY-PLAN-REF")
    assert _has(root, US, "ERROR: Cannot transition to 'plan_staged'")


def test_t002876_update_status_checks_ticket_comments_for_plan_reference(root):
    assert _has(root, US, "ticket_comments")


def test_t002876_update_status_plan_staged_guard_is_pre_update_select(root):
    assert _has(root, US, "SELECT status FROM tickets.tickets")


# ── [T002382-M3] transition.ts guard: done -> non-terminal forbidden ────────

def test_t002382_m3_transition_ts_forbids_done_to_non_terminal(root):
    assert _has(root, TRANSITION, "Cannot transition from 'done'")


def test_t002382_m3_transition_ts_forbids_archived_to_anything(root):
    assert _has(root, TRANSITION, "Cannot transition from 'archived'")


def test_t002382_m3_transition_ts_uses_coalesce_for_resolution_preservation(root):
    assert _has(root, TRANSITION, "COALESCE($2, resolution)")


# ── [T002407-M1] DB type 'incident' is registered ───────────────────────────

def test_t002407_m1a_migrate_type_vocabulary_lists_incident_in_new_types(root):
    assert _has(root, TYPE_VOCAB_TS, "'incident'")


def test_t002407_m1b_migrate_type_vocabulary_constraint_check_knows_incident(root):
    assert _after(root, TYPE_VOCAB_TS, "ADD CONSTRAINT tickets_type_check", 20, "'incident'") > 0


def test_t002407_m1c_tables_tickets_inline_check_knows_incident(root):
    assert _count(root, TABLES_TS, "'incident'") > 0


def test_t002407_m1d_cockpit_labels_has_type_labels_incident(root):
    labels = "components/website/src/lib/tickets/cockpit-labels.ts"
    matching = [l for l in _lines(root, labels) if "incident:" in l]
    assert sum(1 for l in matching if "Incident" in l) > 0


# ── [T002407-M3] incident tickets have attention_mode=needs_human ───────────

def test_t002407_m3a_mishap_go_treats_incident_as_immediate_ticket_type(root):
    assert _has(root, MISHAP_GO, "isIncidentType(mtype)")
    assert _has(root, MISHAP_GO, '"incident"')


def test_t002407_m3b_mishap_go_recognises_broken_and_security_as_incident_aliases(root):
    assert _has(root, MISHAP_GO, '"broken"')


# ── [T003072] terminal-guard repair: invalid done is exempt ─────────────────

def test_t003072_update_status_exempts_invalid_done_resolution_null_no_lifecycle(root):
    assert _has(root, US, "resolution IS NULL")
    assert _has(root, US, "created_at = updated_at")
    assert any("invalid done" in l.lower() for l in _lines(root, US))


def test_t003072_transition_ts_mirrors_the_exemption(root):
    assert _has(root, TRANSITION, "resolution IS NULL")
    assert _has(root, TRANSITION, "created_at")
