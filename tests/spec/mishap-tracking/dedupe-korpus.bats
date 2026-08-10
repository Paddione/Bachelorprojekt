#!/usr/bin/env bats
#
# Spec: openspec/specs/mishap-tracking.md — "Dublettenerkennung vergleicht
# Komponente und Dateipfade, nicht nur Titel" [T003120 / T003117]
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4). Der Test ruft
# `ticket.sh find-similar --corpus <fixture>` AUF und misst dessen Ausgabe.
# Er greppt nicht die Implementierung.
#
# Der Korpus ist versioniert (tests/fixtures/mishap-dedupe-korpus.json) und
# wurde einmalig aus der Ticket-DB extrahiert. Der Test oeffnet KEINE
# Datenbankverbindung und legt keine Tickets an.
#
# Zusicherungen haengen an der Semantik (welche Paare gemeldet werden), nicht
# an der Darstellung: `grep -qF` ohne Zeilenanker, kein festgeschriebenes
# Ausgabeformat (T002716).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CORPUS="${REPO_ROOT}/tests/fixtures/mishap-dedupe-korpus.json"
  [ -f "$CORPUS" ] || skip "Fixture-Korpus fehlt: $CORPUS"
  command -v jq >/dev/null 2>&1 || skip "jq not installed"
}

# Meldet find-similar das Paar (a,b)? Richtungsunabhaengig.
pair_reported() {
  local out="$1" a="$2" b="$3"
  while IFS= read -r line; do
    if grep -qF "$a" <<<"$line" && grep -qF "$b" <<<"$line"; then
      return 0
    fi
  done <<<"$out"
  return 1
}

@test "T003117: find-similar meldet alle neun verifizierten Dublettenpaare des Korpus" {
  run bash "${REPO_ROOT}/scripts/ticket.sh" find-similar --corpus "$CORPUS"
  [ "$status" -eq 0 ]

  # POSITIV-ANKER und eigentliche Zusicherung in einem: bleibt die Kandidaten-
  # liste leer, faellt der Test — "keine Fehlalarme" kann hier nicht vakuos
  # erfuellt werden (T002356-M1).
  local missing=0
  while IFS=$'\t' read -r a b; do
    if ! pair_reported "$output" "$a" "$b"; then
      echo "NICHT gemeldet: $a / $b" >&2
      missing=$((missing + 1))
    fi
  done < <(jq -r '.expected_duplicates[] | @tsv' "$CORPUS")

  echo "$output" >&2
  [ "$missing" -eq 0 ]
}

@test "T003117: find-similar meldet die drei verifizierten Nicht-Dublettenpaare nicht" {
  run bash "${REPO_ROOT}/scripts/ticket.sh" find-similar --corpus "$CORPUS"
  [ "$status" -eq 0 ]

  # Positiv-Anker: mindestens ein echtes Dublettenpaar muss gemeldet sein,
  # sonst waere die Negativ-Aussage trivial erfuellt.
  local first_a first_b
  first_a="$(jq -r '.expected_duplicates[0][0]' "$CORPUS")"
  first_b="$(jq -r '.expected_duplicates[0][1]' "$CORPUS")"
  pair_reported "$output" "$first_a" "$first_b"

  local false_positives=0
  while IFS=$'\t' read -r a b; do
    if pair_reported "$output" "$a" "$b"; then
      echo "FEHLALARM: $a / $b" >&2
      false_positives=$((false_positives + 1))
    fi
  done < <(jq -r '.expected_distinct[] | @tsv' "$CORPUS")

  [ "$false_positives" -eq 0 ]
}

@test "T003120: find-similar kommt ohne Netzzugriff aus (kein Embedding-Dienst noetig)" {
  # Semantische Probe statt Formatprobe: der Aufruf muss auch dann erfolgreich
  # sein, wenn kein Embedding-Gateway erreichbar ist. Positiv-Anker ist der
  # Exit-Code 0 zusammen mit einer nicht-leeren Kandidatenliste.
  run env BGE_MCP_URL=http://127.0.0.1:1 LLM_GATEWAY_URL=http://127.0.0.1:1 \
    bash "${REPO_ROOT}/scripts/ticket.sh" find-similar --corpus "$CORPUS"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}
