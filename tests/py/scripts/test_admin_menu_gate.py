"""tests/py/scripts/test_admin_menu_gate.py — Migration of tests/scripts/admin-menu-gate.bats."""
import shutil
import subprocess
from pathlib import Path
import pytest


class AdminRepo:
    def __init__(self, path: Path, repo_root: Path):
        self.path = path
        self.repo_root = repo_root

        subprocess.run(["git", "init", "-q"], cwd=self.path, check=True)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=self.path, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=self.path, check=True)

        (self.path / "components" / "website" / "src" / "layouts").mkdir(parents=True)
        (self.path / "components" / "website" / "src" / "pages" / "admin").mkdir(parents=True)
        (self.path / "scripts").mkdir(parents=True)

        src_script = repo_root / "scripts" / "admin-menu-gate.sh"
        dst_script = self.path / "scripts" / "admin-menu-gate.sh"
        shutil.copy2(src_script, dst_script)
        dst_script.chmod(0o755)

    def write_layout(self, content: str = None):
        if content is None:
            content = """const navGroups = [
  {
    label: 'Tagesgeschäft',
    items: [
      { href: '/admin/termine', label: 'Termine', icon: 'calendar' },
    ],
  },
];
"""
        layout_file = self.path / "components" / "website" / "src" / "layouts" / "AdminLayout.astro"
        layout_file.write_text(content, encoding="utf-8")

    def commit_baseline(self):
        self.write_layout()
        (self.path / "components" / "website" / "src" / "pages" / "admin.astro").touch()
        subprocess.run(["git", "add", "-A"], cwd=self.path, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "baseline"], cwd=self.path, check=True)
        subprocess.run(["git", "branch", "-M", "main"], cwd=self.path, check=True)
        subprocess.run(["git", "remote", "add", "origin", str(self.path)], cwd=self.path, check=False)
        subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], cwd=self.path, check=True)


@pytest.fixture
def admin_repo(tmp_path: Path, repo_root: Path) -> AdminRepo:
    """Setup a mock git repository with admin-menu-gate.sh and required structure."""
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    return AdminRepo(repo_dir, repo_root)


def test_passes_on_clean_baseline(admin_repo: AdminRepo, run_cmd):
    admin_repo.commit_baseline()
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    res.check(0)
    assert "Gate PASSED" in res.output


def test_r1_fails_when_new_static_admin_page_has_no_nav_entry(admin_repo: AdminRepo, run_cmd):
    admin_repo.commit_baseline()
    page = admin_repo.path / "components" / "website" / "src" / "pages" / "admin" / "forecasting.astro"
    page.write_text("<h1>Forecasting</h1>", encoding="utf-8")
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    assert res.returncode == 1
    assert "R1" in res.output
    assert "/admin/forecasting" in res.output


def test_r1_passes_when_new_page_is_added_to_nav_groups(admin_repo: AdminRepo, run_cmd):
    admin_repo.commit_baseline()
    admin_repo.write_layout("""const navGroups = [
  {
    label: 'Tagesgeschäft',
    items: [
      { href: '/admin/termine',     label: 'Termine',     icon: 'calendar' },
      { href: '/admin/forecasting', label: 'Forecasting', icon: 'star' },
    ],
  },
];
""")
    page = admin_repo.path / "components" / "website" / "src" / "pages" / "admin" / "forecasting.astro"
    page.write_text("<h1>Forecasting</h1>", encoding="utf-8")
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    res.check(0)


def test_r1_dynamic_param_routes_are_exempt(admin_repo: AdminRepo, run_cmd):
    admin_repo.commit_baseline()
    projekte_dir = admin_repo.path / "components" / "website" / "src" / "pages" / "admin" / "projekte"
    projekte_dir.mkdir(parents=True)
    (projekte_dir / "[id].astro").write_text("<h1>Detail</h1>", encoding="utf-8")
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    res.check(0)


def test_r2_fails_when_label_starts_with_neue(admin_repo: AdminRepo, run_cmd):
    admin_repo.write_layout("""const navGroups = [
  {
    label: 'Coaching',
    items: [
      { href: '/admin/coaching/sessions/new', label: 'Neue Session', icon: 'plus' },
    ],
  },
];
""")
    (admin_repo.path / "components" / "website" / "src" / "pages" / "admin.astro").touch()
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    run_cmd("git commit -q -m baseline", cwd=admin_repo.path).check(0)
    run_cmd("git update-ref refs/remotes/origin/main HEAD", cwd=admin_repo.path).check(0)
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    assert res.returncode == 1
    assert "R2" in res.output
    assert "Neue Session" in res.output


