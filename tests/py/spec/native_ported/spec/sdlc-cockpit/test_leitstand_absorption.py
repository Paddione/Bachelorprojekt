"""Native migration of tests/spec/sdlc-cockpit/leitstand-absorption.bats."""
# (T008017/E5)
# Querschnittstest: die Redirect-Map wird aus der TS-Quelle geparst (embedded node script), Ergebnisse
# werden an den Ausgabezeilen geprueft. T2 prueft das Dateisystem.

CHECK_MAP_MJS = r"""
import { readFileSync } from 'node:fs';
const [, , mapFile] = process.argv;
const src = readFileSync(mapFile, 'utf8');
const block = src.match(/export const REDIRECT_MAP[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!block) { console.log('FAIL map-block'); process.exit(2); }
const map = {};
const re = /'([^']+)'\s*:\s*'([^']+)'/g;
let m;
while ((m = re.exec(block[1])) !== null) map[m[1]] = m[2];
if (Object.keys(map).length === 0) { console.log('FAIL map-empty'); process.exit(2); }

// 1) Positiv-Anker: die drei Absorptionsziele stehen zeichengenau in der Map.
const expect = {
  '/sdlc/repohealth': '/sdlc/cockpit?deck=qualitaet',
  '/sdlc/prompts': '/sdlc/cockpit?deck=wissen',
  '/sdlc/ki-konfiguration': '/sdlc/cockpit?deck=ki',
};
let bad = 0;
for (const [k, v] of Object.entries(expect)) {
  const ok = map[k] === v;
  console.log((ok ? 'OK ' : 'FAIL ') + 'absorption ' + k + ' -> ' + (map[k] ?? '(fehlt)'));
  if (!ok) bad++;
}

// 2) Negativ (mit Anker): kein Cockpit-Ziel traegt tab=.
const cockpitTargets = Object.values(map).filter((v) => v.startsWith('/sdlc/cockpit'));
if (cockpitTargets.length === 0) { console.log('FAIL no-cockpit-targets'); process.exit(2); }
for (const v of cockpitTargets) {
  const ok = !v.includes('tab=');
  console.log((ok ? 'OK ' : 'FAIL ') + 'no-tab ' + v);
  if (!ok) bad++;
}

console.log('CHECKED');
process.exit(bad > 0 ? 1 : 0);
"""


def test_t1_e5_absorption_drei_absorptionsziele_in_der_map_kein_tab_auf_cockpit_zielen(repo_root, run_cmd, tmp_path):
    script = tmp_path / "check-map.mjs"
    script.write_text(CHECK_MAP_MJS, encoding="utf-8")
    result = run_cmd(
        ["node", str(script), str(repo_root / "components/website/src/middleware/redirect-map.ts")]
    )
    assert result.returncode == 0, result.output
    out = result.output
    assert "OK absorption /sdlc/repohealth -> /sdlc/cockpit?deck=qualitaet" in out
    assert "OK absorption /sdlc/prompts -> /sdlc/cockpit?deck=wissen" in out
    assert "OK absorption /sdlc/ki-konfiguration -> /sdlc/cockpit?deck=ki" in out
    assert "OK no-tab " in out


def test_t2_e5_absorption_satelliten_astro_dateien_existieren_nicht_mehr(repo_root):
    pages = repo_root / "components/website/src/pages/sdlc"
    # POSITIV-ANKER: das Absorptionsziel cockpit.astro existiert.
    assert (pages / "cockpit.astro").is_file()
    for page in ["repohealth", "prompts", "ki-konfiguration"]:
        assert not (pages / f"{page}.astro").exists(), f"{page}.astro existiert noch"
