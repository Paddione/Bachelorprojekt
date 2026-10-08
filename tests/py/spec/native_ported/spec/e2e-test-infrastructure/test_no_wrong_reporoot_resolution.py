"""Native migration of tests/spec/e2e-test-infrastructure/no-wrong-reporoot-resolution.bats."""

import pytest

PATTERN = "path.resolve(__dirname, '../../../../')"


@pytest.fixture
def specs_dir(repo_root):
    return repo_root / "tests" / "e2e" / "specs"


def test_e2e_infra_keine_spec_loest_den_repo_root_neben_dem_repository_auf(specs_dir):
    specs = sorted(p for p in specs_dir.glob("*.spec.ts") if p.is_file())
    # Positiv-Anker 1: der Spec-Bestand existiert.
    assert len(specs) > 0

    # Positiv-Anker 2: der Detektor erkennt das Muster nachweislich.
    synthetic = "const repoRoot = path.resolve(__dirname, '../../../../');\n"
    assert sum(1 for l in synthetic.splitlines() if PATTERN in l) == 1

    hits = []
    for spec in specs:
        for n, line in enumerate(spec.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if PATTERN in line:
                hits.append(f"{spec}:{n}:{line}")
    assert not hits, "Falsche Repo-Root-Aufloesung gefunden (zeigt eine Ebene ueber das Repo):\n" + "\n".join(hits)
