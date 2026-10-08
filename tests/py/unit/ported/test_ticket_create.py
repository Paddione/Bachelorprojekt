"""Native migration of tests/unit/ticket-create.bats."""
import os
import re
from pathlib import Path

import pytest

KUBECTL_MOCK = """#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
# T015008: the ctx-guard probes the kubeconfig before every write; emulate a
# LAN-resolved context so the guard passes and the INSERT path is reached.
if [[ "$*" == *"config view"* ]]; then
  if [[ "$*" == *".contexts["* ]]; then echo "mock-cluster"; else echo "https://10.0.33.1:6443"; fi
  exit 0
fi
if [[ "$*" == *"exec"* ]]; then cat >> "{cap}"; echo "T000999|fake-uuid-1234"; exit 0; fi
exit 0
"""


@pytest.fixture
def ticket_env(repo_root, tmp_path):
    """Mock kubectl on PATH; captured SQL lands in cap."""
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    cap = mockdir / "captured.sql"
    kubectl = mockdir / "kubectl"
    kubectl.write_text(KUBECTL_MOCK.replace("{cap}", str(cap)))
    kubectl.chmod(0o755)
    ticket = repo_root / "scripts" / "ticket.sh"
    env = {"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "CAP": str(cap)}
    return ticket, cap, env


def test_create_requires_type_title_and_description(run_cmd, ticket_env):
    ticket, _cap, env = ticket_env
    result = run_cmd(["bash", str(ticket), "create", "--type", "bug", "--title", "x"], env=env)
    assert result.returncode != 0
    assert "required" in result.output


def test_create_never_inserts_a_null_attention_mode_defaults_to_auto(run_cmd, ticket_env):
    ticket, cap, env = ticket_env
    result = run_cmd(
        ["bash", str(ticket), "create", "--type", "bug", "--title", "T", "--description", "D"],
        env=env,
    )
    result.check()
    captured = Path(cap).read_text() if Path(cap).exists() else ""
    assert "INSERT INTO tickets.tickets" in captured
    assert "attention_mode" in captured
    # COALESCE supplies 'auto' so the NOT NULL constraint holds without --attention-mode.
    assert re.search(r"COALESCE\(NULLIF\(:'attn', ''\), 'auto'\)", captured, re.IGNORECASE)


def test_create_passes_an_explicit_attention_mode_through(run_cmd, ticket_env):
    ticket, cap, env = ticket_env
    result = run_cmd(
        [
            "bash", str(ticket), "create", "--type", "bug", "--title", "T",
            "--description", "D", "--attention-mode", "ai_ready",
        ],
        env=env,
    )
    result.check()
    captured = Path(cap).read_text() if Path(cap).exists() else ""
    assert re.search(r"COALESCE\(NULLIF\(:'attn', ''\), 'auto'\)", captured, re.IGNORECASE)
