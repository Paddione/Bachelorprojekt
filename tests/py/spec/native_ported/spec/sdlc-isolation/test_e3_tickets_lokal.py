"""Native migration of tests/spec/sdlc-isolation/e3-tickets-lokal.bats."""
import os
import re

TICKET_SH = "scripts/ticket.sh"
MIGRATE = "scripts/sdlc/migrate-tickets.sh"


def test_e3_sdlc_kontext_loest_auf_workspace_auf_nicht_workspace_dev(run_cmd, repo_root):
    res = run_cmd(
        ["bash", TICKET_SH, "--resolve-ns-only", "get", "--id", "T000001"],
        cwd=repo_root,
        env={"TICKET_CTX": "devmesh", "BRAND": "mentolder"},
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert res.output == "NS=workspace"


def test_e3_historischer_fleet_dev_kontext_behaelt_sein_dev_suffix(run_cmd, repo_root):
    res = run_cmd(
        ["bash", TICKET_SH, "--resolve-ns-only", "get", "--id", "T000001"],
        cwd=repo_root,
        env={"TICKET_CTX": "gekko-hetzner-2-dev", "BRAND": "mentolder"},
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert res.output == "NS=workspace-dev"


def test_e3_t002689_korczewski_loest_auf_denselben_sdlc_namespace_auf_wie_mentolder(run_cmd, repo_root):
    res = run_cmd(
        ["bash", TICKET_SH, "--resolve-ns-only", "get", "--id", "T000001"],
        cwd=repo_root,
        env={"TICKET_CTX": "devmesh", "BRAND": "korczewski"},
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert res.output == "NS=workspace"


def test_t900013_ohne_ticket_ctx_adressiert_der_ticket_pfad_den_fleet_cluster(run_cmd, repo_root, tmp_path):
    stubdir = tmp_path / "bin"
    stubdir.mkdir()
    stub = stubdir / "kubectl"
    stub.write_text(
        "#!/usr/bin/env bash\n"
        "# Protokolliert den --context-Wert und liefert sonst nichts.\n"
        "while [[ $# -gt 0 ]]; do\n"
        "  case \"$1\" in\n"
        "    --context) echo \"CONTEXT=$2\" >> \"$KUBECTL_LOG\"; shift 2 ;;\n"
        "    *) shift ;;\n"
        "  esac\n"
        "done\n"
        "exit 0\n",
        encoding="utf-8",
    )
    stub.chmod(0o755)
    kubectl_log = tmp_path / "kubectl.log"
    kubectl_log.write_text("", encoding="utf-8")

    # TICKET_TEST_DB_OK=1 lifts the sentinel; the stub intercepts every kubectl call.
    res = run_cmd(
        [
            "env", "-u", "TICKET_CTX",
            "bash", TICKET_SH, "get", "--id", "T000001",
        ],
        cwd=repo_root,
        env={
            "PATH": f"{stubdir}{os.pathsep}{os.environ.get('PATH', '')}",
            "KUBECTL_LOG": str(kubectl_log),
            "TICKET_TEST_DB_OK": "1",
            "BRAND": "mentolder",
        },
        timeout=300,
    )
    log = kubectl_log.read_text(encoding="utf-8")
    # Positive anchor first: the resolution path was entered at all.
    assert log.strip(), f"kubectl stub not called (exit {res.returncode}): {res.output}"
    assert "CONTEXT=fleet" in log
    assert log.count("CONTEXT=devmesh") == 0


def test_t900013_ein_expliziter_ticket_ctx_ueberschreibt_den_fleet_default(run_cmd, repo_root):
    res = run_cmd(
        ["bash", TICKET_SH, "--resolve-ns-only", "get", "--id", "T000001"],
        cwd=repo_root,
        env={"TICKET_CTX": "fleet", "BRAND": "mentolder"},
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert res.output == "NS=workspace"

    res = run_cmd(
        ["bash", TICKET_SH, "--resolve-ns-only", "get", "--id", "T000001"],
        cwd=repo_root,
        env={"TICKET_CTX": "gekko-hetzner-2-dev", "BRAND": "mentolder"},
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert res.output == "NS=workspace-dev"


def test_e3_migrate_tickets_dump_dry_run_nennt_den_ausschluss_von_provider_config(run_cmd, repo_root):
    res = run_cmd(["bash", MIGRATE, "dump", "--dry-run"], cwd=repo_root, timeout=300)
    assert res.returncode == 0, res.output
    assert "--exclude-table=tickets.provider_config" in res.output


def test_e3_freeze_ist_ohne_ausdrueckliche_bestaetigung_gesperrt_t002722(run_cmd, repo_root):
    res = run_cmd(["bash", MIGRATE, "freeze"], cwd=repo_root, timeout=300)
    assert res.returncode != 0, res.output
    assert "T002722" in res.output


def test_e3_freeze_dry_run_zeigt_das_sql_trotzdem_an(run_cmd, repo_root):
    res = run_cmd(["bash", MIGRATE, "freeze", "--dry-run"], cwd=repo_root, timeout=300)
    assert res.returncode == 0, res.output
    assert "REVOKE" in res.output
    assert "provider_config" in res.output


def test_e3_post_merge_yml_schreibt_nicht_mehr_in_die_ticket_datenbank(repo_root):
    wf = repo_root / ".github/workflows/post-merge.yml"
    assert wf.is_file()
    text = wf.read_text(encoding="utf-8")
    # Positive anchor first (T002356-M1): the workflow still renders its artifact.
    assert "render-artifact:" in text
    count = sum(1 for line in text.splitlines() if re.match(r"^[^#]*ticket\.sh update-status", line))
    assert count == 0


def test_e3_post_merge_yml_hat_keine_unaufloesbaren_needs_mehr(repo_root):
    text = (repo_root / ".github/workflows/post-merge.yml").read_text(encoding="utf-8")
    count = sum(1 for line in text.splitlines() if re.search(r"needs:.*mark-awaiting", line))
    assert count == 0


def test_e3_cutover_runbook_existiert_und_benennt_die_reihenfolge(repo_root):
    rb = repo_root / "docs/sdlc-stack/e3-cutover.md"
    assert rb.is_file()
    text = rb.read_text(encoding="utf-8")
    assert "Factory anhalten" in text
    assert "T002722" in text
