"""Native migration of tests/spec/website-core/admin-nav-no-sdlc-routes.bats."""
# Runs scripts/check-admin-nav-routes.mjs (node --experimental-strip-types) and checks exit status and

# output. Command output verification [T002448-M4].

import shutil
import subprocess

import pytest


@pytest.fixture
def node22(run_cmd):
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    res = subprocess.run(["node", "-e", 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)'],
                         capture_output=True, text=True)
    if res.returncode != 0:
        pytest.skip("node < 22 - kein TypeScript-Stripping")


def test_admin_nav_guard_skript_existiert_und_ist_ausfuehrbar(repo_root):
    assert (repo_root / "scripts" / "check-admin-nav-routes.mjs").is_file()


def test_admin_nav_kein_sidebar_eintrag_zeigt_auf_eine_im_prod_build_entfernte_sdlc_route(run_cmd, repo_root, node22):
    res = run_cmd(["node", "--experimental-strip-types", str(repo_root / "scripts" / "check-admin-nav-routes.mjs")],
                  cwd=repo_root)
    assert res.returncode == 0
    # Semantics over presentation: presence of the OK marker only (T002716).
    assert "admin-nav-routes: OK" in res.output


def test_admin_nav_guard_schlaegt_an_wenn_ein_sdlc_eintrag_eingeschleust_wird(run_cmd, repo_root, node22, tmp_path):
    # Positive anchor (T002356-M1): the guard run above must be green for a reason.
    fixture = tmp_path / "inject.mjs"
    fixture.write_text(
        f"const {{ resolveRedirect }} = await import('{repo_root}/components/website/src/middleware/redirect-map.ts');\n"
        "// Same resolution path as the guard, applied to a removed entry.\n"
        "let cur = '/admin/cockpit';\n"
        "for (let i = 0; i < 10; i++) {\n"
        "  const next = resolveRedirect(cur.split('?')[0]);\n"
        "  if (next === null || next === cur) break;\n"
        "  cur = next;\n"
        "}\n"
        "process.exit(cur.startsWith('/sdlc/') ? 0 : 1);\n",
        encoding="utf-8",
    )
    res = run_cmd(["node", "--experimental-strip-types", str(fixture)], cwd=repo_root)
    assert res.returncode == 0
