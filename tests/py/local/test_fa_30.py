"""Native migration of tests/local/FA-30.bats."""

import base64
import json
import shutil
import subprocess

import pytest


@pytest.fixture(scope="module")
def cluster(repo_root):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    probe = subprocess.run(
        ["kubectl", "get", "--raw=/readyz", "--request-timeout=10s"],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if probe.returncode != 0:
        pytest.skip("no reachable Kubernetes cluster")
    return True


@pytest.fixture(scope="module")
def embed_response(cluster, repo_root):
    """Run the /embed call once; FA-30.2 asserts on it and FA-30.3 reuses its PDF."""
    fixtures = repo_root / "components/website/test/fixtures/einvoice"
    pdf_b64 = base64.b64encode((fixtures / "sample.pdf").read_bytes()).decode()
    xml_b64 = base64.b64encode(
        (fixtures / "regelbesteuerung-19.cii.xml").read_bytes()
    ).decode()
    payload = json.dumps({"pdf": pdf_b64, "xml": xml_b64})
    completed = subprocess.run(
        [
            "kubectl", "-n", "workspace", "run", "curl-embed",
            "--image=curlimages/curl", "--rm", "-i", "--restart=Never", "--quiet",
            "--", "-s", "-X", "POST", "http://einvoice-sidecar/embed",
            "-H", "Content-Type: application/json", "-d", payload,
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return completed.stdout


def test_fa_30_1_einvoice_sidecar_service_is_reachable(cluster, run_cmd):
    """FA-30.1: einvoice-sidecar Service is reachable"""
    result = run_cmd(
        ["kubectl", "-n", "workspace", "get", "svc", "einvoice-sidecar",
         "-o", "jsonpath={.spec.clusterIP}"],
        timeout=300,
    )
    assert result.returncode == 0
    assert result.output, "clusterIP output is empty"


def test_fa_30_2_embed_returns_pdf_a3_with_factur_x_attachment(embed_response, tmp_path):
    """FA-30.2: /embed returns PDF/A-3 with factur-x attachment"""
    data = json.loads(embed_response)["pdf"]
    pdf = base64.b64decode(data)
    (tmp_path / "out.pdf").write_bytes(pdf)
    assert pdf[:4] == b"%PDF"
    matches = sum(1 for line in pdf.split(b"\n") if b"factur-x.xml" in line)
    assert matches >= 1


def test_fa_30_3_validate_returns_ok_true_for_golden_output(embed_response):
    """FA-30.3: /validate returns ok=true for golden output"""
    pdf_b64 = json.loads(embed_response)["pdf"]
    payload = json.dumps({"pdf": pdf_b64})
    completed = subprocess.run(
        [
            "kubectl", "-n", "workspace", "run", "curl-validate",
            "--image=curlimages/curl", "--rm", "-i", "--restart=Never", "--quiet",
            "--", "-s", "-X", "POST", "http://einvoice-sidecar/validate",
            "-H", "Content-Type: application/json", "-d", payload,
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert str(json.loads(completed.stdout).get("ok")).lower() == "true"
