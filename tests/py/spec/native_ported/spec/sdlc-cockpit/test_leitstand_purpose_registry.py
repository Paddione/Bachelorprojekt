"""Native migration of tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats."""
# (E3, T007957, Kontrakt A)
# OUTPUT-Verifikation: the registry module is imported by node --experimental-strip-types and the real
# return values are checked. Node >= 22 is required; otherwise the tests skip.

import re

import pytest

CHECK_REGISTRY_MJS = r"""
import { readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
const [, , registryPath, componentsDir] = process.argv;
const { leitstandPurposes } = await import(registryPath);
const entries = Object.entries(leitstandPurposes ?? {});
if (entries.length === 0) { console.log('FAIL empty-registry'); process.exit(1); }
console.log('OK registry-nonempty ' + entries.length);

const zwecke = entries.map(([, v]) => v.zweck);
const dupes = zwecke.filter((z, i) => zwecke.indexOf(z) !== i);
if (dupes.length > 0) { console.log('FAIL zweck-duplicate ' + dupes.join(',')); process.exit(1); }
console.log('OK zweck-unique ' + zwecke.length);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc); else if (ent.name.endsWith('.svelte')) acc.push(p);
  }
  return acc;
}
function toKey(rel) {
  const base = rel.split('/').pop().replace(/\.svelte$/, '');
  const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return (!rel.includes('/') && kebab.startsWith('leitstand-')) ? kebab.slice(10) : kebab;
}
const files = walk(componentsDir).map((f) => relative(componentsDir, f));
if (files.length === 0) { console.log('FAIL no-components-found ' + componentsDir); process.exit(1); }
console.log('OK components-found ' + files.length);
const missing = files.filter((f) => !(toKey(f) in leitstandPurposes));
if (missing.length > 0) { console.log('FAIL missing-entries ' + missing.map(toKey).join(',')); process.exit(1); }
console.log('OK all-components-covered ' + files.length);
"""

FIXTURE_REGISTRY = """export const leitstandPurposes = {
  kontextzone: { zweck: 'Tiefe/Aktion folgt Selektion', datenquelle: 'floorStore', aktionen: [] },
};
"""

FIXTURE_REGISTRY_COMPLETE = """export const leitstandPurposes = {
  kontextzone: { zweck: 'Tiefe/Aktion folgt Selektion', datenquelle: 'floorStore', aktionen: [] },
  'deck-wissen': { zweck: 'API-Katalog + plan-Suche', datenquelle: 'api-inventory', aktionen: [] },
};
"""


@pytest.fixture
def node22(run_cmd):
    probe = run_cmd(["node", "-e", 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)'])
    if probe.returncode != 0:
        pytest.skip("node < 22 — kein TypeScript-Stripping")


@pytest.fixture
def checker(tmp_path):
    path = tmp_path / "check-registry.mjs"
    path.write_text(CHECK_REGISTRY_MJS, encoding="utf-8")
    return path


def test_t1_purpose_registry_nicht_leer_zweck_eindeutig_alle_leitstand_komponenten_abgedeckt(repo_root, run_cmd, checker, node22):
    result = run_cmd([
        "node", "--experimental-strip-types", str(checker),
        str(repo_root / "components/website/src/lib/sdlc/leitstand-purpose-registry.ts"),
        str(repo_root / "components/website/src/components/leitstand"),
    ])
    assert result.returncode == 0, result.output
    out = result.output
    assert re.search(r"^OK registry-nonempty [1-9][0-9]*", out, re.MULTILINE)
    assert re.search(r"^OK zweck-unique [1-9][0-9]*", out, re.MULTILINE)
    assert re.search(r"^OK all-components-covered [1-9][0-9]*", out, re.MULTILINE)


def test_t2_guard_faengt_eine_komponente_ohne_registry_eintrag(run_cmd, checker, tmp_path, node22):
    fx = tmp_path / "fixture-components"
    (fx / "decks").mkdir(parents=True)
    (fx / "Kontextzone.svelte").touch()
    (fx / "decks/DeckWissen.svelte").touch()

    complete = tmp_path / "fixture-registry-complete.mjs"
    complete.write_text(FIXTURE_REGISTRY_COMPLETE, encoding="utf-8")
    incomplete = tmp_path / "fixture-registry.mjs"
    incomplete.write_text(FIXTURE_REGISTRY, encoding="utf-8")

    # POSITIV-ANKER: vollstaendige Fixture-Registry laeuft durch.
    ok = run_cmd(["node", "--experimental-strip-types", str(checker), str(complete), str(fx)])
    assert ok.returncode == 0, ok.output

    # NEGATIV: unvollstaendige Registry faellt benannt durch.
    bad = run_cmd(["node", "--experimental-strip-types", str(checker), str(incomplete), str(fx)])
    assert bad.returncode == 1
    assert "FAIL missing-entries deck-wissen" in bad.output
