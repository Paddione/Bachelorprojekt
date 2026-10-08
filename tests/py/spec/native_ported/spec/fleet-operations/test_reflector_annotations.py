"""Native migration of tests/spec/fleet-operations/reflector-annotations.bats."""
from pathlib import Path


def _count_exact_lines(path: Path, line_text: str) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.startswith(line_text))


def test_t002880_tls_sync_cronjob_ist_der_reale_sync_mechanismus_positiv_anker(repo_root):
    reflector = repo_root / "prod" / "reflector.yaml"
    assert reflector.is_file(), "MISSING: prod/reflector.yaml ohne CronJob"
    assert _count_exact_lines(reflector, "kind: CronJob") == 1
    assert "name: tls-sync" in reflector.read_text(encoding="utf-8")


def test_t002880_wildcard_certificate_manifeste_existieren_weiterhin_positiv_anker(repo_root):
    for f in ("prod/wildcard-certificate.yaml", "prod-fleet/staging/wildcard-certificate.yaml"):
        path = repo_root / f
        assert path.is_file(), f"MISSING: {f}"
        assert _count_exact_lines(path, "kind: Certificate") == 1, f


def test_t002880_keine_reflector_v1_emberstack_eu_annotationen_in_prod_prod_fleet_k3d(repo_root):
    needle = b"reflector.v1.emberstack.eu"
    found = []
    for base in ("prod", "prod-fleet", "k3d"):
        for path in sorted((repo_root / base).rglob("*")):
            if path.is_file() and needle in path.read_bytes():
                found.append(str(path))
    assert not found, "FOUND dead reflector annotations in:\n" + "\n".join(found)
