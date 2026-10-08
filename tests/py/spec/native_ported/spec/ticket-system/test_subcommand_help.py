"""Native migration of tests/spec/ticket-system/subcommand-help.bats."""

import pytest


@pytest.fixture
def sh(repo_root, run_cmd):
    script = repo_root / "scripts" / "ticket.sh"
    return lambda *args: run_cmd(["bash", str(script), *args])


def test_t002843_positiv_anker_der_aufruf_ohne_argumente_listet_die_kommandos(sh):
    # Anker fuer die "darf nicht"-Zusicherungen weiter unten.
    res = sh()
    assert res.returncode != 0
    assert "create" in res.output
    assert "stage-plan" in res.output


def test_t002843_ticket_sh_help_zeigt_die_kommandoliste_statt_unknown_command(sh):
    res = sh("help")
    assert res.returncode == 0, res.output
    assert "Unknown command" not in res.output
    assert "create" in res.output
    assert "stage-plan" in res.output


def test_t002843_ticket_sh_help_zeigt_die_kommandoliste_statt_unknown_command_long_flag(sh):
    res = sh("--help")
    assert res.returncode == 0, res.output
    assert "Unknown command" not in res.output
    assert "create" in res.output


def test_t002843_create_help_nennt_die_optionen_inkl_der_pflichtfelder(sh):
    res = sh("create", "--help")
    assert res.returncode == 0, res.output
    assert "Unknown create option" not in res.output
    # Pflichtfelder laut scripts/vda/ticket/create.sh
    assert "--type" in res.output
    assert "--title" in res.output
    assert "--description" in res.output


def test_t002843_h_wirkt_wie_help_update_status_subkommando_in_ticket_sh(sh):
    res = sh("update-status", "-h")
    assert res.returncode == 0, res.output
    assert "Unknown update-status option" not in res.output
    assert "--id" in res.output
    assert "--status" in res.output


def test_t002843_dasselbe_fuer_subkommandos_aus_scripts_lib_add_pr_link(sh):
    res = sh("add-pr-link", "--help")
    assert res.returncode == 0, res.output
    assert "Unknown add-pr-link option" not in res.output
    assert "--id" in res.output
    assert "--pr" in res.output


def test_t002843_ein_wirklich_unbekanntes_argument_bleibt_ein_fehler(sh):
    # Gegenprobe: der --help-Vorabgriff darf die Options-Schleife nicht entschaerfen.
    res = sh("update-status", "--voellig-unbekannt")
    assert res.returncode != 0
    assert "Unknown update-status option" in res.output


def test_t013328_stage_plan_hilfe_nennt_no_hold_und_die_hold_pflicht(sh):
    res = sh("help", "stage-plan")
    assert res.returncode == 0, res.output
    assert "--no-hold" in res.output
    assert "(--hold|--no-hold)" in res.output
