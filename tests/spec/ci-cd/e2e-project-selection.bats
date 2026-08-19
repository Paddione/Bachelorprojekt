#!/usr/bin/env bats
#
# T012489 — Die Projektauswahl des naechtlichen Prod-E2E muss von Playwright
# tatsaechlich verstanden werden und darf nicht an bedingt vorhandenen Projekten
# zerbrechen.
#
# Zwei Fehlschlaege, dieselbe Klasse:
#
#   1. `--project=!korczewski` sah wie eine Negation aus, ist aber keine.
#      Playwright liest den Wert als Projektnamen; der Lauf brach mit
#      "Project(s) not found" ab, BEVOR ein einziger Test lief.
#   2. Die naheliegende Reparatur — die gewuenschten Projekte positiv aufzaehlen —
#      bricht mit derselben Meldung ab, sobald ein aufgezaehltes Projekt bedingt
#      fehlt: `ios` existiert in playwright.config.ts nur bei installiertem WebKit
#      (`...(webkitInstalled ? [...] : [])`).
#
# Der Ausschluss liegt deshalb in der Config, die ihre eigene Projektliste kennt.
#
# Pruefmodus: gemischt. Der eigentliche Nachweis ist eine LAUFZEIT-Probe gegen
# `playwright test --list` (der Defekt sass in der Laufzeit, eine reine
# Konfigurationsaussage taugt dafuer nicht als Stellvertreter — tests/CLAUDE.md,
# Fehlerklasse 3). Sie laeuft nur, wo tests/e2e/node_modules vorhanden ist, und
# nennt sonst den Grund. Die strukturellen Zusicherungen greifen zusaetzlich und
# ueberall.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  WF="$REPO/.github/workflows/e2e.yml"
  CONFIG="$REPO/tests/e2e/playwright.config.ts"
  PW="$REPO/tests/e2e/node_modules/.bin/playwright"
}

# Der komplette run-Block des nightly-Schritts, der playwright aufruft.
_playwright_run_block() {
  yq -r '.jobs.playwright.steps[] | select(.run != null) | select(.run | test("playwright test")) | .run' "$WF"
}

# Die env-Abbildung desselben Schritts.
_playwright_step_env() {
  yq -r '.jobs.playwright.steps[] | select(.run != null) | select(.run | test("playwright test")) | .env // {} | to_entries | .[] | "\(.key)=\(.value)"' "$WF"
}

@test "T012489: der nightly-Job ruft playwright ueberhaupt auf" {
  # Positiv-Anker fuer alle folgenden Negativ-Aussagen. Faellt der Schritt weg,
  # bestuenden sie sonst vakuos.
  local cmd
  cmd="$(_playwright_run_block)"
  [ -n "$cmd" ]
}

@test "T012489: die Projektauswahl verwendet keine Pseudo-Negation" {
  local cmd
  cmd="$(_playwright_run_block)"
  if printf '%s\n' "$cmd" | grep -qE -- '--project[= ]!'; then
    echo "Pseudo-Negation in e2e.yml — Playwright liest das als Projektnamen: $cmd" >&2
    return 1
  fi
}

@test "T012489: der Job zaehlt keine feste Projektliste auf" {
  # Eine feste Liste bricht ab, sobald ein aufgezaehltes Projekt bedingt fehlt
  # (ios/WebKit) — und sie veraltet still, wenn ein Projekt hinzukommt.
  local cmd
  cmd="$(_playwright_run_block)"
  if printf '%s\n' "$cmd" | grep -qE -- '--project'; then
    echo "e2e.yml waehlt Projekte per --project aus. Der Ausschluss gehoert in die" >&2
    echo "Config (E2E_SKIP_KORCZEWSKI), die ihre eigene Projektliste kennt:" >&2
    echo "$cmd" >&2
    return 1
  fi
}

@test "T012489: der Job setzt E2E_SKIP_KORCZEWSKI=1" {
  local env_out
  env_out="$(_playwright_step_env)"
  [ -n "$env_out" ]
  printf '%s\n' "$env_out" | grep -qx 'E2E_SKIP_KORCZEWSKI=1'
}

@test "T012489: die Config wertet E2E_SKIP_KORCZEWSKI aus" {
  # Positiv-Anker: die korczewski-Projekte existieren ueberhaupt noch. Waeren sie
  # entfernt worden, sagte die Auswertung des Schalters nichts mehr aus.
  grep -qE "name: 'korczewski'" "$CONFIG"
  grep -qE "name: 'korczewski-setup'" "$CONFIG"

  grep -q 'E2E_SKIP_KORCZEWSKI' "$CONFIG"
}

@test "T012489: Laufzeit — E2E_SKIP_KORCZEWSKI=1 entfernt genau die korczewski-Projekte" {
  if [ ! -x "$PW" ]; then
    skip "tests/e2e/node_modules fehlt — Laufzeitprobe nicht moeglich (kein stiller Skip: die strukturellen Tests oben greifen weiterhin)"
  fi

  local without with
  without="$(cd "$REPO/tests/e2e" && "$PW" test --list 2>&1 | grep -oE '^[[:space:]]+\[[a-z-]+\]' | tr -d ' []' | sort -u)"
  with="$(cd "$REPO/tests/e2e" && E2E_SKIP_KORCZEWSKI=1 "$PW" test --list 2>&1 | grep -oE '^[[:space:]]+\[[a-z-]+\]' | tr -d ' []' | sort -u)"

  # Auf die Projekt-Tags des Listings pruefen, nicht auf das blosse Wort im
  # Output: der Worktree-Pfad kann "korczewski" enthalten und die Assertion
  # sonst erfuellen, obwohl kein Projekt gemeint ist.
  [ -n "$without" ]
  [ -n "$with" ]

  printf '%s\n' "$without" | grep -qx 'korczewski'
  printf '%s\n' "$without" | grep -qx 'korczewski-setup'

  if printf '%s\n' "$with" | grep -qx 'korczewski'; then
    echo "E2E_SKIP_KORCZEWSKI=1 blendet 'korczewski' nicht aus." >&2
    return 1
  fi
  if printf '%s\n' "$with" | grep -qx 'korczewski-setup'; then
    echo "E2E_SKIP_KORCZEWSKI=1 blendet 'korczewski-setup' nicht aus." >&2
    return 1
  fi

  # Und es darf NUR das entfallen — sonst kuerzt der Schalter die Suite still.
  local unexpected
  unexpected="$(comm -23 <(printf '%s\n' "$without") <(printf '%s\n' "$with") | grep -vxE 'korczewski|korczewski-setup' || true)"
  if [ -n "$unexpected" ]; then
    echo "Der Schalter entfernt zusaetzlich Projekt(e), die bleiben sollten:" >&2
    echo "$unexpected" >&2
    return 1
  fi
}
