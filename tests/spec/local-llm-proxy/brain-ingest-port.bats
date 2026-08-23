#!/usr/bin/env bats
# T003203 — brain-ingest darf keinen Port beanspruchen, auf dem ein Port-Forward lauscht,
# und muss denselben Port in allen drei Deklarationen nennen.
#
# PRUEFMODUS: Querschnitts-Konsistenz zwischen Deklarationen (die in CLAUDE.md benannte
# Ausnahme zu T002448-M4). Die Invariante existiert nicht im Laufzeitverhalten einer
# Komponente, sondern in der Beziehung mehrerer Quellen: loadouts.json sagt, worauf
# llama-server lauscht; die .service-Dateien sagen, welche lokalen Ports kubectl belegt;
# brain-ingest.sh sagt, wohin es sendet. Laufen sie auseinander, spricht der Ingest mit
# dem falschen Dienst — und zwar ohne Fehler an der Stelle, an der man sucht.
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
  INGEST_SH="${REPO_ROOT}/scripts/brain-ingest.sh"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-10-brain-ingest-port.sql"
  SERVICE_DIR="${REPO_ROOT}/scripts/bge-mcp"
  SLUG="brain-ingest"
  BACKEND="llamacpp-bonsai"
}

# Lokale Seite jedes port-forward aus den Unit-Dateien.
# Der Anker ^ExecStart schliesst Kommentarzeilen aus, die denselben Port nennen.
#
# Kein `tr -d '[:space:]'` zum Trimmen: das loescht auch die Zeilenumbrueche und
# verschmilzt "8081\n8093" zu "80818093" — die Extraktion liefert dann genau eine
# unbrauchbare Zeile statt zwei Ports. Aufgefallen ist das nur, weil der Anker-Test
# unten den bekannten Port 8081 verlangt; die Disjunktheitspruefung selbst war dabei
# gruen, obwohl 8093 doppelt belegt war (leere Menge schneidet sich mit allem zu nichts).
forward_ports() {
  grep -h '^ExecStart.*port-forward' "${SERVICE_DIR}"/*.service 2>/dev/null \
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

  # Der Embed-Forward ist stabil auf 8081 und dient als bekannte Probe: findet die
  # Extraktion ihn nicht, ist das Muster kaputt und nicht die Konfiguration.
  echo "$fp" | grep -qx '8081'
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

@test "T003203: brain-ingest nennt denselben Port in Loadout, Skript und Migration" {
  [ -f "$INGEST_SH" ]
  [ -f "$MIGRATION" ]

  loadout_port="$(jq -r --arg s "$SLUG" '.loadouts[] | select(.slug == $s) | .port' "$LOADOUTS")"
  [[ "$loadout_port" =~ ^[0-9]+$ ]]

  # T014339: Das Loadout ist stillgelegt (enabled:false) — brain-ingest.sh spricht
  # seither die FreeToken-native Engine an, nicht mehr den lokalen GGUF-Server.
  # Die Drei-Wege-Gleichheit ist dann keine Invariante mehr, sondern das Gegenteil:
  # das Skript DARF den toten Port nicht mehr nennen. Geprueft wird deshalb
  # fallweise, mit demselben Positiv-Anker je Quelle.
  loadout_enabled="$(jq -r --arg s "$SLUG" \
    '.loadouts[] | select(.slug == $s) | if has("enabled") then (.enabled|tostring) else "true" end' "$LOADOUTS")"
  [ -n "$loadout_enabled" ]

  # POSITIV-ANKER je Quelle, bevor verglichen wird: zwei leere Zeichenketten sind gleich,
  # der Vergleich waere also auch dann gruen, wenn eine Deklaration ganz fehlte.
  script_port="$(grep -E '^LM_URL=' "$INGEST_SH" \
    | grep -oE '(127\.0\.0\.1|localhost):[0-9]+' | grep -oE '[0-9]+$' | head -1)"
  [ -n "$script_port" ]

  migration_port="$(grep -F "'${BACKEND}'" "$MIGRATION" \
    | grep -oE 'http://127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' | head -1)"
  [ -n "$migration_port" ]

  if [ "$loadout_enabled" = "true" ]; then
    [ "$loadout_port" = "$script_port" ]
    [ "$loadout_port" = "$migration_port" ]
  else
    [ "$loadout_port" != "$script_port" ] || {
      echo "brain-ingest.sh zeigt weiter auf den stillgelegten Loadout-Port $loadout_port" >&2
      false
    }
  fi
}

@test "T003203: die Migration laesst llamacpp-bonsai deaktiviert" {
  [ -f "$MIGRATION" ]

  # Positiv-Anker: die Backend-Zeile muss ueberhaupt existieren.
  run grep -cF "'${BACKEND}'" "$MIGRATION"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # T003202: solange der Readiness-Widerspruch offen ist, darf kein weiteres
  # priority=1-Backend dauerhaft degraded gemeldet werden.
  run bash -c "grep -F \"'${BACKEND}'\" '$MIGRATION' | grep -c 'true'"
  [ "$output" -eq 0 ]
}

# T013593 — die Task-Defaults sind die vierte Deklaration derselben Wahrheit.
# Der Check oben prueft loadouts.json, brain-ingest.sh und die Migration; der
# Taskfile-Default blieb dabei unsichtbar und zeigte auf einen anderen Port als
# das Loadout. Ein gruener Guard bei falsch laufendem Ingest ist schlimmer als
# gar keiner — er behauptet Konsistenz, die es nicht gibt.
#
# Seit T013593 nennen die Tasks GAR KEINEN Port mehr: der Wrapper
# scripts/brain-ingest-swap.sh liest ihn aus loadouts.json. Die gepruefte Menge
# ist im Normalfall also leer, und der Test ist ein Regressionsschutz gegen das
# Wiedereinfuehren eines zweiten Port-Defaults. Genau dafuer steht der
# Positiv-Anker davor: er belegt, dass die drei Tasks ueberhaupt existieren,
# sodass die leere Menge "kein fremder Port" heisst und nicht "kein Taskfile".
@test "T013593: kein brain:ingest-Task nennt einen anderen Port als das Loadout" {
  TASKFILE="${REPO_ROOT}/taskfiles/Taskfile.brain.yaml"
  [ -f "$TASKFILE" ]

  loadout_port="$(jq -r --arg s "$SLUG" '.loadouts[] | select(.slug == $s) | .port' "$LOADOUTS")"
  [[ "$loadout_port" =~ ^[0-9]+$ ]]

  # POSITIV-ANKER: die ingest-Tasks muessen ueberhaupt existieren. Ohne diesen
  # Beleg bestuende die Aussage unten auch dann, wenn der Taskfile leer waere.
  run grep -cE '^\s{2}ingest:(run|pilot|dry):' "$TASKFILE"
  [ "$status" -eq 0 ]
  [ "$output" -eq 3 ]

  # Jeder in den Tasks genannte lokale Backend-Port muss der Loadout-Port sein.
  foreign="$(grep -oE 'LM_STUDIO_URL="\$\{LM_STUDIO_URL:-http://(127\.0\.0\.1|localhost):[0-9]+' "$TASKFILE" \
    | grep -oE '[0-9]+$' | sort -u | grep -v "^${loadout_port}$" || true)"

  [ -z "$foreign" ] || {
    echo "Taskfile.brain.yaml nennt Port(s) $foreign, das brain-ingest-Loadout aber $loadout_port" >&2
    grep -nE 'LM_STUDIO_URL=' "$TASKFILE" >&2
    false
  }
}
