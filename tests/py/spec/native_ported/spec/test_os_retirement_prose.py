"""Native migration of tests/spec/os-retirement-prose.bats."""

import re


def test_t900724_keine_datei_der_liste_enthaelt_noch_einen_verweis(repo_root):
    list_file = repo_root / "tests" / "fixtures" / "os-retirement" / "prose.txt"
    assert list_file.exists() and list_file.stat().st_size > 0, f"{list_file} ist leer oder fehlt"

    offenders = []
    for rel in list_file.read_text(encoding="utf-8").splitlines():
        if not rel or not (repo_root / rel).exists():
            continue
        text = (repo_root / rel).read_text(encoding="utf-8", errors="replace")
        if re.search("openspec", text, re.IGNORECASE):
            offenders.append(rel)
    assert not offenders, "\n".join(offenders[:40])
