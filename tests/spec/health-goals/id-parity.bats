#!/usr/bin/env bats
# SSOT: openspec/specs/health-goals.md
#
# Prüfmodus: **Output-Verifikation** [T002448-M4]. Die Tests führen die ID-Extraktion
# tatsächlich aus und vergleichen die resultierenden Mengen; sie greppen nicht nach
# Implementierungsmustern im Quelltext.
#
# Warum es diese Datei gibt [T002598]:
# .claude/lib/goals.md ist das Register (welche Ziele gelten),
# scripts/health-goals-check.sh ist die Messung (wie sie geprüft werden).
# Niemand prüfte, ob beide dieselbe Menge führen — dadurch sammelten sich 35 Ziele
# an, die dokumentiert waren, aber nie gemessen wurden. Sie zeigten dauerhaft den
# Wert, den zuletzt jemand von Hand eintrug: gen-goals-data.mjs misst nichts, es
# parst goals.md. Ein Ziel ohne row()-Aufruf ist damit für immer grün.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GOALS_MD="$REPO_ROOT/.claude/lib/goals.md"
  CHECK_SH="$REPO_ROOT/scripts/health-goals-check.sh"
}

# Ziel-IDs aus dem Register: H2-Sektionen (Prio A/B) + Tabellenzeilen (Prio C).
#
# Die Regex ist G-[A-Z0-9]+ und NICHT G-[A-Z]+[0-9]+. Letztere zerschneidet IDs mit
# Ziffern im Präfix: aus G-E2E01 wird "G-E2", und G-K8S01..04 fallen komplett durch.
# Genau dieser Fehler ist bei der Analyse zu T002598 passiert und verfälschte die
# gemessene Drift von 35 auf 31 — die Regex sah plausibel aus und erfasste still die
# falsche Menge.
documented_ids() {
  {
    grep -oE '^## G-[A-Z0-9]+' "$GOALS_MD" | sed 's/^## //'
    grep -oE '^\| \*\*G-[A-Z0-9]+\*\*' "$GOALS_MD" | grep -oE 'G-[A-Z0-9]+'
  } | sort -u
}

# Gemessene IDs: jeder row-Aufruf in check.sh.
#
# `row` steht nicht immer am Zeilenanfang — G-CFG01 folgt einem `;` auf derselben
# Zeile, und vier weitere (G-FE05, G-SEC06, G-TEST05, G-CFG01) stehen eingerückt in
# if/else-Zweigen. Ein auf '^row' verankerter Ausdruck übersieht sie und meldet eine
# Differenz, die es nicht gibt. Deshalb wortgebunden statt zeilenverankert.
measured_ids() {
  grep -oE '\brow +(gate|target) +G-[A-Z0-9]+' "$CHECK_SH" \
    | grep -oE 'G-[A-Z0-9]+' | sort -u
}

@test "ID-Extraktion findet die bekannten Anker in beiden Quellen (Positiv-Anker)" {
  # Pflicht-Vorbedingung für die beiden Paritätstests [T002356-M1]: bricht die
  # Extraktion, sind beide Mengen leer, jede Differenz ist leer und "keine
  # Abweichung" gilt trivial. Dieser Test schlägt dann als einziger fehl und zeigt
  # die Ursache, statt die Paritätstests still grün werden zu lassen.
  local doc meas
  doc="$(documented_ids)"
  meas="$(measured_ids)"

  [ "$(printf '%s\n' "$doc"  | grep -c .)" -gt 50 ]
  [ "$(printf '%s\n' "$meas" | grep -c .)" -gt 50 ]

  # G-RH01 ist ein stabiler Anker (goals.md deklariert G-RH01..G-RH07 als solche)
  printf '%s\n' "$doc"  | grep -qx 'G-RH01'
  printf '%s\n' "$meas" | grep -qx 'G-RH01'

  # Eine ID mit Ziffer im Präfix MUSS erhalten bleiben — sonst ist die Regex
  # wieder auf das G-[A-Z]+[0-9]+-Muster zurückgefallen.
  printf '%s\n' "$doc"  | grep -qx 'G-K8S01'
  printf '%s\n' "$meas" | grep -qx 'G-K8S01'
  printf '%s\n' "$doc"  | grep -qx 'G-E2E01'
  printf '%s\n' "$meas" | grep -qx 'G-E2E01'
}