def test_r4_fails_when_group_has_more_than_six_items(admin_repo: AdminRepo, run_cmd):
    admin_repo.write_layout("""const navGroups = [
  {
    label: 'Toomany',
    items: [
      { href: '/admin/a', label: 'A', icon: 'x' },
      { href: '/admin/b', label: 'B', icon: 'x' },
      { href: '/admin/c', label: 'C', icon: 'x' },
      { href: '/admin/d', label: 'D', icon: 'x' },
      { href: '/admin/e', label: 'E', icon: 'x' },
      { href: '/admin/f', label: 'F', icon: 'x' },
      { href: '/admin/g', label: 'G', icon: 'x' },
    ],
  },
];
""")
    (admin_repo.path / "components" / "website" / "src" / "pages" / "admin.astro").touch()
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    run_cmd("git commit -q -m baseline", cwd=admin_repo.path).check(0)
    run_cmd("git update-ref refs/remotes/origin/main HEAD", cwd=admin_repo.path).check(0)
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    assert res.returncode == 1
    assert "R4" in res.output


def test_r5_fails_when_nav_groups_has_more_than_six_groups(admin_repo: AdminRepo, run_cmd):
    admin_repo.write_layout("""const navGroups = [
  { label: 'G1', items: [ { href: '/admin/1', label: 'A', icon: 'x' } ] },
  { label: 'G2', items: [ { href: '/admin/2', label: 'A', icon: 'x' } ] },
  { label: 'G3', items: [ { href: '/admin/3', label: 'A', icon: 'x' } ] },
  { label: 'G4', items: [ { href: '/admin/4', label: 'A', icon: 'x' } ] },
  { label: 'G5', items: [ { href: '/admin/5', label: 'A', icon: 'x' } ] },
  { label: 'G6', items: [ { href: '/admin/6', label: 'A', icon: 'x' } ] },
  { label: 'G7', items: [ { href: '/admin/7', label: 'A', icon: 'x' } ] },
];
""")
    (admin_repo.path / "components" / "website" / "src" / "pages" / "admin.astro").touch()
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    run_cmd("git commit -q -m baseline", cwd=admin_repo.path).check(0)
    run_cmd("git update-ref refs/remotes/origin/main HEAD", cwd=admin_repo.path).check(0)
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    assert res.returncode == 1
    assert "R5" in res.output


def test_r7_fails_when_dashboard_links_to_an_orphan(admin_repo: AdminRepo, run_cmd):
    admin_repo.write_layout("""const navGroups = [
  {
    label: 'G',
    items: [
      { href: '/admin/termine', label: 'Termine', icon: 'calendar' },
    ],
  },
];
""")
    (admin_repo.path / "components" / "website" / "src" / "pages" / "admin.astro").write_text(
        '<a href="/admin/projekte">Aktive Projekte</a>\n', encoding="utf-8"
    )
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    run_cmd("git commit -q -m baseline", cwd=admin_repo.path).check(0)
    run_cmd("git update-ref refs/remotes/origin/main HEAD", cwd=admin_repo.path).check(0)
    res = run_cmd("bash scripts/admin-menu-gate.sh", cwd=admin_repo.path)
    assert res.returncode == 1
    assert "R7" in res.output
    assert "/admin/projekte" in res.output


def test_admin_menu_gate_skip_bypasses_with_warning(admin_repo: AdminRepo, run_cmd):
    admin_repo.commit_baseline()
    page = admin_repo.path / "components" / "website" / "src" / "pages" / "admin" / "forecasting.astro"
    page.write_text("<h1>Forecasting</h1>", encoding="utf-8")
    run_cmd("git add -A", cwd=admin_repo.path).check(0)
    res = run_cmd(
        "bash scripts/admin-menu-gate.sh",
        cwd=admin_repo.path,
        env={"ADMIN_MENU_GATE": "skip"},
    )
    res.check(0)
    assert "bypassed" in res.output
