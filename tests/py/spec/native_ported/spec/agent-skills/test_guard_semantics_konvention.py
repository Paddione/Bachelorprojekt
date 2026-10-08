"""Native migration of tests/spec/agent-skills/guard-semantics-konvention.bats."""

import pytest

CONVENTION_TERMS = ["Dokumentposition", "Options-Parsing", "Konfiguration statt Laufzeit", "Prozesslisten-Format"]


@pytest.fixture
def convention_docs(repo_root):
    return [repo_root / "CLAUDE.md", repo_root / "tests" / "CLAUDE.md"]


def _convention_docs_contain(docs, term):
    for doc in docs:
        if not doc.is_file():
            continue
        if term in doc.read_text(encoding="utf-8"):
            return True
    return False


def test_t003796_grep_qf_flag_endet_mit_exit_2_mit_e_mit_0_positiv_anker(run_cmd):
    # Negativfall (T003108): '--draft' wird als Option geparst -> Exit 2
    r = run_cmd("printf '%s\\n' 'text mit --draft drin' | grep -qF '--draft'", shell=True)
    assert r.returncode == 2

    # Positiv-Anker (T002356-M1): mit -e wird dasselbe Muster gefunden.
    r = run_cmd("printf '%s\\n' 'text mit --draft drin' | grep -qF -e '--draft'", shell=True)
    assert r.returncode == 0


def test_t003796_bereichsbeschraenkte_suche_findet_die_gemeinte_regel_head_1_die_falsche_zeile(
    run_cmd, tmp_path
):
    fixture = tmp_path / "positions-guard-fixture.md"
    fixture.write_text(
        "## 3.\n"
        "hier steht dedup nur als Zufallstreffer\n"
        "## 4.\n"
        "hier steht die dedup-Regel die gemeint ist\n",
        encoding="utf-8",
    )

    # Die gemeinte Stelle (bereichsbeschraenkt ab '## 4.')
    r = run_cmd(["bash", "-c", "awk '/^## 4\\./{seen=1} seen && /dedup/{print NR; exit}' '" + str(fixture) + "'"])
    assert r.returncode == 0
    assert r.output == "4"

    # Die dokumentweite head -1-Suche liefert die falsche Zeilennummer (2).
    r = run_cmd(["bash", "-c", "grep -n 'dedup' '" + str(fixture) + "' | head -1"])
    assert r.returncode == 0
    assert r.output.split(":", 1)[0] == "2"
    assert r.output.split(":", 1)[0] != "4"


def test_t003796_die_konventionsdoku_nennt_alle_vier_spielarten_drift_schutz(convention_docs):
    present = sum(1 for doc in convention_docs if doc.is_file())
    print(f"Anker: vorhandene Konventionsdokumente={present} von {len(convention_docs)}")
    assert present > 0

    for term in CONVENTION_TERMS:
        assert _convention_docs_contain(convention_docs, term), (
            f"Keines der Konventionsdokumente nennt die Spielart '{term}' (T002716-Erweiterung fehlt)\n"
            f"Gesucht in: {' '.join(str(d) for d in convention_docs)}"
        )
