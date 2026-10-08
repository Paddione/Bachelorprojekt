"""Native migration of tests/spec/toolset-registry/check-drift-detection.bats."""
# Runs the toolset gate. Positive anchor: a consistent fixture exits 0. Negative: a hand-edited

# managed key exits non-zero and the output names file and key on one line.

import re

CAPABILITIES = """capabilities:
  github:
    cli:gh-axi:
      state: canonical
      use_when: "Fixture: alle GitHub-Operationen."
      roles: [all]
    mcp:github-mcp:
      state: suppressed
      reason: "Fixture: gh-axi ist der mandatierte GitHub-Pfad."
"""


def test_toolset_gate_detects_hand_edited_target_config_drift(run_cmd, repo_root, tmp_path):
    reg_dir = tmp_path / "registry"
    out_dir = tmp_path / "out" / ".claude"
    reg_dir.mkdir()
    out_dir.mkdir(parents=True)
    registry = reg_dir / "capabilities.yaml"
    registry.write_text(CAPABILITIES, encoding="utf-8")
    settings = out_dir / "settings.json"
    settings.write_text('{\n  "theme": "dark",\n  "disabledMcpjsonServers": ["github-mcp"]\n}\n', encoding="utf-8")

    gate = str(repo_root / "scripts" / "toolset" / "check.mjs")
    env = {"TOOLSET_REGISTRY": str(registry), "TOOLSET_OUT_DIR": str(tmp_path / "out")}

    # Positive anchor: unchanged, consistent fixture -> exit 0.
    res = run_cmd(["node", gate], cwd=repo_root, env=env)
    assert res.returncode == 0, f"Positiv-Anker: Gate gegen konsistente Fixture muss Exit 0 liefern (status={res.returncode})"

    # Drift: re-enable the suppressed mcp instance (managed key falsified).
    settings.write_text('{\n  "theme": "dark",\n  "disabledMcpjsonServers": []\n}\n', encoding="utf-8")
    res = run_cmd(["node", gate], cwd=repo_root, env=env)
    assert res.returncode != 0, "Drift muss nicht-Null-Exit liefern"
    # Narrowed assertion: file AND key on the same output line.
    pattern = re.compile(r"settings\.json.*disabledMcpjsonServers|disabledMcpjsonServers.*settings\.json")
    assert any(pattern.search(line) for line in res.output.splitlines()), (
        f"Ausgabe nennt nicht Datei und Schluessel in einer Zeile: {res.output}"
    )
