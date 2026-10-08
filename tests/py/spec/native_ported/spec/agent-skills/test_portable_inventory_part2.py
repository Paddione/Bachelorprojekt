"""Native migration of tests/spec/agent-skills/portable-inventory.bats. (part 2/2)"""
import json
import os
import re
from pathlib import Path
import pytest


REGISTRY_REL = "docs/agent-guide/registry/skills.yaml"


REGISTRY_HEADER = (
    "schema_version: 1\n"
    "harnesses:\n"
    "  codex:\n"
    "    discovery_root: .agents/skills\n"
    "  agy:\n"
    "    discovery_root: .agents/skills\n"
    "  opencode:\n"
    "    discovery_root: .opencode/skills\n"
    "  claude_code:\n"
    "    discovery_root: .claude/skills\n"
    "  muse:\n"
    "    discovery_root: .agents/skills\n"
    "skills:\n"
)


@pytest.fixture
def root(tmp_path):
    """BATS setup: ROOT mit Skill-Baeumen und Registry-Verzeichnis."""
    r = tmp_path / "root"
    for d in (".agents/skills", ".opencode/skills", ".claude/skills", "docs/agent-guide/registry"):
        (r / d).mkdir(parents=True)
    return r


@pytest.fixture
def engine(repo_root):
    return repo_root / "scripts/agent-skills/project.mjs"


def put_skill(skills_dir: Path, sid: str, body: str = "canonical portable body") -> None:
    d = skills_dir / sid
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(
        f"---\nname: {sid}\ndescription: fixture skill\n---\n\n# {sid}\n\n{body}\n", encoding="utf-8"
    )


def put_extra(skills_dir: Path, sid: str, relpath: str, content: str) -> None:
    target = skills_dir / sid / relpath
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content + "\n", encoding="utf-8")


def write_registry(root: Path, body: str) -> None:
    (root / REGISTRY_REL).write_text(REGISTRY_HEADER + body.rstrip("\n") + "\n", encoding="utf-8")


def run_engine(run_cmd, engine, root, *args, env=None, prefix=None):
    cmd = (prefix or []) + ["node", str(engine), "--root", str(root), *args]
    return run_cmd(cmd, env=env)


def assert_has(output: str, needle: str) -> None:
    assert needle in output, f"ERWARTET im Output: {needle}\n--- tatsaechlicher Output ---\n{output}"


def assert_lacks(output: str, needle: str) -> None:
    assert needle not in output, f"NICHT ERWARTET im Output: {needle}\n--- tatsaechlicher Output ---\n{output}"


def json_findings(output: str):
    """Eine Zeile je Befund: code|skill|harness (fehlend -> '-')."""
    j = json.loads(output)
    lines = []
    for f in j.get("findings") or []:
        skill = f.get("skill")
        harness = f.get("harness")
        lines.append("|".join([
            "" if f.get("code") is None else str(f.get("code")),
            "-" if skill is None else str(skill),
            "-" if harness is None else str(harness),
        ]))
    return lines


def tree_files(base: Path):
    out = {}
    for dirpath, _dirs, files in os.walk(base):
        for name in files:
            p = Path(dirpath) / name
            if p.is_symlink():
                continue
            out[str(p.relative_to(base))] = p.read_bytes()
    return out


def all_files(base: Path):
    return sorted(
        str(Path(dp, n).relative_to(base))
        for dp, _dn, fn in os.walk(base)
        for n in fn
        if not Path(dp, n).is_symlink()
    )