@test "jede in goals.md dokumentierte Ziel-ID wird von health-goals-check.sh gemessen" {
  local only_documented
  only_documented="$(comm -23 <(documented_ids) <(measured_ids))"
  if [ -n "$only_documented" ]; then
    echo "Dokumentiert, aber nie gemessen — diese Ziele zeigen dauerhaft einen"
    echo "handgeschriebenen Wert, den niemand nachrechnet:"
    echo "$only_documented"
    echo
    echo "Entweder einen row-Aufruf in scripts/health-goals-check.sh ergänzen"
    echo "oder das Ziel aus .claude/lib/goals.md entfernen."
    return 1
  fi
}

@test "jede von health-goals-check.sh gemessene Ziel-ID ist in goals.md dokumentiert" {
  local only_measured
  only_measured="$(comm -13 <(documented_ids) <(measured_ids))"
  if [ -n "$only_measured" ]; then
    echo "Gemessen, aber nicht dokumentiert — der Wert taucht im Ampel-Report auf,"
    echo "aber weder im Register noch auf dem Dashboard:"
    echo "$only_measured"
    echo
    echo "Ziel in .claude/lib/goals.md ergänzen oder den row-Aufruf entfernen."
    return 1
  fi
}

@test "goals.md führt höchstens 5 Baseline-Update-Einträge (Kappungsregel)" {
  # Ohne Kappung wächst das Register monoton: jeder Fix hängt einen Absatz an,
  # keiner räumt einen ab. Bei der Auslagerung in T002598 waren es 195 Zeilen
  # Chronik in einer 987-Zeilen-Datei.
  local count
  count="$(grep -c '^\*\*Baseline-Update' "$GOALS_MD" || true)"

  # Positiv-Anker: mindestens ein Eintrag MUSS vorhanden sein. Sonst besteht der
  # Test auch dann, wenn das Marker-Format geändert wurde und die Zählung ins
  # Leere greift — dann wäre "0 ≤ 5" ein Scheinerfolg.
  [ "$count" -ge 1 ]
  [ "$count" -le 5 ]
}

@test "die ausgelagerte Chronik existiert und ist von goals.md aus verlinkt" {
  [ -f "$REPO_ROOT/docs/health-goals-history.md" ]
  # Positiv-Anker: die Chronik trägt tatsächlich Einträge, ist also nicht nur ein
  # leerer Platzhalter, der die Kappungsregel formal erfüllt.
  [ "$(grep -c '^\*\*Baseline-Update' "$REPO_ROOT/docs/health-goals-history.md" || true)" -ge 5 ]
  grep -q 'health-goals-history.md' "$GOALS_MD"
}

@test "kein Ziel steht gleichzeitig als H2-Sektion und als Prio-C-Tabellenzeile" {
  # Eine Dublette erzeugt zwei Einträge im generierten Dashboard-Artefakt und lässt
  # health-goals-update.sh nur einen davon fortschreiben — der andere friert ein.
  local h2 prio_c dup
  h2="$(grep -oE '^## G-[A-Z0-9]+' "$GOALS_MD" | sed 's/^## //' | sort -u)"
  prio_c="$(grep -oE '^\| \*\*G-[A-Z0-9]+\*\*' "$GOALS_MD" | grep -oE 'G-[A-Z0-9]+' | sort -u)"

  # Positiv-Anker: beide Mengen sind nicht leer, sonst ist die Schnittmenge
  # trivial leer und der Test vakuos.
  [ "$(printf '%s\n' "$h2"     | grep -c .)" -ge 5 ]
  [ "$(printf '%s\n' "$prio_c" | grep -c .)" -ge 20 ]

  dup="$(comm -12 <(printf '%s\n' "$h2") <(printf '%s\n' "$prio_c"))"
  if [ -n "$dup" ]; then
    echo "Doppelt geführt (H2-Sektion UND Prio-C-Zeile):"
    echo "$dup"
    return 1
  fi
}
