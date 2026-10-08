"""Native migration of tests/spec/dora-dashboard.bats."""
def test_dashboard_removed(repo_root):
    assert not (repo_root / 'components/website/src/components/admin/DoraDashboard.svelte').is_file()

def test_metrics_lib_removed(repo_root):
    assert not (repo_root / 'components/website/src/lib/dora-metrics.ts').is_file()

def test_metrics_api_removed(repo_root):
    assert not (repo_root / 'components/website/src/pages/api/admin/dora-metrics.ts').is_file()
