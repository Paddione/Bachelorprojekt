"""Native migration of tests/spec/fleet-operations/ghcr-pull-secret.bats."""
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def refl(repo_root: Path) -> Path:
    return repo_root / "prod" / "reflector.yaml"


def _awk_blocks(lines, start_marker, end_line):
    """Lines of awk '/start/,/end/' (end checked on the start line too)."""
    out, in_range = [], False
    for line in lines:
        if not in_range and start_marker in line:
            in_range = True
        if in_range:
            out.append(line)
            if line == end_line:
                in_range = False
    return out


def test_t900036_der_sync_cronjob_verteilt_ghcr_pull_secret_in_die_ziel_namespaces(refl):
    assert refl.is_file()
    text = refl.read_text(encoding="utf-8")

    # Positiv-Anker: der CronJob existiert und syncet weiterhin das TLS-Secret.
    assert "name: tls-sync" in text

    # Der Guard: das Pull-Secret wird mitverteilt ...
    assert "ghcr-pull-secret" in text, "prod/reflector.yaml syncet ghcr-pull-secret nicht"

    # ... und zwar in genau die beiden Namespaces, in denen es gefehlt hat.
    assert "workspace-office" in text
    assert "WEBSITE_NAMESPACE" in text


def test_t900036_der_sync_kopiert_dockerconfigjson_nicht_nur_tls_felder(refl):
    assert refl.is_file()
    text = refl.read_text(encoding="utf-8")
    count = sum(1 for l in text.splitlines() if "dockerconfigjson" in l)
    assert count >= 2, "kein dockerconfigjson-Pfad im Sync — Pull-Secret kaeme leer an"


def test_t900036_der_sync_rendert_fuer_beide_brands_und_fuer_staging_auf(repo_root, run_cmd):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst not installed")

    for overlay in ("mentolder", "korczewski", "staging"):
        script = (
            f"source scripts/env-resolve.sh {overlay} >/dev/null 2>&1 || exit 3; "
            f"kubectl kustomize prod-fleet/{overlay} --load-restrictor=LoadRestrictionsNone "
            f"2>/dev/null | envsubst"
        )
        res = run_cmd(["bash", "-c", script], cwd=repo_root, timeout=300)
        if res.returncode == 3:
            pytest.skip(f"env-resolve unavailable for {overlay}")
        if res.returncode != 0:
            pytest.skip(f"kustomize build failed for {overlay}")
        rendered = res.stdout

        # Der Render enthaelt 'ghcr-pull-secret' auch in anderen Workloads, deshalb
        # wird die Suche auf den tls-sync-CronJob-Block (awk-Range bis '---') eingegrenzt.
        block = "\n".join(_awk_blocks(rendered.splitlines(), "name: tls-sync", "---"))

        # Positiv-Anker: der CronJob-Block ist enthalten und traegt die Sync-Schleife.
        assert block, f"{overlay}: tls-sync nicht im Render"
        assert "sync_secret" in block, f"{overlay}: tls-sync-Block ohne sync_secret"

        # Der Guard: das Pull-Secret wird innerhalb dieses Blocks verteilt ...
        assert "ghcr-pull-secret" in block, f"{overlay}: tls-sync verteilt ghcr-pull-secret nicht"

        # ... und die Namespace-Platzhalter sind aufgeloest.
        assert "${" not in block, f"{overlay}: unsubstituierte Platzhalter im tls-sync-Block"
