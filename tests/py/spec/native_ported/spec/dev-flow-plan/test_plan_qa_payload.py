"""Native migration of tests/spec/dev-flow-plan/plan-qa-payload.bats."""
# T002595: plan-qa-check.sh builds its curl payload offline via --emit-payload. The payload must be
# valid JSON, carry the plan content verbatim, a complete system prompt, and thinking disabled.

# Command output verification [T002448-M4]: the script is executed; no gateway needed.

import json

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")

PLAN = """---
title: "Fixture — Implementation Plan"
ticket_id: T002595
domains: [test]
status: active
---

# Fixture Implementation Plan

## File Structure

- Modify: `scripts/example.sh`

## Task 1: RED

Der Plan enthaelt ein "Anfuehrungszeichen", einen `Backtick-Span`, einen
Backslash \\ und ein $DOLLAR_ZEICHEN — alles Zeichen, die rohe
String-Interpolation in JSON zerbrechen.

Run: `bats tests/unit/example.bats`
Expected: FAIL

## Task 2: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
"""


@pytest.fixture
def emit(run_cmd, repo_root, tmp_path):
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN, encoding="utf-8")
    script = repo_root / "scripts" / "plan-qa-check.sh"

    def _run(env=None):
        return run_cmd(["bash", str(script), "--emit-payload", str(plan)], cwd=repo_root, env=env)

    return _run


def _messages(payload, role):
    return [m.get("content") for m in payload.get("messages", []) if m.get("role") == role]


def test_t002595_emit_payload_erzeugt_valides_json_trotz_sonderzeichen_im_plan(emit):
    res = emit()
    assert res.returncode == 0
    # The actual regression proof: the payload must parse.
    json.loads(res.output)


def test_t002595_der_planinhalt_landet_unverfaelscht_im_payload(emit):
    res = emit()
    assert res.returncode == 0
    payload = json.loads(res.output)
    # Positive anchor: valid JSON alone is not enough, the plan must be inside it.
    user_contents = _messages(payload, "user")
    user_content = user_contents[0] if user_contents else "null"
    assert user_content
    assert "Anfuehrungszeichen" in user_content
    assert "Backtick-Span" in user_content
    assert "DOLLAR_ZEICHEN" in user_content


def test_t002595_der_system_prompt_traegt_kriterium_6_vollstaendig(emit):
    res = emit()
    assert res.returncode == 0
    system_contents = _messages(json.loads(res.output), "system")
    sys_prompt = system_contents[0] if system_contents else "null"
    assert sys_prompt
    # Positive anchor: the prompt carries the criteria list at all.
    assert "Kriterien" in sys_prompt
    # The stdin-redirect example must still be in the prompt (D1 regression).
    assert "< file" in sys_prompt


def test_t002595_emit_payload_gibt_kein_kommando_ergebnis_statt_prompttext_aus(emit):
    res = emit()
    assert res.returncode == 0
    # Positive anchor: the run yields a payload with messages.
    assert len(json.loads(res.output).get("messages", [])) > 0
    # Negative claim.
    assert "No such file or directory" not in res.output


def test_t002595_payload_nennt_das_gateway_modell_und_deaktiviert_thinking(emit):
    res = emit()
    assert res.returncode == 0
    payload = json.loads(res.output)
    model = payload.get("model")
    assert isinstance(model, str) and len(model) > 0
    assert payload.get("enable_thinking") is False
    assert (payload.get("chat_template_kwargs") or {}).get("enable_thinking") is False
    # [T900365] reasoning level travels via reasoning_strength.
    assert (payload.get("chat_template_kwargs") or {}).get("reasoning_strength") == "low"

    # Counter-probe: the value really comes from PLAN_QA_MODEL.
    res = emit(env={"PLAN_QA_MODEL": "pruefmodell-xyz"})
    assert res.returncode == 0
    assert json.loads(res.output).get("model") == "pruefmodell-xyz"
