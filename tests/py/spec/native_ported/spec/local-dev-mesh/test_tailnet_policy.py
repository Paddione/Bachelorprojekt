"""Native migration of tests/spec/local-dev-mesh/tailnet-policy.bats."""

import re
import shutil

import pytest

FACTS_PY = r'''
import json, re, sys, yaml
inv = yaml.safe_load(open(sys.argv[2])) or {}
gpu_ports = [str(p.get("port")) for p in ((inv.get("gpu_endpoint") or {}).get("ports") or [])]
raw = open(sys.argv[1]).read()
lines = [l for l in raw.splitlines() if not l.lstrip().startswith("//")]
policy = json.loads(re.sub(r",(\s*[}\]])", r"\1", "\n".join(lines)))
acls = policy.get("acls") or []
grants = policy.get("grants") or []
bad = sum(1 for a in acls for d in a.get("dst", [])
          if d.startswith("tag:devclient") or d.startswith("*"))
ports = set()
for a in acls:
    if "tag:devclient" in a.get("src", []):
        for d in a.get("dst", []):
            if d.startswith("tag:devmesh:"):
                ports.update(d.split(":", 2)[2].split(","))
mesh = any("tag:devmesh" in a.get("src", []) and "tag:devmesh:*" in a.get("dst", [])
           for a in acls)
exc_rules = [a for a in acls if "tag:devmesh" in a.get("src", [])
             and any(not d.startswith("tag:devmesh") for d in a.get("dst", []))]
exc_dst = [d for a in exc_rules for d in a.get("dst", []) if not d.startswith("tag:devmesh")]
alias = int("gpu-host" in (policy.get("hosts") or {}))
print(f"acls={len(acls)} grants={len(grants)} bad={bad} ports={','.join(sorted(ports))} mesh={int(mesh)}"
      f" exc={len(exc_rules)} excdst={','.join(exc_dst) or '-'} gpuports={','.join(gpu_ports) or '-'} alias={alias}")
'''


@pytest.fixture
def pol(repo_root, run_cmd):
    if shutil.which("python3") is None:
        pytest.skip("python3 not installed")
    if run_cmd(["python3", "-c", "import yaml"]).returncode != 0:
        pytest.skip("PyYAML not installed")
    policy = repo_root / "devmesh" / "tailnet-policy.hujson"
    inventory = repo_root / "devmesh" / "inventory.yaml"

    def facts():
        return run_cmd(["python3", "-c", FACTS_PY, str(policy), str(inventory)])

    return {"policy": policy, "facts": facts, "repo": repo_root}


def test_t900116_policy_gibt_tag_devclient_zugang_zu_tag_devmesh_auf_22_443_und_6443(pol):
    assert pol["policy"].is_file(), f"MISSING: {pol['policy']}"
    res = pol["facts"]()
    assert res.returncode == 0, f"Policy nicht parsebar: {res.output}"
    ports = re.search(r".* ports=([^ ]*).*", res.output).group(1)
    for p in ("22", "443", "6443"):
        assert f",{p}," in f",{ports},", f"Port {p} fehlt fuer tag:devclient -> tag:devmesh: {res.output}"
    assert "mesh=1" in res.output, f"keine Regel tag:devmesh -> tag:devmesh:*: {res.output}"


def test_t900116_gpu_endpunkt_ist_die_einzige_ausnahme_von_tag_devmesh_in_einen_client(pol):
    res = pol["facts"]()
    assert res.returncode == 0, f"Policy oder Inventar nicht parsebar: {res.output}"
    # Positiv-Anker: Inventar nennt mindestens einen GPU-Port, Policy definiert den Alias gpu-host.
    assert re.search(r"gpuports=[0-9]+(,[0-9]+)*", res.output), f"gpu_endpoint.ports fehlt im Inventar: {res.output}"
    assert "alias=1" in res.output, f"hosts.gpu-host fehlt in der Policy: {res.output}"
    gpuports = re.search(r"gpuports=([0-9,]+)", res.output).group(1)
    expected = "gpu-host:" + gpuports.replace(",", ",gpu-host:")
    # Genau eine Regel, ein Ziel je Inventar-Port, in Inventar-Reihenfolge.
    assert "exc=1 " in res.output, f"erwartet genau eine Ausnahme-Regel: {res.output}"
    assert f"excdst={expected} " in res.output, (
        f"Ausnahme-Ziele stimmen nicht mit gpu_endpoint.ports ueberein: {res.output} (erwartet excdst={expected})"
    )


def test_t900116_policy_enthaelt_keine_regel_mit_ziel_tag_devclient(pol):
    res = pol["facts"]()
    assert res.returncode == 0, f"Policy nicht parsebar: {res.output}"
    # Positiv-Anker: es gibt Regeln, und die gueltige Client-Regel existiert.
    assert re.search(r"acls=[1-9]", res.output), f"keine acls: {res.output}"
    assert re.search(r"ports=[0-9]", res.output), f"keine Client-Regel: {res.output}"
    # Negativ-Aussage: kein Ziel tag:devclient, kein Wildcard-Ziel, keine grants am Guard vorbei.
    assert "bad=0" in res.output, f"Regel mit Ziel tag:devclient oder *: {res.output}"
    assert "grants=0" in res.output, f"grants umgehen den Guard: {res.output}"


def test_t900116_kein_tailscale_auth_key_in_versionierten_dateien(pol, run_cmd):
    prefix = "tskey"
    pattern = prefix + r"-(auth|api|client|scim|webhook)-[A-Za-z0-9]{6,}-[A-Za-z0-9]{16,}"
    # Positiv-Anker: das Muster erkennt einen zur Laufzeit gebauten synthetischen Key.
    fake = prefix + "-auth-kAbCdE1CNTRL-" + "x" * 24
    assert re.search(pattern, fake), "Muster erkennt synthetischen Key nicht"
    res = run_cmd(["git", "grep", "-lE", pattern, "--", ".", ":!environments/.secrets/"], cwd=pol["repo"])
    assert res.stdout.strip() == "", f"Auth-Key-Muster gefunden in: {res.stdout}"
