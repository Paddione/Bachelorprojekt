"""FE05 (#7234): Website-Builds muessen digest-scharf ins korczewski-prod-Artefakt fliessen.

Der Direkt-Deploy `deploy-korczewski` ist unter Flux-Steady-State tot
(`if: vars.FLUX_ENABLED != 'true'` feuert nie); die Fleet-Seite bekommt den
frischen Digest per `workflow_call` — die korczewski-prod-Seite hat weder
Trigger noch Digest-Verdrahtung und pinnt dauerhaft den Placeholder aus
`environments/korczewski-prod.yaml`. Diese Tests pinnen die Kette.
"""
from pathlib import Path

import pytest
import yaml


def _load_jobs(path: Path) -> dict:
    return (yaml.safe_load(path.read_text()) or {}).get("jobs", {})


def _triggers_of(path: Path) -> dict:
    data = yaml.safe_load(path.read_text()) or {}
    # `on:` loest PyYAML nach YAML 1.1 als `True` auf — Repo-Konvention wie in
    # test_self_hosted_fork_guard.py und test_goals_data_sdlc_target.py; die
    # Assertions unten bleiben unveraendert.
    on = data.get("on", data.get(True, {}))
    return on if isinstance(on, dict) else {}


def test_fe05_website_build_erreicht_korczewski_prod_render(repo_root):
    """Ein Website-Image-Build muss den korczewski-prod-Render anstossen.

    Entweder ruft build-website.yml den korczewski-prod-Render per
    `workflow_call` auf (digest-scharf, wie bei render-fleet-artifact), oder
    render-korczewski-prod-artifact.yml triggert selbst auf
    `components/website/**`-Aenderungen.
    """
    build_wf = repo_root / ".github/workflows/build-website.yml"
    prod_wf = repo_root / ".github/workflows/render-korczewski-prod-artifact.yml"
    build_text = build_wf.read_text()

    chained = "render-korczewski-prod-artifact.yml" in build_text

    triggers = _triggers_of(prod_wf)
    push_paths = ((triggers.get("push") or {}).get("paths") or [])
    self_triggered = any("components/website/" in str(p) for p in push_paths)

    assert chained or self_triggered, (
        "FE05: kein Pfad vom Website-Build ins korczewski-prod-Artefakt "
        "(weder workflow_call aus build-website.yml noch push-Trigger auf "
        "components/website/** in render-korczewski-prod-artifact.yml)"
    )


def test_fe05_korczewski_prod_render_verbraucht_frischen_website_digest(repo_root):
    """Der korczewski-prod-Render muss den frischen Website-Digest verbrauchen.

    Der statische Placeholder in environments/korczewski-prod.yaml darf nicht
    die einzige Digest-Quelle sein: Der Render-Workflow muss einen
    `website_image_digest`-Input (workflow_call) annehmen und als
    WEBSITE_IMAGE_DIGEST in den Render-Schritt verdrahten.
    """
    prod_wf = repo_root / ".github/workflows/render-korczewski-prod-artifact.yml"
    text = prod_wf.read_text()
    triggers = _triggers_of(prod_wf)
    call_inputs = ((triggers.get("workflow_call") or {}).get("inputs") or {})

    assert "website_image_digest" in call_inputs, (
        "FE05: render-korczewski-prod-artifact.yml nimmt keinen "
        "website_image_digest per workflow_call an"
    )
    assert "WEBSITE_IMAGE_DIGEST" in text, (
        "FE05: WEBSITE_IMAGE_DIGEST wird im korczewski-prod-Render nicht verdrahtet"
    )
