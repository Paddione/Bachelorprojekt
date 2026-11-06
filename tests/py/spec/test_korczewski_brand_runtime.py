"""Korczewski storefront must not inherit the shared massage identity."""
import json

import yaml


def test_storefront_overrides_shared_brand_identity(repo_root):
    docs = list(yaml.safe_load_all((repo_root / "k3d/website-korczewski.yaml").read_text()))
    deployment = next(doc for doc in docs if doc and doc["kind"] == "Deployment")
    container = deployment["spec"]["template"]["spec"]["containers"][0]
    env = {entry["name"]: entry.get("value") for entry in container["env"]}
    assert env["BRAND"] == env.get("BRAND_ID") == "korczewski"
    assert env.get("CONTACT_EMAIL") == "info@korczewski.de"
    assert env.get("CONTACT_PHONE") == ""


def test_storefront_navigation_reaches_contact_and_services(repo_root):
    content = repo_root / "components/website/content/korczewski"
    links = json.loads((content / "navigation.json").read_text())
    assert {"/leistungen", "/kontakt"} <= {link["href"] for link in links}
    assert all(link["label"] for link in links)
    assert json.loads((content / "stammdaten.json").read_text())["email"] == "info@korczewski.de"