def test_symlinked_projection_wird_gemeldet_obwohl_ihr_ziel_inhaltlich_korrekt_ist(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-symproj")
    put_skill(root / ".claude/skills", "demo-symproj")
    os.symlink("../../.agents/skills/demo-symproj", root / ".opencode/skills/demo-symproj")
    write_registry(root, """  - id: demo-symproj
    provenance: project
    exposure: portable
    source: .agents/skills/demo-symproj
    harnesses:
      codex:       { path: .agents/skills/demo-symproj,   sync: identical }
      agy:         { path: .agents/skills/demo-symproj,   sync: identical }
      muse:         { path: .agents/skills/demo-symproj,   sync: identical }
      opencode:    { path: .opencode/skills/demo-symproj, sync: identical }
      claude_code: { path: .claude/skills/demo-symproj,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output
    assert_has(r.output, "symlinked-projection")
    assert_has(r.output, "harness=opencode")
    assert_lacks(r.output, "body-drift")



def test_aggregierter_harness_name_both_wird_als_unknown_harness_abgelehnt(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-schema")
    (root / REGISTRY_REL).write_text(
        "schema_version: 1\n"
        "harnesses:\n"
        "  codex:\n    discovery_root: .agents/skills\n"
        "  agy:\n    discovery_root: .agents/skills\n"
        "  opencode:\n    discovery_root: .opencode/skills\n"
        "  claude_code:\n    discovery_root: .claude/skills\n"
        "  muse:\n    discovery_root: .agents/skills\n"
        "skills:\n"
        "  - id: demo-schema\n"
        "    provenance: project\n"
        "    exposure: portable\n"
        "    source: .agents/skills/demo-schema\n"
        "    harnesses:\n"
        "      both: { path: .agents/skills/demo-schema, sync: identical }\n"
        "    exclusions: {}\n",
        encoding="utf-8",
    )

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 2
    assert_has(r.output, "unknown-harness")
    assert_has(r.output, "skill=demo-schema")



def test_unbekannter_exposure_wert_wird_als_invalid_exposure_abgelehnt(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-exposure")
    write_registry(root, """  - id: demo-exposure
    provenance: project
    exposure: shared
    source: .agents/skills/demo-exposure
    harnesses:
      codex: { path: .agents/skills/demo-exposure, sync: identical }
    exclusions:
      agy:         "Fixture."
      muse:         "Fixture."
      opencode:    "Fixture."
      claude_code: "Fixture."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 2
    assert_has(r.output, "invalid-exposure")
    assert_has(r.output, "skill=demo-exposure")



def test_doppelte_skill_id_wird_als_duplicate_skill_id_abgelehnt(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-dup")
    write_registry(root, """  - id: demo-dup
    provenance: project
    exposure: portable
    source: .agents/skills/demo-dup
    harnesses:
      codex: { path: .agents/skills/demo-dup, sync: identical }
    exclusions:
      agy:         "Fixture."
      muse:         "Fixture."
      opencode:    "Fixture."
      claude_code: "Fixture."
  - id: demo-dup
    provenance: project
    exposure: native
    source: .agents/skills/demo-dup
    harnesses:
      agy: { path: .agents/skills/demo-dup, sync: identical }
      muse: { path: .agents/skills/demo-dup, sync: identical }
    exclusions:
      codex:       "Fixture."
      opencode:    "Fixture."
      claude_code: "Fixture."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 2
    assert_has(r.output, "duplicate-skill-id")
    assert_has(r.output, "skill=demo-dup")



def test_projektion_ausserhalb_der_harness_wurzel_wird_als_projection_outside_harness_root_abgelehnt(
    run_cmd, engine, root
):
    put_skill(root / ".agents/skills", "demo-outside")
    put_skill(root / ".claude/skills", "demo-outside")
    write_registry(root, """  - id: demo-outside
    provenance: project
    exposure: portable
    source: .agents/skills/demo-outside
    harnesses:
      codex: { path: .agents/skills/demo-outside, sync: identical }
      agy:   { path: .agents/skills/demo-outside, sync: identical }
      muse:   { path: .agents/skills/demo-outside, sync: identical }
      opencode: { path: .claude/skills/demo-outside, sync: identical }
    exclusions:
      claude_code: "Fixture."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 2
    assert_has(r.output, "projection-outside-harness-root")
    assert_has(r.output, "skill=demo-outside")
    assert_has(r.output, "harness=opencode")



def test_fehlendes_inventar_wird_als_registry_not_found_mit_exit_2_gemeldet(run_cmd, engine, root):
    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 2
    assert_has(r.output, "registry-not-found")



def test_fehlendes_root_verzeichnis_wird_als_root_not_found_mit_exit_2_gemeldet(run_cmd, engine, root):
    r = run_engine(run_cmd, engine, root.parent / "does-not-exist", "--check")
    assert r.returncode == 2
    assert_has(r.output, "root-not-found")



def test_unbekannte_option_wird_mit_exit_2_abgelehnt(run_cmd, engine, root):
    r = run_engine(run_cmd, engine, root, "--rewrite-everything")
    assert r.returncode == 2
    assert_has(r.output, "unknown-option")



def test_gleichzeitige_angabe_von_check_und_write_wird_mit_exit_2_abgelehnt(run_cmd, engine, root):
    r = run_engine(run_cmd, engine, root, "--check", "--write")
    assert r.returncode == 2
    assert_has(r.output, "mode-conflict")



def test_ohne_modus_flag_ist_der_default_check_only(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-default")
    write_registry(root, """  - id: demo-default
    provenance: project
    exposure: portable
    source: .agents/skills/demo-default
    harnesses:
      codex:       { path: .agents/skills/demo-default,   sync: identical }
      agy:         { path: .agents/skills/demo-default,   sync: identical }
      muse:         { path: .agents/skills/demo-default,   sync: identical }
      opencode:    { path: .opencode/skills/demo-default, sync: identical }
      claude_code: { path: .claude/skills/demo-default,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root)
    assert r.returncode == 1
    assert_has(r.output, "missing-projection")
    assert not (root / ".opencode/skills/demo-default").exists()
    assert not (root / ".claude/skills/demo-default").exists()



def test_ein_eigenes_registry_file_kann_explizit_angegeben_werden(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-custom")
    put_skill(root / ".opencode/skills", "demo-custom")
    put_skill(root / ".claude/skills", "demo-custom")
    write_registry(root, """  - id: demo-custom
    provenance: project
    exposure: portable
    source: .agents/skills/demo-custom
    harnesses:
      codex:       { path: .agents/skills/demo-custom,   sync: identical }
      agy:         { path: .agents/skills/demo-custom,   sync: identical }
      muse:         { path: .agents/skills/demo-custom,   sync: identical }
      opencode:    { path: .opencode/skills/demo-custom, sync: identical }
      claude_code: { path: .claude/skills/demo-custom,   sync: identical }
    exclusions: {}
""")
    (root / REGISTRY_REL).rename(root / "custom-skills.yaml")

    r = run_engine(run_cmd, engine, root, "--registry", str(root / "custom-skills.yaml"), "--check")
    assert r.returncode == 0, r.output



def test_check_erzeugt_keine_projektionen_und_veraendert_das_fixture_nicht(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-noop")
    write_registry(root, """  - id: demo-noop
    provenance: project
    exposure: portable
    source: .agents/skills/demo-noop
    harnesses:
      codex:       { path: .agents/skills/demo-noop,   sync: identical }
      agy:         { path: .agents/skills/demo-noop,   sync: identical }
      muse:         { path: .agents/skills/demo-noop,   sync: identical }
      opencode:    { path: .opencode/skills/demo-noop, sync: identical }
      claude_code: { path: .claude/skills/demo-noop,   sync: identical }
    exclusions: {}
""")
    before = all_files(root)

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "missing-projection")

    assert all_files(root) == before
    assert not (root / ".opencode/skills/demo-noop").exists()
    assert not (root / ".claude/skills/demo-noop").exists()



def test_write_materialisiert_fehlende_identical_projektionen_und_wird_danach_clean(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-write")
    put_extra(root / ".agents/skills", "demo-write", "references/example.md", "gemeinsame Referenz")
    write_registry(root, """  - id: demo-write
    provenance: project
    exposure: portable
    source: .agents/skills/demo-write
    harnesses:
      codex:       { path: .agents/skills/demo-write,   sync: identical }
      agy:         { path: .agents/skills/demo-write,   sync: identical }
      muse:         { path: .agents/skills/demo-write,   sync: identical }
      opencode:    { path: .opencode/skills/demo-write, sync: identical }
      claude_code: { path: .claude/skills/demo-write,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--write", prefix=["env", "-u", "CI"])
    assert r.returncode == 0, r.output
    assert (root / ".opencode/skills/demo-write/SKILL.md").is_file()
    assert (root / ".claude/skills/demo-write/SKILL.md").is_file()
    assert (root / ".opencode/skills/demo-write/references/example.md").is_file()
    assert (root / ".claude/skills/demo-write/references/example.md").is_file()
    source = tree_files(root / ".agents/skills/demo-write")
    assert tree_files(root / ".opencode/skills/demo-write") == source
    assert tree_files(root / ".claude/skills/demo-write") == source

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output



def test_write_ueberschreibt_keine_manual_adapter_und_erzeugt_sie_auch_nicht(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-write-manual")
    put_skill(root / ".opencode/skills", "demo-write-manual", "bestehender OpenCode-Adapter")
    write_registry(root, """  - id: demo-write-manual
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-write-manual
    harnesses:
      codex:    { path: .agents/skills/demo-write-manual,   sync: identical }
      agy:      { path: .agents/skills/demo-write-manual,   sync: identical }
      muse:      { path: .agents/skills/demo-write-manual,   sync: identical }
      opencode:
        path: .opencode/skills/demo-write-manual
        sync: manual
        rationale: "OpenCode-Runtime-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "ticket-mcp-node_add_comment" }
      claude_code:
        path: .claude/skills/demo-write-manual
        sync: manual
        rationale: "Claude-Code-MCP-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "mcp__ticket-mcp-node__add_comment" }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--write", prefix=["env", "-u", "CI"])
    assert r.returncode == 1
    assert_has(r.output, "missing-projection")
    assert_has(r.output, "harness=claude_code")
    assert "bestehender OpenCode-Adapter" in (
        root / ".opencode/skills/demo-write-manual/SKILL.md"
    ).read_text(encoding="utf-8")
    assert not (root / ".claude/skills/demo-write-manual").exists()



def test_write_entfernt_keine_undeklarierten_projektionen(run_cmd, engine, root):
    put_skill(root / ".opencode/skills", "demo-write-native")
    put_skill(root / ".claude/skills", "demo-write-native")
    write_registry(root, """  - id: demo-write-native
    provenance: project
    exposure: native
    source: .opencode/skills/demo-write-native
    harnesses:
      opencode: { path: .opencode/skills/demo-write-native, sync: identical }
    exclusions:
      codex:       "Fixture: nativer OpenCode-Skill."
      agy:         "Fixture: nativer OpenCode-Skill."
      muse:         "Fixture: nativer OpenCode-Skill."
      claude_code: "Fixture: nativer OpenCode-Skill."
""")

    r = run_engine(run_cmd, engine, root, "--write", prefix=["env", "-u", "CI"])
    assert r.returncode == 1
    assert_has(r.output, "unexpected-projection")
    assert (root / ".claude/skills/demo-write-native/SKILL.md").is_file()

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "unexpected-projection")



def test_write_wird_in_ci_verweigert_und_veraendert_nichts(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-ci-write")
    write_registry(root, """  - id: demo-ci-write
    provenance: project
    exposure: portable
    source: .agents/skills/demo-ci-write
    harnesses:
      codex:       { path: .agents/skills/demo-ci-write,   sync: identical }
      agy:         { path: .agents/skills/demo-ci-write,   sync: identical }
      muse:         { path: .agents/skills/demo-ci-write,   sync: identical }
      opencode:    { path: .opencode/skills/demo-ci-write, sync: identical }
      claude_code: { path: .claude/skills/demo-ci-write,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--write", prefix=["env", "CI=true"])
    assert r.returncode == 2
    assert_has(r.output, "write-mode-disabled-in-ci")
    assert not (root / ".opencode/skills/demo-ci-write").exists()
    assert not (root / ".claude/skills/demo-ci-write").exists()



def test_live_das_repo_inventar_ist_schema_frei_und_der_check_erlaubt_nur_dateibefunde(
    run_cmd, engine, repo_root
):
    r = run_engine(run_cmd, engine, repo_root, "--check", "--json")
    assert r.returncode in (0, 1)

    j = json.loads(r.output)
    catalog_size = len(j.get("catalog") or [])
    assert catalog_size > 0

    schema_re = re.compile(
        r"^(registry-not-found|root-not-found|unknown-harness|invalid-exposure|duplicate-skill-id"
        r"|projection-outside-harness-root|adapter-mapping-missing|non-rationalized-exception|invalid-schema)"
    )
    schema_errors = sum(1 for line in json_findings(r.output) if schema_re.search(line))
    assert schema_errors == 0



def test_live_das_inventar_deklariert_genau_die_fuenf_ziel_harnesses(run_cmd, engine, repo_root):
    r = run_engine(run_cmd, engine, repo_root, "--check", "--json")
    assert r.returncode in (0, 1)
    j = json.loads(r.output)
    harness_ids = ",".join(sorted(h.get("id") for h in (j.get("harnesses") or [])))
    assert harness_ids == "agy,claude_code,codex,muse,opencode"



def test_live_jeder_git_getrackte_skill_id_ist_im_inventar_katalogisiert_oder_bewusst_ignoriert(
    run_cmd, engine, repo_root
):
    r = run_engine(run_cmd, engine, repo_root, "--check", "--json")
    assert r.returncode in (0, 1)
    j = json.loads(r.output)
    registry_ids = {c.get("id") for c in (j.get("catalog") or [])}
    registry_ids |= {ig.get("id") for ig in (j.get("ignored") or [])}

    ls = run_cmd(
        [
            "git", "-C", str(repo_root), "ls-files",
            ".agents/skills/*/SKILL.md",
            ".claude/skills/*/SKILL.md",
            ".opencode/skills/*/SKILL.md",
        ]
    )
    tracked = {line.split("/")[-2] for line in ls.stdout.splitlines() if line.strip()}

    # Positiv-Anker: die Suite prueft eine echte, nicht-leere Skill-Menge.
    assert tracked, "tracked-ids leer"
    missing = sorted(tracked - {x for x in registry_ids if x is not None})
    assert missing == [], "\n".join(missing)

