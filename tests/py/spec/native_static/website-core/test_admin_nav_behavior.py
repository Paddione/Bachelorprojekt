"""Native behavioral cases from tests/spec/website-core/admin-nav-no-sdlc-routes.bats."""

import shutil
import pytest


@pytest.fixture
def node_with_types(run_cmd):
    if not shutil.which("node"):
        pytest.skip("Node not installed")
    version = run_cmd(["node", "-p", "process.versions.node"])
    version.check()
    if int(version.stdout.split(".")[0]) < 22:
        pytest.skip("Node < 22: no TypeScript stripping")
    return "node"


def test_no_sidebar_entry_resolves_to_removed_sdlc_route(repo_root, run_cmd, node_with_types):
    result = run_cmd([node_with_types, "--experimental-strip-types", str(repo_root / "scripts/check-admin-nav-routes.mjs")])
    result.check()
    assert "admin-nav-routes: OK" in result.output


def test_removed_cockpit_entry_is_identified_as_sdlc_route(repo_root, run_cmd, node_with_types, tmp_path):
    module = (repo_root / "components/website/src/middleware/redirect-map.ts").as_uri()
    fixture = tmp_path / "injected-entry.mjs"
    fixture.write_text(
        f"const {{ resolveRedirect }} = await import({module!r});\n"
        "let cur = '/admin/cockpit';\n"
        "for (let i = 0; i < 10; i++) {\n"
        "  const next = resolveRedirect(cur.split('?')[0]);\n"
        "  if (next === null || next === cur) break;\n"
        "  cur = next;\n"
        "}\nconsole.log(cur);\n"
    )
    result = run_cmd([node_with_types, "--experimental-strip-types", str(fixture)])
    result.check()
    assert result.stdout.strip().startswith("/sdlc/")
