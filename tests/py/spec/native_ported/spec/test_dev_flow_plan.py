"""Native migration of tests/spec/dev-flow-plan.bats."""
import glob
import json
import os
import re
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

# The worktree-guard fixtures create directories under <repo>/.worktrees/ and
# the main checkout's .worktrees/; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("dev-flow-plan-worktrees")


# ── helpers ───────────────────────────────────────────────────────────────


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _lines(path: Path):
    return _read(path).splitlines()


def _jtype(value) -> str:
    """jq 'type' equivalent."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    return "object"


def _main_root(repo: Path) -> Path:
    """Main checkout root: parent of the shared git dir."""
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "--git-common-dir"],
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )
    common = Path(result.stdout.strip())
    if not common.is_absolute():
        common = repo / common
    return common.resolve().parent


def _wg_guard(repo: Path) -> str:
    return str(repo / "scripts" / "hooks" / "worktree-write-guard.sh")


def _wg_lock(lockdir: Path, name: str, owner_sid: str, worktree: str) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lock = {
        "scope": "branch",
        "id": "probe",
        "owner_sid": owner_sid,
        "owner_pid": os.getpid(),
        "label": "probe",
        "branch": "probe",
        "worktree": worktree,
        "created_at": now,
        "heartbeat_at": now,
    }
    (lockdir / f"{name}.json").write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")


def _wg_run(run_cmd, repo: Path, lockdir: Path, sid: str, target: str, extra_env=None):
    """Feed a Write/Edit payload for `target` to the worktree write guard."""
    env = {"AGENT_LOCK_DIR": str(lockdir), "CLAUDE_CODE_SESSION_ID": sid}
    if extra_env:
        env.update(extra_env)
    payload = json.dumps({"tool_input": {"file_path": target}}, separators=(",", ":"))
    script = (
        f"cd {shlex.quote(str(repo))} && printf '%s' {shlex.quote(payload)} | "
        f"bash {shlex.quote(_wg_guard(repo))}"
    )
    return run_cmd(["bash", "-c", script], env=env, timeout=60)


def _cleanup_fixture_dirs(repo: Path) -> None:
    """rmdir empty guard fixture dirs (never removes populated worktrees)."""
    main_root = _main_root(repo)
    patterns = [
        str(repo / ".worktrees" / "t002375-p2-*"),
        str(repo / ".worktrees" / "t002412-*"),
        str(main_root / ".worktrees" / "t002375-p2-*"),
        str(main_root / ".worktrees" / "t002412-*"),
    ]
    for pattern in patterns:
        for candidate in glob.glob(pattern):
            if os.path.isdir(candidate):
                try:
                    os.rmdir(candidate)
                except OSError:
                    pass


@pytest.fixture
def paths(repo_root):
    repo = repo_root
    return {
        "repo": repo,
        "schema": repo / ".claude/skills/references/schemas/plan-intel-bundle.schema.json",
        "dts": repo / ".claude/skills/references/schemas/plan-intel-bundle.d.ts",
        "example": repo / ".claude/skills/references/schemas/plan-intel-bundle.example.json",
        "plan_skill": repo / ".agents/skills/dev-flow-plan/SKILL.md",
        "exec_skill": repo / ".agents/skills/dev-flow-execute/SKILL.md",
    }


@pytest.fixture(autouse=True)
def _worktree_fixture_cleanup(repo_root):
    yield
    _cleanup_fixture_dirs(repo_root)


# ── (1) schema is valid JSON declaring draft 2020-12 + required sections ──


def test_pib_schema_file_is_valid_json(paths):
    assert paths["schema"].is_file(), f"MISSING schema: {paths['schema']}"
    json.loads(_read(paths["schema"]))


def test_pib_schema_declares_json_schema_draft_2020_12(paths):
    assert "2020-12" in _read(paths["schema"])


def test_pib_schema_marks_meta_impact_files_symbols_required(paths):
    required = json.loads(_read(paths["schema"]))["required"]
    assert "meta" in required and "impact_files" in required and "symbols" in required


def test_pib_schema_declares_all_eight_top_level_sections(paths):
    properties = json.loads(_read(paths["schema"]))["properties"]
    for section in (
        "meta",
        "impact_files",
        "symbols",
        "call_graph",
        "db_tables",
        "api_contracts",
        "external_types",
        "risks",
    ):
        assert section in properties, f"MISSING schema section: {section}"


# ── (2) fixture conforms: required top-level keys + element required fields ──


def test_pib_example_json_is_valid_json_with_required_top_level_keys(paths):
    assert paths["example"].is_file(), f"MISSING example: {paths['example']}"
    data = json.loads(_read(paths["example"]))
    for key in ("meta", "impact_files", "symbols"):
        assert key in data, f"MISSING top-level key: {key}"


def test_pib_example_json_meta_slug_and_ticket_id_are_strings(paths):
    data = json.loads(_read(paths["example"]))
    assert _jtype(data.get("meta", {}).get("slug")) == "string"
    assert _jtype(data.get("meta", {}).get("ticket_id")) == "string"


def test_pib_example_json_impact_files_is_non_empty_array_with_required_element_fields(paths):
    data = json.loads(_read(paths["example"]))
    impact = data.get("impact_files")
    assert _jtype(impact) == "array"
    assert len(impact) > 0
    required = ("path", "language", "loc", "s1_limit", "s1_baseline", "s1_budget")
    assert all(all(key in item for key in required) for item in impact)


def test_pib_example_json_symbols_is_non_empty_array_with_required_element_fields(paths):
    data = json.loads(_read(paths["example"]))
    symbols = data.get("symbols")
    assert _jtype(symbols) == "array"
    assert len(symbols) > 0
    required = ("qualified_name", "kind", "file", "signature", "type_text", "source")
    assert all(all(key in item for key in required) for item in symbols)


# ── (3) schema <-> .d.ts top-level key parity (cheap drift guard) ──


def test_pib_schema_and_dts_top_level_keys_are_in_parity(paths):
    assert paths["dts"].is_file(), f"MISSING .d.ts: {paths['dts']}"
    schema_keys = sorted(json.loads(_read(paths["schema"]))["properties"].keys())

    # awk: lines strictly between 'export interface PlanIntelBundle {' and the closing '}'
    body = []
    inside = False
    for line in _lines(paths["dts"]):
        if re.match(r"^export interface PlanIntelBundle \{", line):
            inside = True
            continue
        if inside and re.match(r"^\}", line):
            inside = False
        if inside:
            body.append(line)
    dts_keys = []
    for line in body:
        match = re.match(r"^[ \t]+([a-zA-Z_]+)\??:", line)
        if match:
            dts_keys.append(match.group(1))
    dts_keys = sorted(dts_keys)
    assert schema_keys == dts_keys, f"DRIFT: schema={schema_keys} dts={dts_keys}"


# ── (4) dev-flow-plan wiring: Intel-Gathering step + intel.json + four sources ──


def test_pib_dev_flow_plan_skill_md_adds_the_intel_gathering_step(paths):
    assert re.search(r"A\.1\.5|Intel-Gathering|Plan Intel Bundle", _read(paths["plan_skill"]))


def test_pib_dev_flow_plan_skill_md_references_intel_json(paths):
    assert "intel.json" in _read(paths["plan_skill"])


def test_pib_dev_flow_plan_skill_md_names_the_four_intel_sources(paths):
    text = _read(paths["plan_skill"])
    assert "codebase-memory" in text, "MISSING codebase-memory"
    assert "mcp-postgres" in text, "MISSING mcp-postgres"
    assert "context7" in text, "MISSING context7"
    assert re.search(r"\bLSP\b", text), "MISSING LSP"


# ── (5) dev-flow-execute wiring: Step 2 references intel.json ──


def test_pib_dev_flow_execute_skill_md_step_2_references_intel_json(paths):
    block = []
    capturing = False
    for line in _lines(paths["exec_skill"]):
        if re.match(r"^## Schritt 2:", line):
            capturing = True
            block.append(line)
            continue
        if capturing and line.startswith("## "):
            break
        if capturing:
            block.append(line)
    assert any("intel.json" in line for line in block), (
        "MISSING intel.json in dev-flow-execute Step 2 block"
    )


# ── T002137: Alt-Worktrees nach T002135 — cleanup documented ──


def test_mishap_t002137_gotchas_footguns_md_enthaelt_alt_worktrees_abschnitt(repo_root):
    footguns = _read(repo_root / "docs/superpowers/references/gotchas-footguns.md")
    assert "Alt-Worktrees nach T002135" in footguns, (
        "MISSING section title: Alt-Worktrees nach T002135"
    )
    assert r".git/worktrees/<name>/modules" in footguns, (
        "MISSING path pattern: .git/worktrees/<name>/modules"
    )


# ── Migrated from superpowers-writing-plans.bats (T002302) ──────────────


def test_dev_flow_plan_skill_md_exists(repo_root):
    assert (repo_root / ".claude/skills/dev-flow-plan/SKILL.md").is_file()


def test_dev_flow_plan_mentions_plan_lint_rules(repo_root):
    assert "plan-lint" in _read(repo_root / ".claude/skills/dev-flow-plan/SKILL.md")


def test_dev_flow_plan_references_step_3_7(repo_root):
    # BRE pattern in the original: '.' matches any character.
    assert re.search("3.7", _read(repo_root / ".claude/skills/dev-flow-plan/SKILL.md"))


def test_dev_flow_plan_mentions_frontmatter_keys(repo_root):
    assert "frontmatter" in _read(repo_root / ".claude/skills/dev-flow-plan/SKILL.md")


def test_t002272_m1_stage_plan_accepts_hold(repo_root):
    assert "--hold" in _read(repo_root / "scripts/vda/ticket/stage-plan.sh")


def test_t002272_m1_ticket_sh_has_a_release_hold_subcommand(repo_root):
    count = sum(
        1 for line in _lines(repo_root / "scripts/ticket.sh") if re.search(r"^  release-hold\)", line)
    )
    assert count != 0


def test_t002272_m1_dev_flow_plan_skill_md_and_ticket_stage_procedure_md_reference_stage_plan_hold(
    repo_root,
):
    files = [
        repo_root / ".claude/skills/dev-flow-plan/SKILL.md",
        repo_root / ".claude/skills/references/ticket-stage-procedure.md",
    ]
    assert any(
        re.search(r"stage-plan.*--hold", line) for path in files for line in _lines(path)
    )


def test_t002272_m1_dev_flow_execute_skill_md_calls_release_hold(repo_root):
    assert "release-hold" in _read(repo_root / ".agents/skills/dev-flow-execute/SKILL.md")


# ── [T002375-p2] Worktree-Schreibschutz als blockierender PreToolUse-Hook ──


def test_t002375_p2_der_guard_existiert_und_ist_ausfuehrbar(repo_root):
    # Positiv-Anker fuer alle Negativtests unten: fehlt das Skript, passiert dort
    # gar nichts und sie bestuenden vakuos.
    guard = _wg_guard(repo_root)
    assert os.path.isfile(guard), "scripts/hooks/worktree-write-guard.sh fehlt"
    assert os.access(guard, os.X_OK), "Guard ist nicht ausfuehrbar"


def test_t002375_p2_schreiben_ausserhalb_des_eigenen_worktrees_wird_abgelehnt(
    repo_root, run_cmd, tmp_path
):
    lockdir = tmp_path / "locks-a"
    lockdir.mkdir()
    # Der Worktree muss UNTER dem Repo-Root liegen (.worktrees/<slug>).
    mywt = repo_root / ".worktrees" / "t002375-p2-mine"
    mywt.mkdir(parents=True, exist_ok=True)
    _wg_lock(lockdir, "branch__probe", "sid-mine", str(mywt))

    # Positiv-Anker: innerhalb des eigenen Worktrees MUSS es durchgehen.
    result = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(mywt / "datei.txt"))
    assert result.returncode == 0, f"eigener Worktree wurde faelschlich abgelehnt: {result.output}"

    # Der eigentliche Fall: Hauptcheckout statt eigenem Worktree.
    result = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(repo_root / "scripts/irgendwas.sh"))
    assert result.returncode != 0, "Schreibzugriff ausserhalb des Worktrees wurde NICHT abgelehnt"
    assert str(mywt) in result.output, f"Meldung nennt den eigenen Worktree nicht: {result.output}"
    assert "WORKTREE_GUARD_BYPASS" in result.output, (
        f"Meldung nennt den Notausgang nicht: {result.output}"
    )


def test_t002375_p2_ein_fremder_lebender_claim_schuetzt_seinen_worktree(repo_root, run_cmd, tmp_path):
    lockdir = tmp_path / "locks-b"
    lockdir.mkdir()
    otherwt = repo_root / ".worktrees" / "t002375-p2-fremd"
    _wg_lock(lockdir, "branch__fremd", "sid-other", str(otherwt))

    # Positiv-Anker: ohne eigenen Claim bleibt alles ausserhalb des fremden erlaubt.
    result = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(repo_root / "scripts/irgendwas.sh"))
    assert result.returncode == 0, f"ohne Claim wurde faelschlich abgelehnt: {result.output}"

    result = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(otherwt / "design.md"))
    assert result.returncode != 0, "Schreiben in fremden geclaimten Worktree wurde NICHT abgelehnt"
    assert "sid-other" in result.output, f"Meldung nennt die besitzende Session nicht: {result.output}"


def test_t002375_p2_pfade_ausserhalb_des_repos_sind_nicht_sache_des_guards(repo_root, run_cmd, tmp_path):
    lockdir = tmp_path / "locks-c"
    lockdir.mkdir()
    _wg_lock(lockdir, "branch__probe", "sid-mine", str(repo_root / ".worktrees" / "t002375-p2-mine"))
    # /etc/hosts liegt ausserhalb des Repo-Roots — der Guard ist keine allgemeine
    # Dateisystem-Policy und muss durchlassen.
    result = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", "/etc/hosts")
    assert result.returncode == 0, f"Pfad ausserhalb des Repos wurde abgelehnt: {result.output}"


def test_t002375_p2_worktree_guard_bypass_1_laesst_den_schreibzugriff_durch(repo_root, run_cmd, tmp_path):
    lockdir = tmp_path / "locks-d"
    lockdir.mkdir()
    mywt = repo_root / ".worktrees" / "t002375-p2-mine"
    mywt.mkdir(parents=True, exist_ok=True)
    _wg_lock(lockdir, "branch__probe", "sid-mine", str(mywt))

    # Positiv-Anker: ohne Bypass wird derselbe Aufruf abgelehnt.
    target = str(repo_root / "scripts/irgendwas.sh")
    result = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", target)
    assert result.returncode != 0, "Vorbedingung: der Zugriff haette abgelehnt werden muessen"

    result = _wg_run(
        run_cmd, repo_root, lockdir, "sid-mine", target, extra_env={"WORKTREE_GUARD_BYPASS": "1"}
    )
    assert result.returncode == 0, f"Bypass wirkt nicht: {result.output}"


def test_t002375_p2_der_guard_ist_in_claude_settings_json_auf_die_schreib_tools_registriert(repo_root):
    settings = json.loads(_read(repo_root / ".claude" / "settings.json"))
    pre = settings.get("hooks", {}).get("PreToolUse", [])
    hits = [hook for hook in pre if "worktree-write-guard" in json.dumps(hook)]
    assert hits, "kein PreToolUse-Eintrag fuer worktree-write-guard"
    matcher = hits[0].get("matcher", "")
    for tool in ("Write", "Edit"):
        assert tool in matcher, f"{tool} fehlt im matcher: {matcher}"


def test_t002412_ein_relativ_gespeicherter_worktree_pfad_wird_gegen_den_repo_root_aufgeloest(
    repo_root, run_cmd, tmp_path
):
    lockdir = tmp_path / "locks-t002412-rel"
    lockdir.mkdir()
    # Bezugspunkt ist der MAIN-Checkout, nicht der aktuelle Worktree.
    main_root = _main_root(repo_root)
    mywt = main_root / ".worktrees" / "t002412-relativ"
    mywt.mkdir(parents=True, exist_ok=True)
    _wg_lock(lockdir, "branch__probe", "sid-mine", ".worktrees/t002412-relativ")  # RELATIV

    # Der eigentliche Fall: im eigenen Worktree muss geschrieben werden duerfen.
    inner = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(mywt / "datei.txt"))
    # Positiv-Anker gegen ein vakuoses Bestehen: der Guard muss ueberhaupt noch blocken.
    outer = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(main_root / "scripts/irgendwas.sh"))

    assert inner.returncode == 0, (
        f"relativ gespeicherter eigener Worktree wurde abgelehnt: {inner.output}"
    )
    assert outer.returncode != 0, (
        f"Guard blockt gar nicht mehr — Normalisierung wirkungslos: {outer.output}"
    )


def test_t002412_alle_eigenen_claims_werden_geehrt_nicht_nur_der_erste(repo_root, run_cmd, tmp_path):
    lockdir = tmp_path / "locks-t002412-multi"
    lockdir.mkdir()
    wt_a = repo_root / ".worktrees" / "t002412-aaa"
    wt_b = repo_root / ".worktrees" / "t002412-zzz"
    wt_a.mkdir(parents=True, exist_ok=True)
    wt_b.mkdir(parents=True, exist_ok=True)
    _wg_lock(lockdir, "ticket__aaa", "sid-mine", str(wt_a))
    _wg_lock(lockdir, "ticket__zzz", "sid-mine", str(wt_b))

    # Beide muessen durchgehen — der zweite ist der, den die alte Logik verlor.
    first = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(wt_a / "x.txt"))
    assert first.returncode == 0, f"erster eigener Worktree abgelehnt: {first.output}"
    second = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(wt_b / "x.txt"))
    assert second.returncode == 0, f"ZWEITER eigener Worktree abgelehnt (der alte Bug): {second.output}"

    # Positiv-Anker: ausserhalb beider wird weiterhin abgelehnt, und die Meldung nennt beide.
    outside = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(repo_root / "scripts/irgendwas.sh"))
    assert outside.returncode != 0, "ausserhalb beider Worktrees wurde NICHT abgelehnt"
    assert str(wt_a) in outside.output and str(wt_b) in outside.output, (
        f"Meldung nennt nicht beide eigenen Worktrees: {outside.output}"
    )


def test_t002412_ein_eigener_claim_auf_einen_geloeschten_worktree_laehmt_die_session_nicht(
    repo_root, run_cmd, tmp_path
):
    lockdir = tmp_path / "locks-t002412-dead"
    lockdir.mkdir()
    lebend = repo_root / ".worktrees" / "t002412-lebend"
    lebend.mkdir(parents=True, exist_ok=True)

    # Positiv-Anker zuerst: mit einem LEBENDEN eigenen Claim blockt der Guard.
    _wg_lock(lockdir, "ticket__lebend", "sid-mine", str(lebend))
    blocked = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(repo_root / "scripts/irgendwas.sh"))
    assert blocked.returncode != 0, "Vorbedingung: lebender Claim haette blocken muessen"

    # Jetzt derselbe Aufbau, aber der geclaimte Worktree existiert nicht.
    lockdir2 = tmp_path / "locks-t002412-dead2"
    lockdir2.mkdir()
    _wg_lock(lockdir2, "ticket__tot", "sid-mine", str(repo_root / ".worktrees" / "t002412-nie-angelegt"))
    result = _wg_run(run_cmd, repo_root, lockdir2, "sid-mine", str(repo_root / "scripts/irgendwas.sh"))
    assert result.returncode == 0, f"toter eigener Claim sperrt die Session aus: {result.output}"


def test_t002412_ein_fremder_claim_schuetzt_seinen_worktree_auch_ohne_existierendes_verzeichnis(
    repo_root, run_cmd, tmp_path
):
    lockdir = tmp_path / "locks-t002412-foreign"
    lockdir.mkdir()
    fremdwt = repo_root / ".worktrees" / "t002412-fremd-ohne-dir"
    _wg_lock(lockdir, "ticket__fremd", "sid-other", str(fremdwt))

    # Positiv-Anker: ausserhalb des fremden Worktrees bleibt alles erlaubt.
    free = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(repo_root / "scripts/irgendwas.sh"))
    assert free.returncode == 0, f"ohne eigenen Claim faelschlich abgelehnt: {free.output}"

    result = _wg_run(run_cmd, repo_root, lockdir, "sid-mine", str(fremdwt / "design.md"))
    assert result.returncode != 0, f"fremder Claim ohne Verzeichnis schuetzt nicht mehr: {result.output}"


def test_t002412_agent_lock_sh_speichert_worktree_absolut(repo_root, run_cmd, tmp_path):
    lockdir = tmp_path / "locks-t002412-abs"
    lockdir.mkdir()
    script = (
        f"cd {shlex.quote(str(repo_root))} && bash scripts/agent-lock.sh claim ticket T999412 "
        "--label probe --worktree .worktrees/t002412-abs --branch chore/probe"
    )
    result = run_cmd(["bash", "-c", script], env={"AGENT_LOCK_DIR": str(lockdir)}, timeout=300)
    assert result.returncode == 0, f"claim fehlgeschlagen: {result.output}"

    lockfile = lockdir / "ticket__T999412.json"
    assert lockfile.is_file(), f"Lock-Datei fehlt: {lockfile}"
    wt = ""
    for line in _lines(lockfile):
        match = re.match(r'.*"worktree": *"([^"]*)".*', line)
        if match:
            wt = match.group(1)
            break

    # Positiv-Anker: das Feld ist ueberhaupt gefuellt (sonst bestuende die Negativ-Aussage vakuos).
    assert wt, "worktree-Feld ist leer"
    assert wt.startswith("/"), f"worktree wurde relativ gespeichert: {wt}"


def test_t002412_worktree_create_sh_setzt_einen_anker_commit_nur_auf_neuen_branches(repo_root):
    # Ein frischer Branch hat null Commits ueber seiner Basis; der Anker macht ihn sichtbar.
    script = repo_root / "scripts" / "worktree-create.sh"
    assert script.is_file(), "worktree-create.sh fehlt"

    # Positiv-Anker: die Verzweigung auf BRANCH_EXISTS existiert ueberhaupt.
    text = _read(script)
    assert "BRANCH_EXISTS" in text, "BRANCH_EXISTS-Verzweigung fehlt"
    assert "--allow-empty" in text, "kein Anker-Commit im Skript"

    # Der Anker-Commit darf NUR im else-Zweig (neuer Branch) stehen.
    ln_existing = next(
        (n for n, line in enumerate(_lines(script), start=1) if "ready on existing branch" in line),
        0,
    )
    ln_anchor = next(
        (n for n, line in enumerate(_lines(script), start=1) if "--allow-empty" in line),
        0,
    )
    assert ln_existing and ln_anchor, (
        f"Ankerzeilen nicht gefunden (existing={ln_existing} anchor={ln_anchor})"
    )
    assert ln_anchor > ln_existing, (
        f"Anker-Commit steht nicht im else-Zweig: anchor={ln_anchor} existing={ln_existing}"
    )
