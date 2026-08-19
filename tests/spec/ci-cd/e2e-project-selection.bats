#!/usr/bin/env bats
#
# T012489 — Die Projektauswahl des naechtlichen Prod-E2E muss von Playwright
# tatsaechlich verstanden werden, und sie darf nicht still veralten.
#
# Pruefmodus: Querschnittstest ueber CI-Konfiguration — hier ist grep das
# angemessene Mittel (tests/CLAUDE.md, Ausnahme zur Output-Verifikation): das
# gepruefte Ergebnis manifestiert sich ausschliesslich im Workflow-Text und in
# der Playwright-Config. Ein Laufzeit-Nachweis waere nur mit installiertem
# Playwright und Netzzugriff auf Produktion moeglich und taugt nicht als Gate.
#
# Vorgeschichte: `--project=!korczewski` sah wie eine Negation aus, ist aber
# keine. Playwright 1.61 nimmt bei --project nur Projektnamen; der Lauf brach
# mit "Project(s) ... not found" ab, BEVOR ein einziger Test lief. Der
# naechtliche Prod-E2E war dadurch rot aus dem falschen Grund — echte
# Regressionen waeren nicht aufgefallen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  WF="$REPO/.github/workflows/e2e.yml"
  CONFIG="$REPO/tests/e2e/playwright.config.ts"
}

# Projektnamen, die der nightly-Job bewusst auslaesst.
_excluded_projects() {
  printf '%s\n' korczewski-setup korczewski
}

# Alle in der Playwright-Config definierten Projekte.
_config_projects() {
  grep -oE "^[[:space:]]*name:[[:space:]]*'[^']+'" "$CONFIG" \
    | sed -E "s/.*'([^']+)'.*/\1/" | sort -u
}

# Der komplette run-Block des nightly-Schritts, der playwright aufruft. Bewusst der
# ganze Block statt einer Zeile: die Auswahl steht mehrzeilig mit \-Fortsetzungen,
# eine zeilenweise Extraktion faende keine --project-Argumente und liesse den
# Mengenvergleich unten vakuos bestehen.
_playwright_run_block() {
  yq -r '.jobs.playwright.steps[] | select(.run != null) | select(.run | test("playwright test")) | .run' "$WF"
}

# Die vom nightly-Job (`playwright`) angeforderten Projekte.
_workflow_projects() {
  _playwright_run_block | grep -oE -- '--project[= ][^ \\]+' \
    | sed -E 's/--project[= ]//' | sort -u
}

@test "T012489: die Projektauswahl verwendet keine Pseudo-Negation" {
  # Positiv-Anker zuerst: der Job existiert und ruft playwright ueberhaupt auf.
  # Ohne ihn bestuende die Negativ-Aussage vakuos, sobald der Job wegfaellt.
  local cmd
  cmd="$(_playwright_run_block)"
  [ -n "$cmd" ]

  # Playwright kennt kein '!' in --project. Ein solcher Wert bricht den Lauf ab,
  # bevor irgendein Test laeuft.
  if printf '%s\n' "$cmd" | grep -qE -- '--project[= ]!'; then
    echo "Pseudo-Negation in e2e.yml: $cmd" >&2
    return 1
  fi
}

@test "T012489: jedes Projekt der Config ist entweder angefordert oder ausgeschlossen" {
  # Positiv-Anker: beide Seiten sind nicht leer. Waere eine leer, verglichen die
  # Mengen unten nichts und der Test bestuende trivial.
  local n_config n_wf
  n_config="$(_config_projects | wc -l)"
  n_wf="$(_workflow_projects | wc -l)"
  [ "$n_config" -gt 0 ]
  [ "$n_wf" -gt 0 ]

  # Ein neu hinzugefuegtes Projekt liefe sonst still nie mit — dieselbe
  # Drift-Klasse wie die Allowlist aus T012446.
  local missing
  missing="$(comm -23 <(_config_projects) <(cat <(_workflow_projects) <(_excluded_projects) | sort -u))"
  if [ -n "$missing" ]; then
    echo "Projekt(e) in playwright.config.ts, die der nightly-Job weder anfordert" >&2
    echo "noch bewusst ausschliesst:" >&2
    echo "$missing" >&2
    return 1
  fi
}

@test "T012489: der Job fordert kein Projekt an, das die Config nicht kennt" {
  local unknown
  unknown="$(comm -13 <(_config_projects) <(_workflow_projects))"
  if [ -n "$unknown" ]; then
    echo "e2e.yml fordert Projekt(e) an, die playwright.config.ts nicht definiert:" >&2
    echo "$unknown" >&2
    return 1
  fi
}

@test "T012489: die ausgeschlossenen Projekte existieren in der Config" {
  # Sonst wuerde ein Tippfehler in der Ausschlussliste den Drift-Guard oben
  # aushebeln: das echte Projekt gilt dann als weder angefordert noch
  # ausgeschlossen — oder, schlimmer, ein umbenanntes korczewski-Projekt liefe
  # unbemerkt gegen die eingefrorene Brand.
  local e
  while IFS= read -r e; do
    _config_projects | grep -qx "$e" || {
      echo "Ausgeschlossenes Projekt '$e' existiert in der Config nicht (mehr)." >&2
      return 1
    }
  done < <(_excluded_projects)
}
