#!/usr/bin/env bats
# Leitstand-DS-Token-Guard [T007559] -- Requirement "Leitstand Design Token Set"
# (openspec/changes/sdlc-leitstand-e1-e2/specs/sdlc-cockpit.md).
#
# Pruefmodus: Quelltext-Pruefung (dokumentierte Ausnahme T002448-M4) -- ein
# CSS-Custom-Property-Set *ist* sein Quelltext; es gibt ohne Playwright-
# Browserlauf gegen den Dev-Stack keinen separaten Laufzeit-Nachweis offline
# (Analogie zu build-target-runtime-env.bats). Die Prod-Isolation (T7) ist
# aus demselben Grund ebenfalls Quelltext-Pruefung ueber
# components/website/src/pages.
#
# Der Kontrakt fuer p1 (design/leitstand-ds) ist bindend:
#   - Signal-Tokens exakt --ls-signal-{green,amber,red,info}
#   - mind. 2 --ls-surface-<suffix>, mind. 1 --ls-line*, mind. 2 --ls-text-<suffix>,
#     mind. 1 Token mit "mono", mind. 3 --ls-space-<n>, Radien in [2px, 4px]
#   - glow/pulse nur in "running"-gebundenen Regeln (T3)
#   - Print-Light ausschliesslich innerhalb @media print (T4)
#   - design-system.astro laedt das Stylesheet (T5), nutzt keine Ad-hoc-Hex
#     im <style>-Block (T6), und nichts ausserhalb pages/sdlc/ referenziert die
#     Datei (T7)

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
  CSS_FILE="$REPO_ROOT/components/website/src/styles/sdlc-leitstand.css"
  SHOWCASE_FILE="$REPO_ROOT/components/website/src/pages/sdlc/design-system.astro"
}

# T1 -- Signal-Kern vollstaendig (Positiv-Anker: Datei existiert).
@test "leitstand-ds: signal tokens green/amber/red/info are defined" {
  [ -f "$CSS_FILE" ] || { echo "fehlt: components/website/src/styles/sdlc-leitstand.css"; return 1; }
  for sig in green amber red info; do
    grep -qE -- "--ls-signal-${sig}\s*:" "$CSS_FILE" \
      || { echo "fehlt: --ls-signal-${sig}"; return 1; }
  done
}

# T2 -- Token-Struktur: Surface-/Linien-/Text-Stufen, Mono-Typo, Abstands- und
# Radius-Schritte (Requirement-Text: "tiers", "steps", 2-4px).
@test "leitstand-ds: token structure covers surfaces, lines, text, mono, spacing, radii" {
  [ -f "$CSS_FILE" ] || skip "sdlc-leitstand.css not yet present"
  surface_n=$(grep -cE -- '--ls-surface-[a-z0-9]+\s*:' "$CSS_FILE")
  line_n=$(grep -cE -- '--ls-line[a-z0-9-]*\s*:' "$CSS_FILE")
  text_n=$(grep -cE -- '--ls-text-[a-z0-9]+\s*:' "$CSS_FILE")
  mono_n=$(grep -icE -- '--ls-[a-z0-9-]*mono[a-z0-9-]*\s*:' "$CSS_FILE")
  space_n=$(grep -cE -- '--ls-space-[a-z0-9]+\s*:' "$CSS_FILE")
  [ "$surface_n" -ge 2 ] || { echo "surface tokens < 2 ($surface_n)"; return 1; }
  [ "$line_n" -ge 1 ] || { echo "line tokens < 1 ($line_n)"; return 1; }
  [ "$text_n" -ge 2 ] || { echo "text tokens < 2 ($text_n)"; return 1; }
  [ "$mono_n" -ge 1 ] || { echo "mono token < 1 ($mono_n)"; return 1; }
  [ "$space_n" -ge 3 ] || { echo "space tokens < 3 ($space_n)"; return 1; }
  # Radii: jeder --ls-radius-* Wert liegt in [2px, 4px]
  grep -oE -- '--ls-radius-[a-z0-9]+\s*:\s*[0-9.]+px' "$CSS_FILE" | \
    awk -F: '{ gsub(/px| /,"",$2); if ($2+0 < 2 || $2+0 > 4) { print; exit 1 } }'
}

