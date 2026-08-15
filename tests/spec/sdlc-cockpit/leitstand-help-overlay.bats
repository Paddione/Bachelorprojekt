#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/leitstand-help-overlay.bats
# T008017/E5 — Help-Overlay: purpose-Registry nicht leer (Positiv-Anker),
# HelpOverlay.svelte existiert und traegt den data-purpose-id-Anker-Kontrakt,
# das Statusband verdrahtet den [?]-Toggle an den helpOverlayActive-Store
# (aria-pressed).
#
# SSOT: openspec/specs/sdlc-cockpit.md — "Help Overlay Layer" (E5).
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): Mischform. T1 ist
# OUTPUT-Verifikation — der Checker importiert die Registry per
# `node --experimental-strip-types` und wertet den REALEN Rueckgabewert aus
# (kein grep auf den Quelltext). T2/T3 sind Querschnittstests (Ausnahme zu
# T002448-M4): ein data-purpose-id-Anker bzw. eine Store-Import-Beziehung
# manifestiert sich ausschliesslich im Quelltext — es gibt kein Laufzeit-
# Kommando, dessen Output sie abbildet. Die ZUSICHERUNG haengt an den
# ERGEBNISSEN (Exit-Codes von Existenz- und grep-Pruefungen auf konkrete
# Dateien), nicht an Format-Ankern.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cat > "$BATS_TEST_TMPDIR/check-registry.mjs" <<'EOF'
const [, , registryPath] = process.argv;
const { leitstandPurposes } = await import(registryPath);
const entries = Object.entries(leitstandPurposes ?? {});
if (entries.length === 0) { console.log('FAIL empty-registry'); process.exit(1); }
console.log('OK registry-nonempty ' + entries.length);
EOF
}

# T1 — Positiv-Anker: die Registry ist nicht leer (Node laedt sie und zaehlt
# die Eintraege). Ohne Anker waere ein leerer Lauf gruen.
@test "T1 E5 help-overlay: purpose-Registry ist nicht leer (Positiv-Anker)" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  node -e 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
    || skip "node < 22 — kein TypeScript-Stripping"

  run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-registry.mjs" \
    "$REPO/components/website/src/lib/sdlc/leitstand-purpose-registry.ts"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '^OK registry-nonempty [1-9][0-9]*'
}

# T2 — HelpOverlay.svelte existiert und referenziert den Anker-Kontrakt
# (data-purpose-id). Querschnittspruefung: die Existenz des Overlay-Layers
# manifestiert sich in der Komponentendatei.
@test "T2 E5 help-overlay: HelpOverlay.svelte existiert mit data-purpose-id-Anker" {
  HELP="$REPO/components/website/src/components/leitstand/HelpOverlay.svelte"
  [ -f "$HELP" ]
  grep -qE 'data-purpose-id="help-overlay"' "$HELP"
}

# T3 — Statusband: der in E3 angelegte [?]-Toggle ist an den Store verdrahtet
# (Import-Beziehung) und traegt aria-pressed. Beide Merkmale sind getrennt
# geprueft, damit eine halbe Verdrahtung nicht gruen wird.
@test "T3 E5 help-overlay: Statusband verdrahtet den Toggle an helpOverlayActive" {
  SB="$REPO/components/website/src/components/leitstand/LeitstandStatusband.svelte"
  [ -f "$SB" ]
  grep -qe 'help-overlay-store' "$SB"
  grep -qe 'aria-pressed' "$SB"
}
