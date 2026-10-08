"""Native migration of tests/spec/repo-structure/components-group.bats."""

def test_repo_structure_fuenf_komponenten_unter_components_keine_top_level_ordner(repo_root):
    # Positiv-Anker: der gueltige Fall
    assert (repo_root / "components").is_dir()
    components = ["brett", "studio-server", "mentolder-web", "mediaviewer-widget", "VideoVault"]
    for c in components:
        assert (repo_root / "components" / c).is_dir(), c
    # Negativ-Aussage: kein Top-Level-Verzeichnis mehr
    for c in components:
        assert not (repo_root / c).is_dir(), c
