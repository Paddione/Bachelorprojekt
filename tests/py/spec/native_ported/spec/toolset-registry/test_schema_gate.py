"""Native migration of tests/spec/toolset-registry/schema-gate.bats."""
# [T002592]
# Schema gate of check.mjs. Each test runs check.mjs against a fixture registry written under

# tmp_path and checks exit status and output. Command output verification [T002448-M4].

import pytest


@pytest.fixture
def gate(run_cmd, repo_root, tmp_path):
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    check = str(repo_root / "scripts" / "toolset" / "check.mjs")
    counter = {"n": 0}

    def write_registry(text):
        counter["n"] += 1
        path = tmp_path / f"registry-{counter['n']}.yaml"
        path.write_text(text, encoding="utf-8")
        return path

    def run_check(registry, out=None):
        return run_cmd(["node", check], cwd=repo_root,
                       env={"TOOLSET_REGISTRY": str(registry), "TOOLSET_OUT_DIR": str(out or out_dir)})

    return {"write": write_registry, "check": run_check, "repo": repo_root, "out": out_dir,
            "run_cmd": run_cmd, "check_path": check}


def test_schema_gate_canonical_ohne_use_when_faellt_fail_closed(gate):
    # Positive anchor: the same fixture WITH use_when and roles passes (T002356-M1).
    ok = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [bp-run]
""")
    assert gate["check"](ok).returncode == 0

    bad = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      roles: [bp-run]
""")
    res = gate["check"](bad)
    assert res.returncode != 0
    assert "demo-cap" in res.output
    assert "mcp:demo-server" in res.output
    assert "use_when" in res.output


def test_schema_gate_canonical_ohne_roles_faellt_fail_closed(gate):
    ok = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
""")
    assert gate["check"](ok).returncode == 0

    bad = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
""")
    res = gate["check"](bad)
    assert res.returncode != 0
    assert "roles" in res.output
    assert "mcp:demo-server" in res.output


def test_schema_gate_leere_roles_liste_zaehlt_als_fehlend(gate):
    bad = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: []
""")
    res = gate["check"](bad)
    assert res.returncode != 0
    assert "roles" in res.output


def test_schema_gate_rollen_kurzform_ausserhalb_des_vokabulars_faellt(gate):
    # Positive anchor: the full role name is accepted.
    ok = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [bp-run]
""")
    assert gate["check"](ok).returncode == 0

    bad = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [db]
""")
    res = gate["check"](bad)
    assert res.returncode != 0
    # The message must name the unknown role, otherwise it is not actionable.
    cmd = (f"env TOOLSET_REGISTRY='{bad}' TOOLSET_OUT_DIR='{gate['out']}' node '{gate['check_path']}' 2>&1 "
           "| grep -c \"unknown role 'db'\"")
    count = gate["run_cmd"](["bash", "-c", cmd], cwd=gate["repo"]).stdout.strip()
    assert int(count or 0) >= 1


def test_schema_gate_wildcard_rolle_all_ist_gueltig(gate):
    ok = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [all]
""")
    assert gate["check"](ok).returncode == 0


def test_schema_gate_ungueltiges_tier_faellt_und_nennt_den_wert(gate):
    ok = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
      tier: dangerous
""")
    assert gate["check"](ok).returncode == 0

    bad = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
      tier: gefaehrlich
""")
    res = gate["check"](bad)
    assert res.returncode != 0
    assert "gefaehrlich" in res.output


def test_schema_gate_suppressed_braucht_keine_nutzungssemantik(gate):
    # Positive anchor: the same instance WITHOUT use_when/roles is red as canonical.
    as_canonical = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
""")
    assert gate["check"](as_canonical).returncode != 0

    as_suppressed = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
    mcp:other-server:
      state: suppressed
      reason: "Demo-Server ist der kanonische Pfad."
""")
    assert gate["check"](as_suppressed).returncode == 0


def test_schema_gate_unreviewed_instanzen_brechen_den_gate_nicht(gate, repo_root):
    # SSOT: quarantine without CI break ("SHALL still exit zero"). TOOLSET_OUT_DIR points at the
    # real repo on purpose so that collect.mjs finds real settings, .mcp.json and skills.
    fx = gate["write"]("""capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
""")
    res = gate["check"](fx, out=repo_root)
    assert res.returncode == 0

    # Positive anchors: unreviewed instances are reported, and the report names the curation skill.
    count_unreviewed = gate["run_cmd"](
        ["bash", "-c", f"env TOOLSET_REGISTRY='{fx}' TOOLSET_OUT_DIR='{repo_root}' node "
                       f"'{gate['check_path']}' 2>&1 | grep -c '^  unreviewed: '"],
        cwd=repo_root).stdout.strip()
    assert int(count_unreviewed or 0) >= 1
    count_curate = gate["run_cmd"](
        ["bash", "-c", f"env TOOLSET_REGISTRY='{fx}' TOOLSET_OUT_DIR='{repo_root}' node "
                       f"'{gate['check_path']}' 2>&1 | grep -c 'toolset-curate'"],
        cwd=repo_root).stdout.strip()
    assert int(count_curate or 0) >= 1


def test_schema_gate_die_echte_registry_ist_vollstaendig_kuratiert(gate, repo_root):
    res = gate["run_cmd"](["bash", "-c", f"cd '{repo_root}' && node scripts/toolset/check.mjs"], cwd=repo_root)
    assert res.returncode == 0
    assert "Toolset registry check passed." in res.output
