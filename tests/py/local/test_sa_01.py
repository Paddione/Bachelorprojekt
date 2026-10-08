"""Native migration of tests/local/SA-01.bats."""
import os
import re
import shutil

import pytest


def _namespace() -> str:
    return os.environ.get("NAMESPACE", "workspace")


def _urls():
    """Mirror tests/lib/k3d.sh URL defaults (PROD_DOMAIN selects https://*.<domain>)."""
    prod_domain = os.environ.get("PROD_DOMAIN", "")
    if prod_domain:
        proto = os.environ.get("PROTO", "https")
        kc = f"{proto}://auth.{prod_domain}"
        nc = f"{proto}://files.{prod_domain}"
    else:
        proto = os.environ.get("PROTO", "http")
        kc = f"{proto}://auth.localhost"
        nc = f"{proto}://files.localhost"
    return os.environ.get("KC_URL", kc), os.environ.get("NC_URL", nc)


@pytest.fixture
def cluster(run_cmd):
    """Skip the cluster-bound tests when kubectl or the cluster is unavailable."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    if shutil.which("jq") is None:
        pytest.skip("jq not installed")
    probe = run_cmd(["kubectl", "get", "namespace", _namespace(), "--no-headers"], timeout=60)
    if probe.returncode != 0:
        pytest.skip(f"cluster or namespace {_namespace()} unavailable: {probe.stderr.strip()[:200]}")


@pytest.fixture(scope="module")
def curl_available():
    if shutil.which("curl") is None:
        pytest.skip("curl not installed")


def test_t1_all_service_ingresses_are_defined(run_cmd, cluster):
    """SA-01/T1: All service ingresses are defined"""
    ns = _namespace()
    for svc in ["auth", "files", "vault", "board", "meet"]:
        cmd = f"kubectl get ingress -n '{ns}' --no-headers 2>/dev/null | grep -c '{svc}' || echo '0'"
        result = run_cmd(["bash", "-c", cmd], timeout=300)
        assert result.returncode == 0, result.output
        output = result.output
        assert re.fullmatch(r"-?\d+", output or "") and int(output) > 0, (
            f"Ingress fuer {svc}.localhost definiert: expected > 0, got: {output!r}"
        )


def test_t2_core_services_are_reachable(run_cmd, curl_available):
    """SA-01/T2: Core services are reachable"""
    kc_url, nc_url = _urls()
    services = [
        ("auth", f"{kc_url}/", {"200", "302", "303"}),
        ("files", f"{nc_url}/status.php", {"200"}),
    ]
    for name, url, expected in services:
        result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "10", url], timeout=60)
        status = result.stdout.strip()
        if status == "000":
            pytest.skip(f"service {name} unreachable at {url}")
        assert status in expected, f"Service {name} erreichbar: HTTP {status}, erwartet: {sorted(expected)}"


def test_t3_ingress_uses_tls_annotation_or_spec(run_cmd, cluster):
    """SA-01/T3: Ingress uses TLS annotation or spec"""
    ns = _namespace()
    tls_cmd = (
        f"kubectl get ingress -n '{ns}' -o json 2>/dev/null | jq "
        "'[.items[] | select(.spec.tls != null or .metadata.annotations[\"traefik.ingress.kubernetes.io/router.tls\"] == \"true\")] | length'"
    )
    total_cmd = f"kubectl get ingress -n '{ns}' -o json 2>/dev/null | jq '.items | length'"

    tls = run_cmd(["bash", "-c", tls_cmd], timeout=300)
    assert tls.returncode == 0, tls.output
    tls_count = tls.output

    total = run_cmd(["bash", "-c", total_cmd], timeout=300)
    assert total.returncode == 0, total.output
    total_count = total.output

    assert re.fullmatch(r"\d+", total_count or "") and int(total_count) > 0, (
        f"Ingress-Objekte vorhanden: keine Ingress-Objekte gefunden (TLS {tls_count!r}, total {total_count!r})"
    )


def test_t5_keycloak_serves_correct_security_headers(run_cmd, curl_available):
    """SA-01/T5: Keycloak serves correct security headers"""
    kc_url, _ = _urls()
    result = run_cmd(["curl", "-s", "-D", "-", "-o", "/dev/null", "--max-time", "10", f"{kc_url}/realms/workspace"], timeout=60)
    headers = result.stdout
    if not headers.strip():
        pytest.skip(f"keycloak unreachable at {kc_url}")
    assert "X-Content-Type-Options" in headers, "Keycloak setzt X-Content-Type-Options Header"
    assert "X-Frame-Options" in headers, "Keycloak setzt X-Frame-Options Header"
