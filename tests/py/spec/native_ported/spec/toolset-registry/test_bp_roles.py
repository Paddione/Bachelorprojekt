"""Native migration of tests/spec/toolset-registry/bp-roles.bats."""
# [T900980]
# bp-*-role vocabulary of the toolset chain. Command output verification [T002448-M4]: runs

# toolset-context.sh and scripts/toolset/check.mjs and checks status and output.

import pytest

FIXTURE_YAML = """capabilities:
  demo-run:
    mcp:run-server:
      state: canonical
      use_when: "Nur fuer bp-run"
      roles: [bp-run]
  demo-ship:
    mcp:ship-server:
      state: canonical
      use_when: "Nur fuer bp-ship"
      roles: [bp-ship]
  demo-shared:
    mcp:everywhere-server:
      state: canonical
      use_when: "Fuer jede Rolle"
      roles: [all]
"""


@pytest.fixture
def ctx(repo_root, tmp_path):
    out_dir = tmp_path / "out"
    (out_dir / ".claude").mkdir(parents=True)
    (out_dir / ".claude" / "settings.json").write_text("{}\n", encoding="utf-8")
    fixture = tmp_path / "capabilities.yaml"
    fixture.write_text(FIXTURE_YAML, encoding="utf-8")
    return {"repo": repo_root, "out": out_dir, "fixture": fixture}


@pytest.fixture
def run_ctx(run_cmd, ctx):
    def _run(*args):
        return run_cmd(["bash", str(ctx["repo"] / "scripts" / "toolset-context.sh"), *args],
                       cwd=ctx["repo"], env={"TOOLSET_REGISTRY": str(ctx["fixture"])})
    return _run


def _check(run_cmd, ctx, registry, out_dir=None):
    env = {"TOOLSET_REGISTRY": str(registry)}
    if out_dir is not None:
        env["TOOLSET_OUT_DIR"] = str(out_dir)
    return run_cmd(["node", str(ctx["repo"] / "scripts" / "toolset" / "check.mjs")],
                   cwd=ctx["repo"], env=env)


def test_bp_roles_toolset_context_akzeptiert_bp_build_bp_run_und_bp_ship(run_ctx):
    for role in ("bp-build", "bp-run", "bp-ship"):
        res = run_ctx(role)
        assert res.returncode == 0
        # The wildcard must reach every bp role, otherwise the role is valid but empty.
        assert "mcp:everywhere-server" in res.output


def test_bp_roles_rollenfilter_trennt_bp_run_von_bp_ship(run_ctx):
    res = run_ctx("bp-run")
    assert res.returncode == 0
    assert "mcp:run-server" in res.output
    assert "mcp:ship-server" not in res.output


def test_bp_roles_legacy_rolle_wird_mit_hinweis_auf_die_bp_rolle_aufgeloest(run_ctx):
    # bachelorprojekt-db was merged into bp-run (plan-context.sh, T900858).
    res = run_ctx("bachelorprojekt-db")
    assert res.returncode == 0
    assert "mcp:run-server" in res.output
    assert "bp-run" in res.output
    assert "veraltet" in res.output


def test_bp_roles_fehlermeldung_nennt_die_bp_rollen(run_ctx):
    res = run_ctx("nonsense-role")
    assert res.returncode != 0
    assert "bp-build" in res.output
    assert "bp-ship" in res.output


def test_bp_roles_echte_registry_liefert_jeder_bp_rolle_mindestens_eine_instanz(run_cmd, repo_root):
    for role in ("bp-build", "bp-run", "bp-ship"):
        res = run_cmd(["bash", "-c",
                       f"cd '{repo_root}' && bash scripts/toolset-context.sh {role} 2>/dev/null | grep -c '^### '"])
        assert int(res.stdout.strip() or 0) >= 1


def test_bp_roles_check_mjs_akzeptiert_bp_rollen(run_cmd, ctx):
    res = run_cmd(["node", str(ctx["repo"] / "scripts" / "toolset" / "check.mjs")], cwd=ctx["repo"],
                  env={"TOOLSET_REGISTRY": str(ctx["fixture"]), "TOOLSET_OUT_DIR": str(ctx["out"])})
    assert res.returncode == 0
    assert "check passed" in res.output


def test_bp_roles_check_mjs_lehnt_legacy_rolle_in_der_registry_ab_und_nennt_den_ersatz(run_cmd, ctx, tmp_path):
    legacy = tmp_path / "legacy.yaml"
    legacy.write_text("""capabilities:
  demo-db:
    mcp:db-server:
      state: canonical
      use_when: "Legacy"
      roles: [bachelorprojekt-db]
""", encoding="utf-8")
    res = _check(run_cmd, ctx, legacy, ctx["out"])
    assert res.returncode != 0
    assert "bachelorprojekt-db" in res.output
    assert "bp-run" in res.output


def test_bp_roles_echte_registry_besteht_check_mjs(run_cmd, repo_root):
    res = run_cmd(["bash", "-c", f"cd '{repo_root}' && node scripts/toolset/check.mjs"])
    assert res.returncode == 0
