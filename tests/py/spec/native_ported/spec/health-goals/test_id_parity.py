"""Native migration of tests/spec/health-goals/id-parity.bats."""

import re

import pytest


def _documented_ids(goals_md):
    text = goals_md.read_text(encoding="utf-8")
    ids = set()
    for line in text.splitlines():
        m = re.match(r"^## (G-[A-Z0-9]+)", line)
        if m:
            ids.add(m.group(1))
        m = re.match(r"^\| \*\*(G-[A-Z0-9]+)\*\*", line)
        if m:
            ids.add(m.group(1))
    return ids


def _measured_ids(check_sh):
    text = check_sh.read_text(encoding="utf-8")
    return set(re.findall(r"\brow +(?:gate|target) +(G-[A-Z0-9]+)", text))


@pytest.fixture
def paths(repo_root):
    return repo_root / ".claude" / "lib" / "goals.md", repo_root / "scripts" / "health-goals-check.sh"


def test_id_extraktion_findet_die_bekannten_anker_in_beiden_quellen_positiv_anker(paths):
    goals_md, check_sh = paths
    doc = _documented_ids(goals_md)
    meas = _measured_ids(check_sh)
    assert len(doc) > 50
    assert len(meas) > 50
    assert "G-RH01" in doc
    assert "G-RH01" in meas
    for anchor in ("G-K8S01", "G-E2E01"):
        assert anchor in doc
        assert anchor in meas


def test_jede_in_goals_md_dokumentierte_ziel_id_wird_von_health_goals_check_sh_gemessen(paths):
    goals_md, check_sh = paths
    only_documented = sorted(_documented_ids(goals_md) - _measured_ids(check_sh))
    assert not only_documented, (
        "Dokumentiert, aber nie gemessen: " + ", ".join(only_documented)
    )


def test_jede_von_health_goals_check_sh_gemessene_ziel_id_ist_in_goals_md_dokumentiert(paths):
    goals_md, check_sh = paths
    only_measured = sorted(_measured_ids(check_sh) - _documented_ids(goals_md))
    assert not only_measured, (
        "Gemessen, aber nicht dokumentiert: " + ", ".join(only_measured)
    )


def test_goals_md_fuehrt_hoechstens_5_baseline_update_eintraege_kappungsregel(paths):
    goals_md, _ = paths
    count = sum(
        1 for line in goals_md.read_text(encoding="utf-8").splitlines()
        if line.startswith("**Baseline-Update")
    )
    assert count >= 1
    assert count <= 5


def test_die_ausgelagerte_chronik_existiert_und_ist_von_goals_md_aus_verlinkt(repo_root, paths):
    goals_md, _ = paths
    history = repo_root / "docs" / "health-goals-history.md"
    assert history.is_file()
    history_count = sum(
        1 for line in history.read_text(encoding="utf-8").splitlines()
        if line.startswith("**Baseline-Update")
    )
    assert history_count >= 5
    assert "health-goals-history.md" in goals_md.read_text(encoding="utf-8")


def test_kein_ziel_steht_gleichzeitig_als_h2_sektion_und_als_prio_c_tabellenzeile(paths):
    goals_md, _ = paths
    text = goals_md.read_text(encoding="utf-8")
    h2 = set(re.findall(r"^## (G-[A-Z0-9]+)", text, re.M))
    prio_c = set(re.findall(r"^\| \*\*(G-[A-Z0-9]+)\*\*", text, re.M))
    assert len(h2) >= 5
    assert len(prio_c) >= 20
    dup = sorted(h2 & prio_c)
    assert not dup, "Doppelt geführt (H2-Sektion UND Prio-C-Zeile): " + ", ".join(dup)
