"""Fix #6941: opencode Deployment braucht ein beschreibbares HOME (non-root UID 65534).

Symptom (Fakt): Pod CrashLoopBackOff, Log:
  PlatformError: PermissionDenied: FileSystem.makeDirectory (/root/.local/share/opencode/log)
  [cause]: Error: EACCES: permission denied, mkdir '/root/.local/share/opencode/log'

Ursache (log-belegt): Pod laeuft als runAsUser 65534, aber ohne HOME-Env loest
der Server sein Datenverzeichnis gegen /root auf -> EACCES.

Vertrag dieses Tests: Container setzt HOME auf einen Nicht-Root-Pfad, der
durch einen VolumeMount abgedeckt ist (oder /tmp), und bleibt non-root.
RED solange kein HOME-Env im Manifest steht.
"""

from pathlib import Path

import pytest
import yaml


def _opencode_deployment(repo_root: Path) -> dict:
    comp = repo_root / "dev-local" / "components" / "opencode" / "opencode.yaml"
    assert comp.is_file(), "dev-local/components/opencode/opencode.yaml missing"
    docs = [d for d in yaml.safe_load_all(comp.read_text()) if d]
    deps = [
        d
        for d in docs
        if d.get("kind") == "Deployment" and d.get("metadata", {}).get("name") == "opencode"
    ]
    assert len(deps) == 1, "Deployment/opencode not found exactly once"
    return deps[0]


def test_home_env_set_and_not_root(repo_root: Path):
    dep = _opencode_deployment(repo_root)
    containers = [c for c in dep["spec"]["template"]["spec"]["containers"]
                  if c.get("name") == "opencode"]
    assert len(containers) == 1
    env = {e["name"]: e.get("value", "") for e in containers[0].get("env", [])}
    assert "HOME" in env, "container env HOME missing (EACCES /root, siehe #6941)"
    assert env["HOME"] not in ("", "/root", "/"), f"HOME not writable: {env['HOME']!r}"


def test_home_covered_by_mount(repo_root: Path):
    dep = _opencode_deployment(repo_root)
    container = dep["spec"]["template"]["spec"]["containers"][0]
    env = {e["name"]: e.get("value", "") for e in container.get("env", [])}
    home = env.get("HOME", "")
    assert home not in ("", "/root", "/")
    mounts = [m["mountPath"] for m in container.get("volumeMounts", [])]
    assert any(home == m or home.startswith(m.rstrip("/") + "/") for m in mounts), (
        f"HOME {home!r} not covered by any volumeMount {mounts}"
    )


def test_stays_non_root(repo_root: Path):
    dep = _opencode_deployment(repo_root)
    pod_sc = dep["spec"]["template"]["spec"].get("securityContext", {})
    assert pod_sc.get("runAsNonRoot") is True, "pod must stay runAsNonRoot"
    assert pod_sc.get("runAsUser", 0) != 0, "pod must not run as root"
    container = dep["spec"]["template"]["spec"]["containers"][0]
    csc = container.get("securityContext", {})
    assert csc.get("runAsNonRoot", True) is not False, "container must stay runAsNonRoot"
    assert csc.get("runAsUser", 65534) != 0, "container must not run as root"
