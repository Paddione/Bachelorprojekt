"""Native migration of tests/spec/sdlc-cockpit/adapter-contract.bats."""
import re

import pytest


@pytest.fixture
def adapter_file(repo_root):
    return repo_root / ".lavish" / "kit" / "adapter.js"


@pytest.fixture
def adapter_text(adapter_file):
    assert adapter_file.is_file(), f"missing: {adapter_file}"
    return adapter_file.read_text(encoding="utf-8")


def _function_names(text, suffix=""):
    """Emulate: grep -oP 'function\\s+\\w+(?=\\s*\\()' (optionally with a suffix)."""
    pattern = r"function\s+\w+" + suffix + r"(?=\s*\()"
    return "\n".join(m.group(0) for m in re.finditer(pattern, text))


def test_adapter_js_exists(adapter_file):
    assert adapter_file.is_file()


def test_adapter_js_exposes_all_5_read_methods(adapter_text):
    # Muss enthalten: tickets, agents, ci, cluster, models (factory entfernt T900728)
    output = _function_names(adapter_text)
    for method in ["tickets", "agents", "ci", "cluster", "models"]:
        assert method in output, f"Missing method: {method}"


def test_adapter_js_exposes_1_stream_method_k2_new(adapter_text):
    output = _function_names(adapter_text)
    assert "agentStream" in output, "Missing stream method: agentStream"


def test_adapter_js_exposes_unsubscribe(adapter_text):
    assert sum(1 for line in adapter_text.splitlines() if "unsubscribe" in line) > 0


def test_adapter_js_exposes_the_k4_write_method_ticket_action(adapter_text):
    output = _function_names(adapter_text, suffix="Action")
    assert "ticketAction" in output, "Missing write method: ticketAction"
    assert "agentAction" not in output, "agentAction must be removed (K4, Auth-Schnitt)"


def test_adapter_js_removed_get_token_k4_auth_schnitt(adapter_text):
    assert sum(1 for line in adapter_text.splitlines() if "getToken" in line) == 0


def test_adapter_js_has_no_hardcoded_fixture_arrays_k2_replaces_k1(adapter_text):
    # K1 hatte fixtures = { tickets: [...], agents: [...] }; K2 darf das nicht haben.
    assert sum(1 for line in adapter_text.splitlines() if "fixtures" in line) == 0
