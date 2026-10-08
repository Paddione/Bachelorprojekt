"""Native migration of tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats."""
import re


def _deckki(repo_root):
    path = repo_root / "components/website/src/components/leitstand/decks/DeckKi.svelte"
    assert path.is_file(), f"missing: {path}"
    return path.read_text(encoding="utf-8")


def test_a_anchor_cockpit_component_dir_contains_svelte_files(repo_root):
    cockpit = repo_root / "components/website/src/components/sdlc/cockpit"
    count = len(list(cockpit.rglob("*.svelte"))) if cockpit.is_dir() else 0
    assert count > 0


def test_a_factory_model_slots_svelte_no_longer_exists(repo_root):
    assert not (repo_root / "components/website/src/components/sdlc/cockpit/FactoryModelSlots.svelte").exists()


def test_a_factory_model_slots_is_nowhere_tracked_in_repo(run_cmd, repo_root):
    r = run_cmd(["git", "ls-files"], cwd=repo_root)
    assert r.returncode == 0
    lines = r.stdout.splitlines()
    assert sum(1 for line in lines if line.endswith(".svelte")) > 0
    assert sum(1 for line in lines if "FactoryModelSlots" in line) == 0


def test_b_anchor_source_search_finds_provider_config_as_remaining_source(run_cmd, repo_root):
    r = run_cmd(
        ["git", "grep", "-l", "provider_config", "--", "components/website/src", "scripts/", ":!scripts/migrations"],
        cwd=repo_root,
    )
    assert r.returncode == 0
    assert r.stdout.splitlines()[0] != ""


def test_b_no_tracked_path_names_factory_model_slots(run_cmd, repo_root):
    # scripts/migrations bleibt ausgenommen: historische Migrationen sind unveraenderliche Geschichte.
    # scripts/ticket-db-schema.sql ebenso: generierter Schema-Snapshot, dokumentiert den Live-Stand
    # (die Tabelle existiert in der DB noch) — kein Code, der sie liest oder schreibt [T901492].
    r = run_cmd(
        ["git", "grep", "-l", "factory_model_slots", "--", "components/website/src", "scripts/", ":!scripts/migrations", ":!scripts/ticket-db-schema.sql"],
        cwd=repo_root,
    )
    assert r.returncode != 0


def test_c_anchor_deckki_still_imports_its_modules(repo_root):
    text = _deckki(repo_root)
    assert "import LlmProxyPanel" in text
    assert "import KiRoutingPanel" in text


def test_c_deckki_no_longer_mounts_ki_konfiguration(repo_root):
    text = _deckki(repo_root)
    assert not re.search(r"import KiKonfiguration|<KiKonfiguration", text)


def test_c_deckki_no_longer_mounts_factory_model_slots(repo_root):
    text = _deckki(repo_root)
    assert not re.search(r"import FactoryModelSlots|<FactoryModelSlots", text)
