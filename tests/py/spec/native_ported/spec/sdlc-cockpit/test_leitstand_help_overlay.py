"""Native migration of tests/spec/sdlc-cockpit/leitstand-help-overlay.bats."""
# (T008017/E5)
# T1 is output verification: the registry is imported by node --experimental-strip-types and the
# real return value is evaluated. T2/T3 are source-convention checks on the component files.

import pytest

CHECK_REGISTRY_MJS = r"""
const [, , registryPath] = process.argv;
const { leitstandPurposes } = await import(registryPath);
const entries = Object.entries(leitstandPurposes ?? {});
if (entries.length === 0) { console.log('FAIL empty-registry'); process.exit(1); }
console.log('OK registry-nonempty ' + entries.length);
"""


@pytest.fixture
def node22(run_cmd):
    probe = run_cmd(["node", "-e", 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)'])
    if probe.returncode != 0:
        pytest.skip("node < 22 — kein TypeScript-Stripping")


def test_t1_e5_help_overlay_purpose_registry_ist_nicht_leer_positiv_anker(repo_root, run_cmd, tmp_path, node22):
    script = tmp_path / "check-registry.mjs"
    script.write_text(CHECK_REGISTRY_MJS, encoding="utf-8")
    result = run_cmd([
        "node", "--experimental-strip-types", str(script),
        str(repo_root / "components/website/src/lib/sdlc/leitstand-purpose-registry.ts"),
    ])
    assert result.returncode == 0, result.output
    assert any(
        line.startswith("OK registry-nonempty ") and line.rsplit(" ", 1)[1].isdigit()
        and int(line.rsplit(" ", 1)[1]) >= 1
        for line in result.output.splitlines()
    )


def test_t2_e5_help_overlay_help_overlay_svelte_existiert_mit_data_purpose_id_anker(repo_root):
    help_overlay = repo_root / "components/website/src/components/leitstand/HelpOverlay.svelte"
    assert help_overlay.is_file()
    assert 'data-purpose-id="help-overlay"' in help_overlay.read_text(encoding="utf-8")


def test_t3_e5_help_overlay_statusband_verdrahtet_den_toggle_an_help_overlay_active(repo_root):
    statusband = repo_root / "components/website/src/components/leitstand/LeitstandStatusband.svelte"
    assert statusband.is_file()
    text = statusband.read_text(encoding="utf-8")
    assert "help-overlay-store" in text
    assert "aria-pressed" in text
