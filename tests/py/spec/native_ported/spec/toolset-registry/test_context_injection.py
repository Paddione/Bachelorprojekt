"""Native migration of tests/spec/toolset-registry/context-injection.bats."""
# [T002592]
# Command output verification [T002448-M4]: runs scripts/toolset-context.sh and checks status and

# output. The main regression guard is fail-closed behaviour on an unknown role.

import json

import pytest

FIXTURE_YAML = """capabilities:
  demo-db:
    mcp:db-only-server:
      state: canonical
      use_when: "Nur fuer die DB-Rolle"
      avoid_when: "Schreibende SQL"
      fallback: "kubectl exec … psql"
      roles: [bp-run]
      tier: caution
      deep_ref: ".claude/skills/references/mcp-tool-guide.md#demo"
  demo-web:
    mcp:web-only-server:
      state: canonical
      use_when: "Nur fuer die Website-Rolle"
      roles: [bp-ship]
  demo-shared:
    mcp:everywhere-server:
      state: canonical
      use_when: "Fuer jede Rolle"
      roles: [all]
  demo-blocked:
    mcp:blocked-server:
      state: suppressed
      reason: "Nicht projektrelevant."
      use_when: "Darf nie erscheinen"
      roles: [all]
  demo-omp:
    skill:omp-only-skill:
      state: canonical
      use_when: "Nur fuer die minimale Harness-Rolle"
      roles: [omp]
"""


@pytest.fixture
def ctx(run_cmd, repo_root, tmp_path):
    fixture = tmp_path / "capabilities.yaml"
    fixture.write_text(FIXTURE_YAML, encoding="utf-8")
    script = repo_root / "scripts" / "toolset-context.sh"

    def run_ctx(*args):
        return run_cmd(["bash", str(script), *args],
                       cwd=repo_root, env={"TOOLSET_REGISTRY": str(fixture)})

    return {"fixture": fixture, "script": script, "repo": repo_root,
            "run_ctx": run_ctx, "run_cmd": run_cmd}


def test_context_rollenfilter_grenzt_die_ausgabe_ein(ctx):
    res = ctx["run_ctx"]("bp-run")
    assert res.returncode == 0
    # Positive anchor first: the matching instance is there.
    assert "mcp:db-only-server" in res.output
    assert "mcp:web-only-server" not in res.output


def test_context_wildcard_rolle_all_erreicht_jede_rolle(ctx):
    res = ctx["run_ctx"]("bp-run")
    assert res.returncode == 0
    assert "mcp:everywhere-server" in res.output

    res = ctx["run_ctx"]("bp-ship")
    assert res.returncode == 0
    assert "mcp:everywhere-server" in res.output


def test_context_suppressed_erscheint_niemals_im_block(ctx):
    res = ctx["run_ctx"]("orchestrator")
    assert res.returncode == 0
    # Positive anchor: the run emitted at least one instance.
    assert "mcp:everywhere-server" in res.output
    assert "mcp:blocked-server" not in res.output


def test_context_unbekannte_rolle_faellt_closed_und_gibt_keine_instanz_aus(ctx):
    # Positive anchor: the full role yields instances.
    res = ctx["run_ctx"]("bp-run")
    assert res.returncode == 0
    assert "mcp:db-only-server" in res.output

    # Short form 'db' is deliberately invalid.
    res = ctx["run_ctx"]("db")
    assert res.returncode != 0
    # Result lines must be empty, not only the exit code. The grep is narrowed to '### ' lines.
    cmd = (f"env TOOLSET_REGISTRY='{ctx['fixture']}' bash '{ctx['script']}' db 2>&1 "
           "| grep -c '^### ' || true")
    count = ctx["run_cmd"](["bash", "-c", cmd], cwd=ctx["repo"]).stdout.strip()
    assert count == "0"


def test_context_fehlermeldung_nennt_die_gueltigen_rollen(ctx):
    res = ctx["run_ctx"]("nonsense-role")
    assert res.returncode != 0
    assert "bp-run" in res.output
    assert "orchestrator" in res.output


def test_context_gesetzte_felder_werden_gerendert_fehlende_erzeugen_keine_leerzeile(ctx):
    res = ctx["run_ctx"]("bp-run")
    assert res.returncode == 0
    assert "Nur fuer die DB-Rolle" in res.output
    assert "Schreibende SQL" in res.output
    assert "mcp-tool-guide.md#demo" in res.output
    # everywhere-server has no avoid_when / fallback: no empty section may appear.
    assert "mcp:everywhere-server" in res.output
    cmd = (f"env TOOLSET_REGISTRY='{ctx['fixture']}' bash '{ctx['script']}' bp-run 2>/dev/null "
           "| grep -cE '\\*\\*(Nicht|Fallback|Tiefe):\\*\\*[[:space:]]*$' || true")
    assert ctx["run_cmd"](["bash", "-c", cmd], cwd=ctx["repo"]).stdout.strip() == "0"


def test_context_leere_ergebnismenge_ist_kein_fehler(ctx, tmp_path):
    empty = tmp_path / "empty.yaml"
    empty.write_text("""capabilities:
  demo-db:
    mcp:db-only-server:
      state: canonical
      use_when: "Nur fuer die DB-Rolle"
      roles: [bp-run]
""", encoding="utf-8")
    run_cmd = ctx["run_cmd"]
    res = run_cmd(["bash", str(ctx["script"]), "bp-build"], cwd=ctx["repo"],
                  env={"TOOLSET_REGISTRY": str(empty)})
    assert res.returncode == 0
    cmd = (f"env TOOLSET_REGISTRY='{empty}' bash '{ctx['script']}' bp-build 2>/dev/null "
           "| grep -c '^### ' || true")
    assert ctx["run_cmd"](["bash", "-c", cmd], cwd=ctx["repo"]).stdout.strip() == "0"


def test_context_json_liefert_parsebares_json(ctx):
    res = ctx["run_cmd"](["bash", str(ctx["script"]), "bp-run", "--json"], cwd=ctx["repo"],
                  env={"TOOLSET_REGISTRY": str(ctx["fixture"])})
    assert res.returncode == 0
    data = json.loads(res.stdout)
    assert len(data) == 2, f"n={len(data)}"


def test_context_greift_per_default_auf_die_echte_registry_zu(ctx):
    run_cmd = ctx["run_cmd"]
    res = run_cmd(["bash", "-c", f"cd '{ctx['repo']}' && bash scripts/toolset-context.sh orchestrator"])
    assert res.returncode == 0
    count = run_cmd(["bash", "-c",
                     f"cd '{ctx['repo']}' && bash scripts/toolset-context.sh orchestrator | grep -c '^### '"])
    assert int(count.stdout.strip() or 0) >= 1


def test_context_rolle_omp_erbt_die_wildcard_all_nicht(ctx):
    res = ctx["run_ctx"]("omp")
    assert res.returncode == 0
    # Positive anchor: the explicit grant for omp is there.
    assert "skill:omp-only-skill" in res.output
    # The wildcard instance from demo-shared must not appear here.
    assert "mcp:everywhere-server" not in res.output
