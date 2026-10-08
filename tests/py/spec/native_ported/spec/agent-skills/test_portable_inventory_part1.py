"""Native migration of tests/spec/agent-skills/portable-inventory.bats. (part 1/2)"""
import json
import os
import re
import shutil
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


def count_literal(lines, pattern: str) -> int:
    """grep -c mit BRE-Anker ^ und $ ueber rein literale Muster (| und - sind literal)."""
    start = pattern.startswith("^")
    body = pattern[1:] if start else pattern
    end = body.endswith("$")
    if end:
        body = body[:-1]
    rx = ("^" if start else "") + re.escape(body) + ("$" if end else "")
    return sum(1 for line in lines if re.search(rx, line))


def count_findings(output: str, pattern: str) -> int:
    return count_literal(json_findings(output), pattern)


DEMO_PORTABLE_5 = """  - id: demo-portable
    provenance: project
    exposure: portable
    source: .agents/skills/demo-portable
    harnesses:
      codex:       { path: .agents/skills/demo-portable,   sync: identical }
      agy:         { path: .agents/skills/demo-portable,   sync: identical }
      muse:         { path: .agents/skills/demo-portable,   sync: identical }
      opencode:    { path: .opencode/skills/demo-portable, sync: identical }
      claude_code: { path: .claude/skills/demo-portable,   sync: identical }
    exclusions: {}
"""



def test_positiv_anker_portable_skill_mit_vier_harnesses_und_identischen_projektionen_ist_befangsfrei(
    run_cmd, engine, root
):
    put_skill(root / ".agents/skills", "demo-portable")
    put_skill(root / ".opencode/skills", "demo-portable")
    put_skill(root / ".claude/skills", "demo-portable")
    write_registry(root, DEMO_PORTABLE_5)

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output
    assert_has(r.output, "demo-portable")



def test_p1_red_portable_fuer_vier_harnesses_deklariert_codex_projektion_fehlt_befund_nennt_harness_und_skill_id(
    run_cmd, engine, root
):
    put_skill(root / ".opencode/skills", "demo-portable")
    put_skill(root / ".claude/skills", "demo-portable")
    write_registry(root, DEMO_PORTABLE_5)

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    out = r.output
    # Positiv-Anker: die Engine hat das Fixture ausgewertet.
    assert_has(out, "skill=demo-portable")
    assert_has(out, "missing-projection")
    assert_has(out, "harness=codex")
    assert_has(out, "harness=agy")
    assert_has(out, "harness=muse")
    assert_has(out, "dangling-source")
    # Die vorhandenen Projektionen duerfen nicht faelschlich als fehlend gelten.
    assert_lacks(out, "harness=opencode")
    assert_lacks(out, "harness=claude_code")



def test_p1_red_kernfall_maschinenlesbar_json_modus_liefert_code_skill_harness_pro_befund(
    run_cmd, engine, root
):
    put_skill(root / ".opencode/skills", "demo-portable")
    put_skill(root / ".claude/skills", "demo-portable")
    write_registry(root, DEMO_PORTABLE_5)

    r = run_engine(run_cmd, engine, root, "--check", "--json")
    assert r.returncode == 1
    assert count_findings(r.output, "^missing-projection|demo-portable|codex$") == 1
    assert count_findings(r.output, "^missing-projection|demo-portable|agy$") == 1
    assert count_findings(r.output, "^missing-projection|demo-portable|muse$") == 1
    assert count_findings(r.output, "^dangling-source|demo-portable|-") == 1
    assert count_findings(r.output, "^missing-projection|demo-portable|opencode$") == 0



