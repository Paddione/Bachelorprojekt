"""Native migration of tests/spec/sessions-server/domain-config.bats."""

import re
from pathlib import Path


def test_positiv_anker_sessions_domain_ist_in_configmap_domains_yaml_zentral_definiert(repo_root):
    configmap = (repo_root / "k3d" / "configmap-domains.yaml").read_text(encoding="utf-8")
    assert re.search(r'^[ \t]+SESSIONS_DOMAIN:[ \t]+"', configmap, re.MULTILINE)
    values = re.findall(r'^[ \t]*SESSIONS_DOMAIN:[ \t]*"([^"]*)"', configmap, re.MULTILINE)
    assert "".join(values) != ""
    # Das nginx-Manifest referenziert den Platzhalter, nicht einen Literalwert.
    assert "${SESSIONS_DOMAIN}" in (repo_root / "k3d" / "sessions-server.yaml").read_text(encoding="utf-8")


def test_negativ_guard_k3d_basis_manifeste_haerten_keine_neuen_session_domain_literale_ein(repo_root):
    # Positiv-Anker: der bekannte Legacy-Fallback existiert im Hub-Script.
    hub_text = (repo_root / "scripts" / "session-hub.sh").read_text(encoding="utf-8")
    assert "sessions.mentolder.de" in hub_text

    # Kommentarzeilen sind exempt; gezaehlt wird nur konfigurativer Inhalt.
    offenders = []
    for path in sorted((repo_root / "k3d").rglob("*.yaml")):
        for lineno, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if "sessions.mentolder.de" not in line:
                continue
            if "configmap-domains.yaml" in str(path):
                continue
            if line.lstrip().startswith("#"):
                continue
            offenders.append(f"{path}:{lineno}:{line}")
    assert not offenders, "Hartcodierte Session-Domain ausserhalb der zentralen ConfigMap:\n" + "\n".join(offenders)
