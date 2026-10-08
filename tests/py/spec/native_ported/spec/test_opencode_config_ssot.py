"""Native migration of tests/spec/opencode-config-ssot.bats."""

import os
import tempfile
import shutil

import pytest

NODE_BIG_PICKLE = r"""
    const { parse } = require("jsonc-parser");
    const fs = require("fs");
    const src = fs.readFileSync(".opencode/agent-models.jsonc", "utf8");
    const errors = [];
    const cfg = parse(src, errors, { allowTrailingComma: true });
    if (errors.length) { console.error("parse errors:", errors); process.exit(1); }
    const v = cfg.provider["opencode-zen"].models["big-pickle"].limit.context;
    if (v !== 260000) { console.error("big-pickle limit.context =", v, "(expected 260000)"); process.exit(1); }
"""

NODE_DEAD_MODELS = r"""
    const fs = require("fs");
    const src = fs.readFileSync(".opencode/agent-models.jsonc", "utf8");
    const dead = ["hauhau-qwen36", "gemma12-vision"];
    const bad = [];
    for (const name of dead) {
      const idx = src.indexOf(`"${name}": {`);
      if (idx < 0) continue; // In T900164 vollstaendig entfernt (siehe docs/agent-guide/registry/retired.md)
      const limitIdx = src.indexOf(`"limit": {`, idx);
      if (limitIdx < 0 || !/stale:/.test(src.slice(idx, limitIdx))) {
        bad.push(name + ": weder entfernt noch mit // stale: markiert");
      }
    }
    if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
"""


def test_ssot_opencode_zen_big_pickle_limit_context_ist_260000(run_cmd, repo_root):
    result = run_cmd(["node", "-e", NODE_BIG_PICKLE], cwd=repo_root)
    assert result.returncode == 0, result.output


def test_sync_dry_run_ist_idempotent_leerer_diff_nach_apply(run_cmd, repo_root):
    tmp_dir = tempfile.mkdtemp()
    try:
        env = {"OPENCODE_CONFIG": os.path.join(tmp_dir, "opencode.jsonc")}
        run_cmd(["bash", "scripts/opencode-sync-agents.sh"], cwd=repo_root, env=env)
        result = run_cmd(["bash", "scripts/opencode-sync-agents.sh", "--dry-run"], cwd=repo_root, env=env)
        assert result.returncode == 0, result.output
        assert "no changes" in result.output
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_ssot_tot_verifizierte_llamacpp_local_modelle_sind_entfernt_oder_tragen_stale_marker(
    run_cmd, repo_root
):
    result = run_cmd(["node", "-e", NODE_DEAD_MODELS], cwd=repo_root)
    assert result.returncode == 0, result.output