# T3 -- Glow/Puls nur fuer "laeuft gerade" (Requirement: "only for
# currently-running states"). Negativtest + Positiv-Anker (T002356-M1: Anker
# zuerst). Kontrakt fuer p1: jede Regel mit glow/pulse im Selektor- oder
# Keyframe-Namen traegt zusaetzlich die Teilzeichenkette "running" im selben
# Selektor/Keyframe-Namen.
@test "leitstand-ds: glow/pulse only bound to running states" {
  [ -f "$CSS_FILE" ] || skip "sdlc-leitstand.css not yet present"
  # Positiv-Anker zuerst: es GIBT ueberhaupt eine running-gebundene Glow/Puls-Regel.
  awk '/\{/{sel=$0} /glow|pulse/ && sel ~ /running/{found=1} END{exit !found}' "$CSS_FILE"
  # Negativ: keine Glow/Puls-Deklaration OHNE "running" im umschliessenden Selektor.
  awk '
    /\{/ { sel=$0 }
    /(glow|pulse)/ && sel !~ /running/ { print NR": "sel; bad=1 }
    END { exit bad }
  ' "$CSS_FILE"
}

# T4 -- Print-Light ist Report-Layer, kein zweites interaktives Theme
# (Requirement: "solely as a report stylesheet (@media print scope)").
# Negativtest + Positiv-Anker.
@test "leitstand-ds: print-light only inside @media print, no theme toggle outside" {
  [ -f "$CSS_FILE" ] || skip "sdlc-leitstand.css not yet present"
  # Positiv-Anker zuerst: @media print existiert und redefiniert mind. 1 --ls-Token.
  awk '/@media print/{inblock=1} inblock{print} /\}/{if(inblock)exit}' "$CSS_FILE" \
    | grep -qE -- '--ls-[a-z0-9-]+\s*:'
  # Negativ: ausserhalb von @media print kein Theme-Umschalt-Selektor.
  awk '
    /@media print/ { depth=1; next }
    depth { if (/\{/) depth++; if (/\}/) depth--; next }
    { print }
  ' "$CSS_FILE" | grep -qiE 'data-theme|theme-light' && return 1 || true
}

# T5 -- design-system.astro laedt sdlc-leitstand.css (Szenario "Showcase
# renders from tokens", erster Teil). Pruefmodus: Quelltext-Konvention --
# Astro-Imports sind buildzeitig, kein Laufzeitnachweis offline noetig.
@test "leitstand-ds: design-system.astro imports the token stylesheet" {
  grep -qF 'sdlc-leitstand.css' "$SHOWCASE_FILE"
}

# T6 -- Komponenten-Previews nutzen --ls-* statt Ad-hoc-Hex (Szenario
# "Showcase renders from tokens", zweiter Teil; Muster document-tokens-only.bats).
# Negativtest + Positiv-Anker.
@test "leitstand-ds: showcase style block contains no ad-hoc hex colors" {
  [ -f "$CSS_FILE" ] || skip "sdlc-leitstand.css not yet present"
  # Positiv-Anker: Token-Datei definiert ueberhaupt Werte (T1 belegt das
  # strukturell, hier zusaetzlich lokal fuer Testunabhaengigkeit).
  grep -qE -- '--ls-[a-z0-9-]+\s*:' "$CSS_FILE"
  # Negativ: kein Hex-Farbwert im <style>-Block von design-system.astro.
  awk '/<style/{inblock=1} inblock{print} /<\/style>/{if(inblock)exit}' \
    "$SHOWCASE_FILE" \
    | grep -cE '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?' | grep -qx 0
}

# T7 -- Prod-Build bleibt frei vom Leitstand-Stylesheet (Szenario "Prod build
# stays free of the Leitstand stylesheet"). Negativtest + Positiv-Anker.
@test "leitstand-ds: no importer of the stylesheet outside pages/sdlc" {
  # Positiv-Anker zuerst: SDLC-Seiten referenzieren die Datei ueberhaupt (T5 real).
  sdlc_hits=$(grep -rl 'sdlc-leitstand.css' "$REPO_ROOT/components/website/src" \
    --include='*.astro' --include='*.svelte' --include='*.ts' 2>/dev/null \
    | grep -c '/pages/sdlc/' || true)
  [ "$sdlc_hits" -ge 1 ]
  # Negativ: ausserhalb von pages/sdlc/ referenziert NICHTS die Datei.
  # `|| true` auf beiden Substitutionen: grep -c/-vc enden bei 0 Treffern mit
  # Exit 1, was unter BATS-errexit die Zuweisung abwuerfe, bevor die Assertion
  # urteilt -- die Zaehlung gehoert dem Test, nicht dem Pipe-Exit.
  prod_hits=$(grep -rl 'sdlc-leitstand.css' "$REPO_ROOT/components/website/src" \
    --include='*.astro' --include='*.svelte' --include='*.ts' 2>/dev/null \
    | grep -vc '/pages/sdlc/' || true)
  [ "$prod_hits" -eq 0 ]
}
