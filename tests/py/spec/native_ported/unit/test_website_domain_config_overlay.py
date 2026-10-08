"""Native migration of tests/unit/website-domain-config-overlay.bats."""

# Regression: die website-Namespace muss die domain-config ConfigMap deklarativ
# im Overlay tragen — sonst bricht ein frischer `task website:deploy ENV=<brand>`
# mit CreateContainerConfigError, weil k3d/website.yaml MEDIAVIEWER_HOST per
# required configMapKeyRef aus `domain-config` bezieht, die in der website-ns
# (ohne dieses Overlay) gar nicht existiert. So live-gefixt bei PR #1735.
#
# Komplementär zu tests/unit/mediaviewer-host-durability.bats:
#   - mediaviewer-host-durability.bats schützt den WORKSPACE-ns-Pfad
#     (prod/configmap-domains.yaml + dessen envsubst).
#   - DIESER Guard schützt den WEBSITE-ns-Pfad (geteilte Overlay-ConfigMap).
# Keine Überschneidung. Rein offline (grep), keine Cluster-Calls.

import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    return {
        "website": repo_root / "k3d" / "website.yaml",
        "shared_cm": repo_root / "prod-fleet" / "website-common" / "domain-config.yaml",
        "prod_domains": repo_root / "prod" / "configmap-domains.yaml",
        "kust_mentolder": repo_root / "prod-fleet" / "website-mentolder" / "kustomization.yaml",
        "kust_korczewski": repo_root / "prod-fleet" / "website-korczewski" / "kustomization.yaml",
    }


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def _has_line(text: str, pattern: str) -> bool:
    """grep -q semantics: any line matches the ERE-style pattern."""
    return any(re.search(pattern, line) for line in text.splitlines())


def _domain_config_keys(website_text: str) -> list[str]:
    """Port of the awk program: keys pulled from configMapKeyRef blocks naming domain-config."""
    keys: list[str] = []
    in_ref = False
    name = ""
    for line in website_text.splitlines():
        if "configMapKeyRef:" in line:
            in_ref = True
            name = ""
            continue
        if in_ref and re.search(r"name:[ \t]*domain-config", line):
            name = "domain-config"
            continue
        if in_ref and "key:" in line:
            if name == "domain-config":
                key = re.sub(r"^[ \t]*key:[ \t]*", "", line)
                key = re.sub(r"[ \t]*$", "", key)
                keys.append(key)
            in_ref = False
            name = ""
            continue
        if in_ref and "name:" in line:
            name = ""
    return keys


def test_shared_website_domain_config_configmap_file_exists(paths):
    assert paths["shared_cm"].is_file()


def test_shared_domain_config_is_named_domain_config_matches_configmapkeyref_name(paths):
    assert _has_line(_text(paths["shared_cm"]), r"^\s*name:\s*domain-config\s*$")


def test_shared_domain_config_carries_no_metadata_namespace_overlay_re_namespaces_it(paths):
    # Ein hartes namespace: hier würde das brand-korrekte Re-Namespacing brechen.
    assert not _has_line(_text(paths["shared_cm"]), r"^\s*namespace:")


def test_parity_every_domain_config_configmapkeyref_key_in_website_yaml_is_in_the_shared_configmap(paths):
    keys = _domain_config_keys(_text(paths["website"]))
    assert keys, "mindestens MEDIAVIEWER_HOST muss gefunden werden"
    shared = _text(paths["shared_cm"])
    for key in keys:
        if not key:
            continue
        assert _has_line(shared, r"^\s+" + re.escape(key) + ":"), f"FEHLT in shared domain-config: {key}"


def test_presence_mentolder_overlay_references_the_shared_domain_config(paths):
    assert "../website-common/domain-config.yaml" in _text(paths["kust_mentolder"])


def test_presence_korczewski_overlay_references_the_shared_domain_config(paths):
    assert "../website-common/domain-config.yaml" in _text(paths["kust_korczewski"])


def _normalized_lines(text: str, pattern: str) -> str:
    """grep -E pattern | tr -s ' ' | strip, joined by newlines."""
    out = []
    for line in text.splitlines():
        if re.search(pattern, line):
            squeezed = re.sub(r" +", " ", line)
            out.append(squeezed.strip(" \t"))
    return "\n".join(out)


def test_drift_shared_mediaviewer_host_expression_equals_prod_configmap_domains_yaml(paths):
    shared = _normalized_lines(_text(paths["shared_cm"]), r"^\s+MEDIAVIEWER_HOST:")
    prod = _normalized_lines(_text(paths["prod_domains"]), r"^\s+MEDIAVIEWER_HOST:")
    assert shared, "shared MEDIAVIEWER_HOST expression is empty"
    assert shared == prod


def test_mediaviewer_host_derives_from_prod_domain_no_hardcoded_brand_domain_s3(paths):
    pattern = r'^\s+MEDIAVIEWER_HOST:\s*"mediaviewer\.\$\{PROD_DOMAIN\}"'
    assert _has_line(_text(paths["shared_cm"]), pattern)
