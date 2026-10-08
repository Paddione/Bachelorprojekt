"""Native pytest migration of tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_llmproxypanel_mentions_attempted_address_and_does_not_suggest_task_start_when_unreachable_1(repo_root, run_cmd, tmp_path):
    'LlmProxyPanel mentions attempted address and does not suggest task start when unreachable'
    result = run_cmd(['grep', '-rn', 'snap.address', 'components/website/src/components/sdlc/cockpit/LlmProxyPanel.svelte'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-rn', 'Proxy offline — Start:', 'components/website/src/components/sdlc/cockpit/LlmProxyPanel.svelte'])
    assert result.returncode != 0, result.output
