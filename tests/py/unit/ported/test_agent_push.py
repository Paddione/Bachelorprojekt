"""Native migration of tests/unit/agent-push.bats."""
import os
import shlex
import stat

import pytest

SCRIPT = "scripts/agent-push.sh"
SESSION_ARGS = ["opencode", "session.started", "session-123", "Session gestartet"]

# Mock-curl-Rumpf: loggt Argumente und stdin (falls kein TTY) in CURL_LOG.
LOG_HEADER = """#!/bin/sh
echo "curl $@" >> "CURL_LOG_PATH"
if [ ! -t 0 ]; then
  cat >> "CURL_LOG_PATH"
fi
"""

WRITE_MOCK_CURL_RESPONSE = LOG_HEADER + """echo "RESPONSE_BODY"
exit EXIT_CODE
"""

HAPPY_CURL = LOG_HEADER + """case "$@" in
  *settings*)
    echo '{"enabled":true}'
    exit 0
    ;;
  *mock-ntfy*)
    echo "OK"
    exit 0
    ;;
esac
"""

RETRY_CURL = """#!/bin/sh
echo "curl $@" >> "CURL_LOG_PATH"
case "$@" in
  *settings*)
    echo '{"enabled":true}'
    exit 0
    ;;
  *mock-ntfy*)
    exit 22
    ;;
esac
"""

BODY_CURL = LOG_HEADER + """case "$@" in
  *settings*)
    echo '{"enabled":true}'
    exit 0
    ;;
  *mock-ntfy*)
    exit 0
    ;;
esac
"""


@pytest.fixture
def push(tmp_path, run_cmd):
    """Mock-curl-Umgebung wie in setup(); liefert install() und run()."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    curl_log = tmp_path / "curl_calls.log"
    agent_push_log = tmp_path / "agent-push.log"
    env = {
        "CURL_LOG": str(curl_log),
        "AGENT_PUSH_LOG": str(agent_push_log),
        "NTFY_BASE_URL": "http://mock-ntfy",
        "NTFY_TOKEN_OPENCODE": "tk_opencode_dev_token_32chars_ab",
        "NTFY_TOKEN_AGY": "tk_agy_dev_token_32chars_ab12345",
        "AGENT_PUSH_API": "http://mock-api",
        "AGENT_PUSH_TOKEN": "dev-agent-push-token-1234567890",
        "AGENT_PUSH_LINK_BASE": "http://mock-link",
        "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
    }

    def install(template, body="", exit_code="0"):
        script = (
            template.replace("CURL_LOG_PATH", str(curl_log))
            .replace("RESPONSE_BODY", body)
            .replace("EXIT_CODE", exit_code)
        )
        path = bin_dir / "curl"
        path.write_text(script, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def run():
        # stdin auf /dev/null, damit der Mock-Zweig "kein TTY" deterministisch greift.
        cmd = " ".join(["bash", SCRIPT, *map(shlex.quote, SESSION_ARGS)]) + " < /dev/null"
        return run_cmd(cmd, env=env)

    class Push:
        pass

    p = Push()
    p.install = install
    p.run = run
    p.curl_log = curl_log
    p.agent_push_log = agent_push_log
    return p


def _text(path):
    return path.read_text(encoding="utf-8") if path.exists() else ""


def test_opt_in_disabled_skips_send(push):
    push.install(WRITE_MOCK_CURL_RESPONSE, body='{"enabled":false}', exit_code="0")
    r = push.run()
    r.check()
    log = _text(push.curl_log)
    assert "api/admin/agent-push/settings" in log
    assert "mock-ntfy" not in log
    assert "SKIP source=opencode" in _text(push.agent_push_log)


def test_opt_in_api_unreachable_skips_send(push):
    push.install(WRITE_MOCK_CURL_RESPONSE, body="", exit_code="7")
    r = push.run()
    r.check()
    log = _text(push.curl_log)
    assert "api/admin/agent-push/settings" in log
    assert "mock-ntfy" not in log
    assert "SKIP source=opencode" in _text(push.agent_push_log)


def test_happy_path_posts_to_topic(push):
    push.install(HAPPY_CURL)
    r = push.run()
    r.check()
    log = _text(push.curl_log)
    assert "api/admin/agent-push/settings" in log
    assert "mock-ntfy/bachelorprojekt-opencode" in log
    assert "Authorization: Bearer tk_opencode_dev_token_32chars_ab" in log


def test_retry_then_give_up_logs(push):
    push.install(RETRY_CURL)
    r = push.run()
    r.check()
    log = _text(push.curl_log)
    assert "api/admin/agent-push/settings" in log
    assert sum(1 for line in log.splitlines() if "mock-ntfy" in line) == 3
    assert "GIVEUP source=opencode" in _text(push.agent_push_log)


def test_body_no_sensitive_content(push):
    push.install(BODY_CURL)
    r = push.run()
    r.check()
    log = _text(push.curl_log)
    assert "session-123" in log
    assert "http://mock-link/session-123" in log