def test_native_skill_mit_undeklarierter_kopie_in_einem_anderen_harness_wird_als_katalog_drift_gemeldet(
    run_cmd, engine, root
):
    put_skill(root / ".opencode/skills", "demo-native")
    put_skill(root / ".claude/skills", "demo-native")
    write_registry(root, """  - id: demo-native
    provenance: project
    exposure: native
    source: .opencode/skills/demo-native
    harnesses:
      opencode: { path: .opencode/skills/demo-native, sync: identical }
    exclusions:
      codex:       "OpenCode-nativer Runbook-Skill: kein portabler Kern, keine Codex-Sicht."
      agy:         "OpenCode-nativer Runbook-Skill: agy konsumiert die OpenCode-Lane nicht."
      muse:         "OpenCode-nativer Runbook-Skill: muse konsumiert die OpenCode-Lane nicht."
      claude_code: "OpenCode-nativer Runbook-Skill: keine Claude-Variante vorgesehen."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "skill=demo-native")
    assert_has(r.output, "unexpected-projection")
    assert_has(r.output, "harness=claude_code")
    # Positiv-Anker: die deklarierte OpenCode-Sicht ist in Ordnung.
    assert_lacks(r.output, "missing-projection")



def test_skill_verzeichnis_ohne_inventar_eintrag_wird_als_unregistered_skill_gemeldet(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-known")
    put_skill(root / ".opencode/skills", "demo-known")
    put_skill(root / ".claude/skills", "demo-known")
    put_skill(root / ".opencode/skills", "demo-ghost")
    write_registry(root, """  - id: demo-known
    provenance: project
    exposure: portable
    source: .agents/skills/demo-known
    harnesses:
      codex:       { path: .agents/skills/demo-known,   sync: identical }
      agy:         { path: .agents/skills/demo-known,   sync: identical }
      muse:         { path: .agents/skills/demo-known,   sync: identical }
      opencode:    { path: .opencode/skills/demo-known, sync: identical }
      claude_code: { path: .claude/skills/demo-known,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "unregistered-skill")
    assert_has(r.output, "skill=demo-ghost")
    assert_has(r.output, "harness=opencode")
    # Positiv-Anker: der registrierte Skill bleibt ohne Befund.
    assert_lacks(r.output, "skill=demo-known")



def test_lokal_installierte_skills_aus_der_inventar_ignore_liste_bleiben_ohne_befund(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-registered")
    put_skill(root / ".opencode/skills", "demo-registered")
    put_skill(root / ".claude/skills", "demo-registered")
    put_skill(root / ".opencode/skills", "demo-local-only")
    (root / REGISTRY_REL).write_text(
        "schema_version: 1\n"
        "harnesses:\n"
        "  codex:\n    discovery_root: .agents/skills\n"
        "  agy:\n    discovery_root: .agents/skills\n"
        "  opencode:\n    discovery_root: .opencode/skills\n"
        "  claude_code:\n    discovery_root: .claude/skills\n"
        "  muse:\n    discovery_root: .agents/skills\n"
        "ignore:\n"
        "  - id: demo-local-only\n"
        '    rationale: "Lokal via market-cli installiert, nicht getrackt (T001783)."\n'
        "skills:\n"
        "  - id: demo-registered\n"
        "    provenance: project\n"
        "    exposure: portable\n"
        "    source: .agents/skills/demo-registered\n"
        "    harnesses:\n"
        "      codex:       { path: .agents/skills/demo-registered,   sync: identical }\n"
        "      agy:         { path: .agents/skills/demo-registered,   sync: identical }\n"
        "      opencode:    { path: .opencode/skills/demo-registered, sync: identical }\n"
        "      claude_code: { path: .claude/skills/demo-registered,   sync: identical }\n"
        "      muse:        { path: .agents/skills/demo-registered,   sync: identical }\n"
        "    exclusions: {}\n",
        encoding="utf-8",
    )

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output
    assert_lacks(r.output, "demo-local-only")



def test_fehlende_kanonische_quelle_wird_als_dangling_source_gemeldet(run_cmd, engine, root):
    put_skill(root / ".opencode/skills", "demo-lost")
    write_registry(root, """  - id: demo-lost
    provenance: project
    exposure: native
    source: .opencode/skills/demo-lost-missing
    harnesses:
      opencode: { path: .opencode/skills/demo-lost, sync: identical }
    exclusions:
      codex:       "Fixture: Quelle fehlt absichtlich."
      agy:         "Fixture: Quelle fehlt absichtlich."
      muse:         "Fixture: Quelle fehlt absichtlich."
      claude_code: "Fixture: Quelle fehlt absichtlich."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "dangling-source")
    assert_has(r.output, "skill=demo-lost")



def test_harness_ausschluss_ohne_begruendung_wird_als_non_rationalized_exception_gemeldet(run_cmd, engine, root):
    put_skill(root / ".opencode/skills", "demo-silent")
    write_registry(root, """  - id: demo-silent
    provenance: project
    exposure: native
    source: .opencode/skills/demo-silent
    harnesses:
      opencode: { path: .opencode/skills/demo-silent, sync: identical }
    exclusions:
      codex:       "Begruendet."
      agy:         ""
      muse:        "Begruendet."
      claude_code: "Begruendet."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "non-rationalized-exception")
    assert_has(r.output, "harness=agy")
    # Positiv-Anker: die begruendeten Ausschluesse sind unauffaellig.
    assert_lacks(r.output, "harness=codex")
    assert_lacks(r.output, "harness=claude_code")
    assert_lacks(r.output, "harness=muse")



def test_sync_manual_ohne_begruendung_wird_als_non_rationalized_exception_gemeldet(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-manual")
    put_skill(root / ".opencode/skills", "demo-manual")
    write_registry(root, """  - id: demo-manual
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-manual
    harnesses:
      codex:    { path: .agents/skills/demo-manual,   sync: identical }
      agy:      { path: .agents/skills/demo-manual,   sync: identical }
      muse:      { path: .agents/skills/demo-manual,   sync: identical }
      opencode: { path: .opencode/skills/demo-manual, sync: manual }
    exclusions:
      claude_code: "Fixture: nur OpenCode-Adapter."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "non-rationalized-exception")
    assert_has(r.output, "harness=opencode")



def test_adapter_projektion_ohne_deklariertes_mapping_wird_als_adapter_mapping_missing_gemeldet(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-adapter")
    put_skill(root / ".opencode/skills", "demo-adapter", "opencode adapter body")
    write_registry(root, """  - id: demo-adapter
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-adapter
    harnesses:
      codex:    { path: .agents/skills/demo-adapter,   sync: identical }
      agy:      { path: .agents/skills/demo-adapter,   sync: identical }
      muse:      { path: .agents/skills/demo-adapter,   sync: identical }
      opencode:
        path: .opencode/skills/demo-adapter
        sync: manual
        rationale: "OpenCode-Runtime-Identifier weicht ab."
    exclusions:
      claude_code: "Fixture: nur OpenCode-Adapter."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "adapter-mapping-missing")
    assert_has(r.output, "skill=demo-adapter")



def test_adapter_projektion_mit_deklariertem_mapping_besteht_die_pruefung_trotz_abweichendem_inhalt(
    run_cmd, engine, root
):
    put_skill(root / ".agents/skills", "demo-adapter")
    put_skill(root / ".opencode/skills", "demo-adapter", "opencode adapter body")
    put_skill(root / ".claude/skills", "demo-adapter", "claude adapter body")
    write_registry(root, """  - id: demo-adapter
    provenance: project
    exposure: adapter
    source: .agents/skills/demo-adapter
    harnesses:
      codex:    { path: .agents/skills/demo-adapter,   sync: identical }
      agy:      { path: .agents/skills/demo-adapter,   sync: identical }
      muse:      { path: .agents/skills/demo-adapter,   sync: identical }
      opencode:
        path: .opencode/skills/demo-adapter
        sync: manual
        rationale: "OpenCode-Runtime-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "ticket-mcp-node_add_comment" }
      claude_code:
        path: .claude/skills/demo-adapter
        sync: manual
        rationale: "Claude-Code-MCP-Identifier weicht ab."
        maps:
          - { capability: ticket-comment, runtime_tool: "mcp__ticket-mcp-node__add_comment" }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output
    assert_lacks(r.output, "body-drift")



def test_identical_projektion_mit_abweichender_skill_md_wird_als_body_drift_gemeldet(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-drift")
    put_skill(root / ".opencode/skills", "demo-drift", "geaenderter OpenCode-Inhalt")
    put_skill(root / ".claude/skills", "demo-drift")
    write_registry(root, """  - id: demo-drift
    provenance: project
    exposure: portable
    source: .agents/skills/demo-drift
    harnesses:
      codex:       { path: .agents/skills/demo-drift,   sync: identical }
      agy:         { path: .agents/skills/demo-drift,   sync: identical }
      muse:         { path: .agents/skills/demo-drift,   sync: identical }
      opencode:    { path: .opencode/skills/demo-drift, sync: identical }
      claude_code: { path: .claude/skills/demo-drift,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "body-drift")
    assert_has(r.output, "skill=demo-drift")
    assert_has(r.output, "harness=opencode")
    # Positiv-Anker: die identische Claude-Projektion bleibt ohne Drift-Befund.
    assert_lacks(r.output, "harness=claude_code")



def test_identical_projektion_mit_fehlender_zusaetzdatei_wird_als_body_drift_gemeldet(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-files")
    put_extra(root / ".agents/skills", "demo-files", "references/example.md", "gemeinsame Referenz")
    put_skill(root / ".opencode/skills", "demo-files")
    write_registry(root, """  - id: demo-files
    provenance: project
    exposure: portable
    source: .agents/skills/demo-files
    harnesses:
      codex:    { path: .agents/skills/demo-files,   sync: identical }
      agy:      { path: .agents/skills/demo-files,   sync: identical }
      muse:      { path: .agents/skills/demo-files,   sync: identical }
      opencode: { path: .opencode/skills/demo-files, sync: identical }
    exclusions:
      claude_code: "Fixture: kein Claude-Harness deklariert."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "body-drift")
    assert_has(r.output, "harness=opencode")



def test_identical_projektion_mit_unerklaerter_zusaetzdatei_wird_als_body_drift_gemeldet(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-extra")
    put_skill(root / ".opencode/skills", "demo-extra")
    put_extra(root / ".opencode/skills", "demo-extra", "local-note.md", "nur OpenCode")
    write_registry(root, """  - id: demo-extra
    provenance: project
    exposure: portable
    source: .agents/skills/demo-extra
    harnesses:
      codex:    { path: .agents/skills/demo-extra,   sync: identical }
      agy:      { path: .agents/skills/demo-extra,   sync: identical }
      muse:      { path: .agents/skills/demo-extra,   sync: identical }
      opencode: { path: .opencode/skills/demo-extra, sync: identical }
    exclusions:
      claude_code: "Fixture: kein Claude-Harness deklariert."
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 1
    assert_has(r.output, "body-drift")
    assert_has(r.output, "harness=opencode")



def test_mehrdatei_identische_projektionen_bestehen_die_hash_paritaet(run_cmd, engine, root):
    for base in (".agents/skills", ".opencode/skills", ".claude/skills"):
        put_skill(root / base, "demo-multi")
        put_extra(root / base, "demo-multi", "references/example.md", "gemeinsame Referenz")
    write_registry(root, """  - id: demo-multi
    provenance: project
    exposure: portable
    source: .agents/skills/demo-multi
    harnesses:
      codex:       { path: .agents/skills/demo-multi,   sync: identical }
      agy:         { path: .agents/skills/demo-multi,   sync: identical }
      muse:         { path: .agents/skills/demo-multi,   sync: identical }
      opencode:    { path: .opencode/skills/demo-multi, sync: identical }
      claude_code: { path: .claude/skills/demo-multi,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output



def test_generierte_projektions_metadaten_brechen_die_identitaetspruefung_nicht(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-meta")
    put_skill(root / ".opencode/skills", "demo-meta")
    put_skill(root / ".claude/skills", "demo-meta")
    (root / ".opencode/skills/demo-meta/.agent-skill-projection.json").write_text(
        '{"generatedBy":"scripts/agent-skills/project.mjs"}\n', encoding="utf-8"
    )
    write_registry(root, """  - id: demo-meta
    provenance: project
    exposure: portable
    source: .agents/skills/demo-meta
    harnesses:
      codex:       { path: .agents/skills/demo-meta,   sync: identical }
      agy:         { path: .agents/skills/demo-meta,   sync: identical }
      muse:         { path: .agents/skills/demo-meta,   sync: identical }
      opencode:    { path: .opencode/skills/demo-meta, sync: identical }
      claude_code: { path: .claude/skills/demo-meta,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output



def test_symlinked_harness_root_wird_gemeldet_obwohl_er_auf_dieser_plattform_aufloest(run_cmd, engine, root):
    put_skill(root / ".agents/skills", "demo-symroot")
    put_skill(root / ".claude/skills", "demo-symroot")
    shutil.rmtree(root / ".opencode/skills")
    os.symlink("../.claude/skills", root / ".opencode/skills")
    write_registry(root, """  - id: demo-symroot
    provenance: project
    exposure: portable
    source: .agents/skills/demo-symroot
    harnesses:
      codex:       { path: .agents/skills/demo-symroot,   sync: identical }
      agy:         { path: .agents/skills/demo-symroot,   sync: identical }
      muse:         { path: .agents/skills/demo-symroot,   sync: identical }
      opencode:    { path: .opencode/skills/demo-symroot, sync: identical }
      claude_code: { path: .claude/skills/demo-symroot,   sync: identical }
    exclusions: {}
""")

    r = run_engine(run_cmd, engine, root, "--check")
    assert r.returncode == 0, r.output
    assert_has(r.output, "symlinked-harness-root")
    assert_has(r.output, "harness=opencode")
    # Positiv-Anker: die Projektion selbst wird nicht zusaetzlich als fehlend gemeldet.
    assert_lacks(r.output, "missing-projection")

