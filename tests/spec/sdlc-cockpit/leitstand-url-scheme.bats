#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/leitstand-url-scheme.bats
# SSOT: openspec/specs/sdlc-cockpit.md — E3-Leitstand-Shell [T007957], Kontrakt B
# (leitstand-url.ts: 9 Stationen, 4 Decks, Praezedenz neu-vor-legacy, Legacy-Mapping
# phase=/mode=, Feld-Reihenfolge station,ticket,deck, kein fuehrendes '?').
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): OUTPUT-Verifikation — der Checker
# importiert leitstand-url.ts per `node --experimental-strip-types` und wertet die REALEN
# Rueckgabewerte aus (kein grep auf den p1-Quelltext).

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cat > "$BATS_TEST_TMPDIR/check-url.mjs" <<'EOF'
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
EOF
}

# T1 — alle Kontrakt-B-Faelle bestehen (Positiv-Anker: Fallzahl + Erfolg).
@test "T1 URL-Weiche: alle Kontrakt-B-Faelle bestehen (parse/serialize/round-trip)" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  node -e 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
    || skip "node < 22 — kein TypeScript-Stripping"

  run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-url.mjs" \
    "$REPO/components/website/src/lib/sdlc/leitstand-url.ts"
  echo "$output" | grep -qE '^CHECKED (1[6-9]|[2-9][0-9])$'
  if [ "$status" -ne 0 ]; then
    echo "URL-Weiche-Defekte:" >&3
    echo "$output" | grep '^FAIL ' >&3
  fi
  [ "$status" -eq 0 ]
}
