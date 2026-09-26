#!/usr/bin/env bats
# T003203 — kein Loadout-Port ist zugleich lokale Seite eines Port-Forwards.
#
# PRUEFMODUS: Querschnitts-Konsistenz zwischen Deklarationen (die in CLAUDE.md benannte
# Ausnahme zu T002448-M4). Die Invariante existiert nicht im Laufzeitverhalten einer
# Komponente, sondern in der Beziehung mehrerer Quellen: loadouts.json sagt, worauf
# llama-server lauscht; die .service-Dateien sagen, welche lokalen Ports kubectl belegt.
#
# KEINE LAUFZEITPRUEFUNG: Es waere naheliegend, die echte Portbelegung per `ss` zu lesen.
# In CI laeuft aber kein kubectl-Forward; der Test wuerde dort skippen und damit die
# Ausstattung des Runners messen statt den Zustand des Codes (T002716).
#
# KEINE EINDEUTIGKEITS-PRUEFUNG AUF LOADOUT-PORTS: Loadouts derselben exclusiveGroup
# duerfen sich einen Port teilen, weil sie nie gleichzeitig laufen. Die Begruendung steht
# in tests/spec/local-llm-proxy/qwen3-coder-loadout.bats. Geprueft wird ausschliesslich
# Loadout GEGEN Port-Forward — die koennen nie koexistieren, weil der Forward permanent
# laeuft.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
  SERVICE_DIRS=(
    "${REPO_ROOT}/scripts/mcp-gateway"
    "${REPO_ROOT}/scripts/semantic-code-search"
  )
}

# Lokale Seite jedes port-forward aus den Unit-Dateien.
# Der Anker ^ExecStart schliesst Kommentarzeilen aus, die denselben Port nennen.
#
# Kein `tr -d '[:space:]'` zum Trimmen: das loescht auch die Zeilenumbrueche und
# verschmilzt Ports zu unbrauchbaren Strings.
forward_ports() {
  for d in "${SERVICE_DIRS[@]}"; do
    grep -h '^ExecStart.*port-forward' "$d"/*.service 2>/dev/null
  done \
    | grep -oE '[0-9]{4,5}:[0-9]{4,5}' \
    | cut -d: -f1 | sort -u
}

@test "T003203: Extraktion liefert ueberhaupt Ports (Anker fuer beide Invarianten)" {
  [ -f "$LOADOUTS" ]

  # POSITIV-ANKER (T002356-M1): Ohne diesen Test bestuenden beide Negativ-Aussagen unten
  # vakuos, sobald ein grep ins Leere laeuft — eine leere Menge schneidet sich mit allem
  # zu nichts. Vergleiche openspec/specs/divergence-guard.md:141.
  run bash -c "jq -r '.loadouts[].port' '$LOADOUTS' | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  fp="$(forward_ports)"
  [ -n "$fp" ]

  # T900191: devmesh-forward lauscht stabil auf 18235 (llm-proxy) und dient als bekannte Probe:
  # findet die Extraktion ihn nicht, ist das Muster kaputt und nicht die Konfiguration.
  echo "$fp" | grep -qx '18235'
}

@test "T003203: kein Loadout-Port ist zugleich lokale Seite eines Port-Forwards" {
  loadout_ports="$(jq -r '.loadouts[].port' "$LOADOUTS" | sort -u)"
  [ -n "$loadout_ports" ]

  overlap="$(comm -12 <(echo "$loadout_ports") <(forward_ports))"

  # Eigentliche Aussage. Bei Verletzung nennt die Meldung den Port, statt nur zu scheitern.
  [ -z "$overlap" ] || {
    echo "Port(s) doppelt beansprucht — Loadout UND Port-Forward: $overlap" >&2
    echo "Betroffene Loadouts:" >&2
    for p in $overlap; do
      jq -r --argjson p "$p" '.loadouts[] | select(.port == $p) | "  \(.slug) → \(.port)"' "$LOADOUTS" >&2
    done
    false
  }
}
