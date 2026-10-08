"""Native migration of tests/spec/sdlc-cockpit/leitstand-url-scheme.bats."""
# (Kontrakt B)
# OUTPUT-Verifikation: leitstand-url.ts is imported by node --experimental-strip-types and the real
# return values of parseLeitstandQuery / toLeitstandQuery are evaluated.

import re

import pytest

CHECK_URL_MJS = r"""
const [, , modPath] = process.argv;
const { parseLeitstandQuery, toLeitstandQuery } = await import(modPath);
const cases = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const P = (qs) => { try { return parseLeitstandQuery(new URLSearchParams(qs)); } catch (e) { return { __threw: e.message }; } };

cases.push(['new-params-passthrough', eq(P('station=implement&ticket=T007957&deck=ki'),
  { station: 'implement', ticket: 'T007957', deck: 'ki' })]);
cases.push(['legacy-phase-triage', eq(P('phase=triage'), { station: 'triage' })]);
cases.push(['legacy-phase-planung', eq(P('phase=planung'), { station: 'planung' })]);
cases.push(['legacy-phase-deploy', eq(P('phase=deploy'), { station: 'deploy' })]);
cases.push(['legacy-phase-ship', eq(P('phase=ship'), { station: 'ship' })]);
cases.push(['legacy-phase-bauen-no-station', P('phase=bauen').station === undefined]);
cases.push(['legacy-phase-review-maps-verify', eq(P('phase=review'), { station: 'verify' })]);
cases.push(['legacy-mode-insights', eq(P('mode=insights'), { deck: 'ki' })]);
cases.push(['legacy-mode-overview-empty', Object.keys(P('mode=overview')).length === 0]);
cases.push(['unknown-station-ignored', P('station=doesnotexist').station === undefined]);
cases.push(['unknown-deck-ignored', P('deck=doesnotexist').deck === undefined]);
cases.push(['unknown-phase-never-throws', P('phase=doesnotexist').__threw === undefined]);
cases.push(['unknown-mode-never-throws', P('mode=doesnotexist').__threw === undefined]);
cases.push(['new-wins-over-legacy', eq(P('station=verify&phase=triage'), { station: 'verify' })]);
cases.push(['serialize-order-omits-empty', toLeitstandQuery({ station: 'implement', ticket: 'T007957' }) === 'station=implement&ticket=T007957']);
cases.push(['serialize-empty', toLeitstandQuery({}) === '']);
const sel = { station: 'verify', ticket: 'T007957', deck: 'plattform' };
cases.push(['round-trip', eq(parseLeitstandQuery(new URLSearchParams(toLeitstandQuery(sel))), sel)]);

let bad = 0;
for (const [name, ok] of cases) {
  console.log((ok ? 'OK ' : 'FAIL ') + name);
  if (!ok) bad++;
}
console.log('CHECKED ' + cases.length);
process.exit(bad > 0 ? 1 : 0);
"""


@pytest.fixture
def node22(run_cmd):
    probe = run_cmd(["node", "-e", 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)'])
    if probe.returncode != 0:
        pytest.skip("node < 22 — kein TypeScript-Stripping")


def test_t1_url_weiche_alle_kontrakt_b_faelle_bestehen(repo_root, run_cmd, tmp_path, node22):
    script = tmp_path / "check-url.mjs"
    script.write_text(CHECK_URL_MJS, encoding="utf-8")
    result = run_cmd([
        "node", "--experimental-strip-types", str(script),
        str(repo_root / "components/website/src/lib/sdlc/leitstand-url.ts"),
    ])
    # Positiv-Anker: Fallzahl im erwarteten Bereich.
    assert re.search(r"^CHECKED (1[6-9]|[2-9][0-9])$", result.output, re.MULTILINE), result.output
    if result.returncode != 0:
        print("URL-Weiche-Defekte:")
        print("\n".join(line for line in result.output.splitlines() if line.startswith("FAIL ")))
    assert result.returncode == 0
