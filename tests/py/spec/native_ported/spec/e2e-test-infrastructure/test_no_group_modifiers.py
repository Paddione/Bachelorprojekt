"""Native migration of tests/spec/e2e-test-infrastructure/no-group-modifiers.bats."""

import re

import pytest

GROUP_MODIFIER = re.compile(r"^  test\.(skip|fixme)\(true")


@pytest.fixture
def specs_dir(repo_root):
    return repo_root / "tests" / "e2e" / "specs"


def test_e2e_infra_keine_spec_traegt_einen_gruppen_modifier_im_describe_body(specs_dir):
    specs = sorted(p for p in specs_dir.glob("*.spec.ts") if p.is_file())
    # Positiv-Anker 1: der Spec-Bestand existiert.
    assert len(specs) > 0

    # Positiv-Anker 2: der Detektor erkennt das Muster nachweislich.
    synthetic = "  test.skip(true, 'x'\n"
    assert sum(1 for l in synthetic.splitlines() if GROUP_MODIFIER.search(l)) == 1

    # Die eigentliche Zusicherung: kein Bestandstreffer.
    hits = []
    for spec in specs:
        for n, line in enumerate(spec.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if GROUP_MODIFIER.search(line):
                hits.append(f"{spec}:{n}:{line}")
    assert not hits, "Gruppen-Modifier im describe-Body gefunden (schaltet die ganze Datei still):\n" + "\n".join(hits)
