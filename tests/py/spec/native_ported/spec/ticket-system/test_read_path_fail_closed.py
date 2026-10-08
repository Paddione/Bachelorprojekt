"""Native migration of tests/spec/ticket-system/read-path-fail-closed.bats."""

import os

import pytest


# Ohne TICKET_TEST_DB_OK=1 erzwingt der T002224-Guard in _ticket-core.sh unter BATS einen
# nicht aufloesbaren Kontext, damit DB-Zugriffe scheitern. Ausserhalb von BATS fehlt dieser
# Guard, daher wird der Kontext hier explizit auf einen nicht aufloesbaren Namen gesetzt.
NO_CLUSTER_CTX = "pytest-no-cluster-t002224"


@pytest.fixture
def tk(repo_root, run_cmd):
    script = repo_root / "scripts" / "ticket.sh"

    def ticket(*args, **env):
        merged = {"TICKET_CTX": NO_CLUSTER_CTX, **env}
        return run_cmd(["bash", str(script), *args], env=merged)

    def skip_if_no_db():
        # Der Guard fragt die CLI selbst, nicht kubectl (gleiche Bedingung wie der getestete Code).
        probe = ticket("list", "--limit", "1").stdout
        if not probe.startswith("["):
            pytest.skip("ticket.sh erreicht keine DB — DB-gestuetzter Test uebersprungen (CI hat keine Ticket-DB)")

    return {"ticket": ticket, "skip_if_no_db": skip_if_no_db}


# ── Positiv-Anker (ohne DB gueltig) ─────────────────────────────────────────

def test_anker_ticket_sh_help_antwortet_mit_exit_0(tk):
    res = tk["ticket"]("help")
    assert res.returncode == 0
    assert res.output


def test_anker_ein_gueltiger_status_passiert_die_validierung(tk):
    out = tk["ticket"]("list", "--status", "done", "--limit", "1").output
    assert "ungueltiger Status" not in out
    assert "Unknown --status" not in out


def test_anker_eine_gueltige_komma_liste_passiert_die_validierung_t012972(tk):
    out = tk["ticket"]("list", "--status", "done,archived", "--limit", "1").output
    assert "ungueltiger Status" not in out
    assert "Unknown --status" not in out


def test_anker_leerzeichen_in_der_gueltigen_liste_passieren_die_validierung(tk):
    out = tk["ticket"]("list", "--status", "done, archived", "--limit", "1").output
    assert "ungueltiger Status" not in out
    assert "Unknown --status" not in out


# ── Zusicherungen: Filter-Validierung, ohne DB wirksam ──────────────────────

def test_list_status_mit_unbekanntem_wert_endet_mit_exit_2_bedienfehler(tk):
    assert tk["ticket"]("list", "--status", "bogusxyz").returncode == 2


def test_list_status_open_endet_mit_exit_2_open_ist_kein_definierter_status(tk):
    assert tk["ticket"]("list", "--status", "open").returncode == 2


def test_die_fehlermeldung_nennt_die_gueltigen_status(tk):
    out = tk["ticket"]("list", "--status", "bogusxyz").output
    assert "triage" in out
    assert "plan_staged" in out
    assert "archived" in out


def test_die_fehlermeldung_nennt_den_abgelehnten_wert(tk):
    assert "bogusxyz" in tk["ticket"]("list", "--status", "bogusxyz").output


def test_eine_liste_mit_einem_ungueltigen_glied_wird_ganz_abgelehnt(tk):
    res = tk["ticket"]("list", "--status", "done,bogusxyz")
    assert res.returncode == 2
    assert "bogusxyz" in res.output


def test_list_type_mit_unbekanntem_wert_endet_mit_exit_2(tk):
    assert tk["ticket"]("list", "--type", "bogusxyz").returncode == 2


def test_list_attention_mode_mit_unbekanntem_wert_endet_mit_exit_2(tk):
    assert tk["ticket"]("list", "--attention-mode", "bogusxyz").returncode == 2


def test_die_validierung_braucht_keine_datenbank(tk):
    # Mit unerreichbarer DB muss der Bedienfehler trotzdem als Exit 2 erkannt werden.
    res = tk["ticket"]("list", "--status", "bogusxyz", KUBECONFIG="/nonexistent-for-this-test")
    assert res.returncode == 2
    assert "bogusxyz" in res.output


# ── Zusicherung: get auf ein nicht existierendes Ticket (braucht DB) ────────

def test_get_id_auf_ein_nicht_existierendes_ticket_endet_nicht_mit_exit_0(tk):
    tk["skip_if_no_db"]()
    res = tk["ticket"]("get", "--id", "T999999")
    assert res.returncode != 0
    assert res.returncode != 2  # kein Bedienfehler — die Anfrage war wohlgeformt


def test_get_id_nennt_die_nicht_gefundene_id_in_der_meldung(tk):
    tk["skip_if_no_db"]()
    assert "T999999" in tk["ticket"]("get", "--id", "T999999").output


def test_get_id_auf_ein_existierendes_ticket_bleibt_exit_0_mit_json(tk):
    tk["skip_if_no_db"]()
    res = tk["ticket"]("get", "--id", "T014386")
    assert res.returncode == 0
    assert "T014386" in res.output
