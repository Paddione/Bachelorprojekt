"""Native migration of tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats."""
# T002515: plan-intel.sh must not append duplicate risks[] entries on every run.
# PRUEFMODUS: output verification [T002448-M4]. Each test RUNS scripts/plan-intel.sh against
# a dedicated sandbox slug and checks the generated intel.json. The generator reads its merge
# state from $CHANGE_DIR/intel.json, so the sandbox must live in .agents/plans/ of the repo;

# it is removed after each test.

import filecmp
import json
import shutil

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")

SLUG = "_t002515-risks-dedupe-fixture"


@pytest.fixture
def ctx(repo_root, tmp_path, run_cmd):
    change_dir = repo_root / ".agents" / "plans" / SLUG
    shutil.rmtree(change_dir, ignore_errors=True)
    change_dir.mkdir(parents=True)
    intel = change_dir / "intel.json"
    script = repo_root / "scripts" / "plan-intel.sh"

    def gen(*extra: str):
        return run_cmd(["bash", str(script), SLUG, *extra], cwd=repo_root)

    def default_gen():
        return gen("--target-files", "scripts/plan-intel.sh")

    try:
        yield {"intel": intel, "gen": default_gen, "gen_any": gen, "tmp": tmp_path, "repo": repo_root}
    finally:
        shutil.rmtree(change_dir, ignore_errors=True)


def _load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def test_pird_wiederholte_laeufe_haeufen_keine_identischen_risks_eintraege_an(ctx):
    res = ctx["gen"]()
    assert res.returncode == 0, f"Generator failed: {res.output}"

    # Positiv-Anker (T002356-M1): the generator MUST produce at least one risk entry.
    first_count = len(_load(ctx["intel"]).get("risks", []))
    assert first_count >= 1, f"Generator erzeugte kein risks[]: {first_count}"

    assert ctx["gen"]().returncode == 0
    assert ctx["gen"]().returncode == 0

    risks = _load(ctx["intel"]).get("risks", [])
    total = len(risks)
    unique_total = len({
        json.dumps({"note": r.get("note"), "severity": r.get("severity")}, sort_keys=True)
        for r in risks
    })
    assert total == unique_total, (
        f"risks[] nach drei Laeufen: {total} Eintraege, aber nur {unique_total} verschiedene: "
        f"{json.dumps(risks)}"
    )


def test_pird_intel_json_ist_ab_dem_zweiten_lauf_byte_identisch(ctx):
    res = ctx["gen"]()
    assert res.returncode == 0, f"Generator failed: {res.output}"
    assert ctx["gen"]().returncode == 0
    second = ctx["tmp"] / "second.json"
    shutil.copyfile(ctx["intel"], second)
    assert ctx["gen"]().returncode == 0

    # Positiv-Anker: the file exists, has content and carries meta.slug.
    assert ctx["intel"].stat().st_size > 0, "intel.json ist leer"
    meta = _load(ctx["intel"]).get("meta") or {}
    assert meta.get("slug") not in (None, False, ""), "intel.json ohne meta.slug"

    assert filecmp.cmp(second, ctx["intel"], shallow=False), (
        "Lauf 2 und Lauf 3 unterscheiden sich — der Generator ist nicht idempotent"
    )


def test_pird_manuell_ergaenztes_risiko_ueberlebt_den_erneuten_lauf(ctx):
    assert ctx["gen"]().returncode == 0
    data = _load(ctx["intel"])
    data["risks"] = list(data.get("risks", [])) + [
        {"note": "manuell ergaenzt: externe Abhaengigkeit ungeprueft", "severity": "info"}
    ]
    _dump(ctx["intel"], data)

    assert ctx["gen"]().returncode == 0

    risks = _load(ctx["intel"]).get("risks", [])
    kept = sum(1 for r in risks if str(r.get("note", "")).startswith("manuell ergaenzt"))
    assert kept == 1, f"manuell ergaenztes Risiko nach dem Lauf {kept} mal vorhanden (erwartet: 1)"


def test_pird_api_contracts_bleiben_von_der_dedupe_aenderung_unberuehrt(ctx):
    assert ctx["gen"]().returncode == 0
    data = _load(ctx["intel"])
    data["api_contracts"] = [{"path": "/api/dummy", "method": "GET"}]
    _dump(ctx["intel"], data)

    assert ctx["gen"]().returncode == 0

    contracts = _load(ctx["intel"]).get("api_contracts", [])
    kept = sum(1 for c in contracts if c.get("path") == "/api/dummy")
    assert kept == 1, f"api_contracts-Eintrag nach dem Lauf {kept} mal vorhanden (erwartet: 1)"


def test_pird_out_merge_uebernimmt_bestehendes_intel_json_am_zielpfad(ctx, run_cmd, repo_root):
    custom_out = ctx["tmp"] / "custom_intel" / "intel.json"
    custom_out.parent.mkdir(parents=True, exist_ok=True)
    script = str(repo_root / "scripts" / "plan-intel.sh")
    args = ["bash", script, SLUG, "--target-files", "scripts/plan-intel.sh", "--out", str(custom_out)]

    run_cmd(args, cwd=repo_root)
    assert custom_out.is_file()

    data = _load(custom_out)
    data["api_contracts"] = [{"path": "/api/custom", "method": "POST"}]
    _dump(custom_out, data)

    run_cmd(args, cwd=repo_root)

    contracts = _load(custom_out).get("api_contracts", [])
    kept = sum(1 for c in contracts if c.get("path") == "/api/custom")
    assert kept == 1, f"api_contracts in custom --out nicht beibehalten: {json.dumps(contracts)}"


def test_pird_out_liest_ticket_aus_dem_zielverzeichnis(ctx, run_cmd, repo_root):
    custom_dir = ctx["tmp"] / "ticket_test"
    custom_dir.mkdir(parents=True, exist_ok=True)
    custom_out = custom_dir / "intel.json"
    (custom_dir / ".ticket").write_text("T009999\n", encoding="utf-8")

    run_cmd(["bash", str(repo_root / "scripts" / "plan-intel.sh"), SLUG,
             "--target-files", "scripts/plan-intel.sh", "--out", str(custom_out)], cwd=repo_root)

    ticket_id = (_load(custom_out).get("meta") or {}).get("ticket_id")
    assert ticket_id == "T009999", f"Erwartet ticket_id T009999 aus custom_dir/.ticket, erhalten: {ticket_id}"


def test_t003623_target_files_akzeptiert_mehrere_leerzeichen_getrennte_pfade(ctx):
    res = ctx["gen_any"]("--target-files",
                         "scripts/plan-intel.sh", "scripts/plan-qa-check.sh", "scripts/plan-touched-files.sh")
    assert res.returncode == 0, f"Generator failed: {res.output}"

    paths = [e.get("path") for e in _load(ctx["intel"]).get("impact_files", [])]
    for needed in ("scripts/plan-intel.sh", "scripts/plan-qa-check.sh", "scripts/plan-touched-files.sh"):
        assert needed in paths, f"impact_files enthaelt nicht alle drei Pfade: {json.dumps(paths)}"


def test_t003623_komma_form_bleibt_kompatibel_target_files_a_b(ctx):
    res = ctx["gen_any"]("--target-files", "scripts/plan-intel.sh,scripts/plan-qa-check.sh")
    assert res.returncode == 0, f"Generator failed: {res.output}"

    paths = [e.get("path") for e in _load(ctx["intel"]).get("impact_files", [])]
    for needed in ("scripts/plan-intel.sh", "scripts/plan-qa-check.sh"):
        assert needed in paths, f"Komma-Form: impact_files unvollstaendig: {json.dumps(paths)}"
