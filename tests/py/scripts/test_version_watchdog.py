"""tests/py/scripts/test_version_watchdog.py — scripts/version_watchdog.py.

Pruefmodus: reine Kernlogik (Ref-Parse, Kandidatenwahl, Issue-Body).
Netz (Registries, gh) ist ersetzt; der Gesamtablauf laeuft im Dry-Run.
"""
import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "version_watchdog.py"
spec = importlib.util.spec_from_file_location("version_watchdog", SCRIPT)
vw = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = vw
spec.loader.exec_module(vw)

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
MIN_AGE = timedelta(days=3)


def cand(tag, days=None):
    """(tag, published|None) — days=None heisst Alter unbekannt."""
    published = NOW - timedelta(days=days) if days is not None else None
    return (tag, published)


@pytest.mark.parametrize("ref,expected", [
    ("ghcr.io/paddione/unsloth-serve:0.30.0",
     ("ghcr.io", "paddione/unsloth-serve", "0.30.0", None)),
    ("postgres:16", ("docker.io", "library/postgres", "16", None)),
    ("docker.io/library/redis:7-alpine", ("docker.io", "library/redis", "7-alpine", None)),
    ("quay.io/prometheus/prometheus:v3",
     ("quay.io", "prometheus/prometheus", "v3", None)),
    ("ghcr.io/org/img@sha256:" + "a" * 64,
     ("ghcr.io", "org/img", None, "sha256:" + "a" * 64)),
    ("busybox:1.38.0@sha256:" + "a" * 64,
     ("docker.io", "library/busybox", "1.38.0", "sha256:" + "a" * 64)),
])
def test_parse_image_ref(ref, expected):
    assert vw.parse_image_ref(ref) == expected


@pytest.mark.parametrize("uses,expected", [
    ("actions/checkout@v4", ("actions/checkout", "v4", False)),
    ("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
     ("actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1", True)),
    ("docker/build-push-action@v6", ("docker/build-push-action", "v6", False)),
])
def test_parse_action_ref(uses, expected):
    assert vw.parse_action_ref(uses) == expected


def test_select_candidate_nimmt_neuestes_altes_update():
    assert vw.select_candidate((1, 2, 3),
                               [cand("1.2.4", 5), cand("1.2.9", 4)],
                               NOW, MIN_AGE) == ("update", (1, 2, 9), 4)


def test_select_candidate_haelt_zu_junges_update_zurueck():
    assert vw.select_candidate((1, 2, 3), [cand("1.2.4", 1)],
                               NOW, MIN_AGE) == ("held", (1, 2, 4), 1)


def test_select_candidate_meldet_datumsfrei_neu_statt_zu_verwerfen():
    assert vw.select_candidate((1, 2, 3), [cand("1.2.4")],
                               NOW, MIN_AGE) == ("update", (1, 2, 4), None)


def test_select_candidate_ignoriert_nicht_semver_tags():
    assert vw.select_candidate((1, 2, 3), [cand("latest", 9), cand("edge", 9)],
                               NOW, MIN_AGE) == ("none", None, None)


def test_select_candidate_ignoriert_aeltere_tags():
    assert vw.select_candidate((1, 2, 3), [cand("1.2.0", 9)],
                               NOW, MIN_AGE) == ("none", None, None)


def test_render_issue_body_traegt_marker_und_abschnitte():
    body = vw.render_issue_body(
        {"images": [("k3d/app.yaml", "postgres:16", "17", "5")],
         "actions": [(".github/workflows/ci.yml", "actions/checkout", "v4", "v7", "9")],
         "npm": [("components/website", "lodash", "^4.17.20", "^4.17.21")]},
        held=[("redis", "7.4")], unknown=[("internes/image", "x2")],
        today="2026-11-01", run_url="https://example.invalid/runs/1")
    assert "<!-- version-watchdog -->" in body
    assert "## Images" in body and "## GitHub Actions" in body and "## npm" in body
    assert "postgres:16" in body and "actions/checkout" in body and "lodash" in body


def test_render_issue_body_nennt_grund_statt_nur_fragezeichen():
    body = vw.render_issue_body({"images": [], "actions": [], "npm": []},
                                [], [("quay.io/x/y:1.0", "Registry ohne Abfrage")],
                                "2026-11-01", "run", skipped=3)
    assert "- quay.io/x/y:1.0: Registry ohne Abfrage" in body
    assert "Platzhalter" in body
