"""Native assertions from tests/spec/ci-cd/cfr-trend-window.bats."""

def test_cfr_broad_measurement_and_four_week_trend(run_cmd):
    result = run_cmd(["bash", "scripts/vda.sh", "cfr"])
    result.check()
    assert "CFR breit" in result.output
    assert "CFR 4w" in result.output
    assert sum("%" in line for line in result.output.splitlines()) >= 2
