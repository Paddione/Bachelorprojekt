"""Native migration of tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats."""

def test_t900246_positiv_anker_get_timeline_funktioniert_weiterhin_lehnt_brand_aber_als_unbekannte_option_ab(repo_root, run_cmd):
    script = repo_root / "scripts" / "ticket.sh"
    # Positiv-Anker zuerst: ohne --brand funktioniert der Aufruf weiterhin (Offline-Pfad).
    res = run_cmd(["bash", str(script), "get-timeline", "--id", "T900239"],
                  env={"TICKET_OFFLINE": "1"})
    assert res.returncode == 9, res.output
    assert "OFFLINE: refused read get-timeline" in res.output

    # Negativ-Aussage: --brand wird nicht mehr akzeptiert.
    res = run_cmd(["bash", str(script), "get-timeline", "--id", "T900239", "--brand", "korczewski"],
                  env={"TICKET_OFFLINE": "1"})
    assert res.returncode == 2, res.output
    assert "Unknown get-timeline option: --brand" in res.output


def test_t900246_positiv_anker_get_timeline_help_dokumentiert_id_aber_nicht_mehr_brand(repo_root, run_cmd):
    res = run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "get-timeline", "--help"])
    assert res.returncode == 0, res.output
    assert "--id <external_id>" in res.output
    brand_mentions = sum(1 for line in res.output.splitlines() if "--brand" in line)
    assert brand_mentions == 0
