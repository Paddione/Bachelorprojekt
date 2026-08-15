#!/usr/bin/env bats
# tests/spec/local-llm-proxy/support-model-slots.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T006840
#
# SICHERT: die beiden Unterstuetzermodelle aus E6 des Designs
# 2026-08-15-laptop-bge-topologie (T006143) — Gemma-4-12B UD-IQ3_XXS
# (~4,64 GB, PK-Tablet) und Qwen3.5-4B Q6_K (~3,3 GB, PK-L-1) — sind als
# benannte Slots im "lmstudio"-Provider-Block von .opencode/agent-models.jsonc
# registriert und ueber den llm-proxy (:18235) sichtbar. Die Eintraege folgen
# dem Muster qwen3-14b@q4_k_m: name + limit ohne baseURL; die Slots werden ueber
# den Proxy erreicht, nie direkt ueber ein Backend (D1/D3 aus design.md).
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4):
# - Testfaelle 1 und 2: Quelltext-Lint auf eine Konfigurationsdatei — die
#   dokumentierte Ausnahme, denn der Pruefgegenstand IST der Dateiinhalt von
#   .opencode/agent-models.jsonc (dasselbe Muster wie gateway-consumer-lint.bats).
# - Testfall 3: ERGEBNIS-basiert — der Test fragt die echte Discovery
#   :18235/v1/models des laufenden llm-proxy ab und bewertet die Modellliste.
#
# SKIP-GUARD (T002716): CI hat weder Geraete noch Proxy — dort skippt nur
# Testfall 3. Die rot->gruen-Entscheidung dieses Changes tragen die Testfaelle
# 1 und 2, die ohne laufenden Proxy auskommen. Testfall 3 skippt ausserdem,
# wenn der Proxy zwar antwortet, aber keine lmstudio-Modelle meldet (Geraete
# offline — die Liste traegt dann keinen Aussagewert; tasks.md Fix-Step:
# "der Erreichbarkeits-Check skippt, wenn llm-proxy oder Geraete offline sind").
#
# D1-LIVE-CHECK (design.md D1, Mess-Konvention T002717): Stand 2026-08-15,
# Branch feature/unterstuetzermodelle-inbetriebnahme-T006840 (vor p1):
#   curl -s --max-time 10 http://127.0.0.1:18235/v1/models | jq -r '.data[].id'
#   -> deepseek-v4-flash, deepseek-v4-pro (2 Modelle) — KEINE lmstudio-Modelle:
#   die Geraete (PK-Tablet, PK-L-1) sind offline, LM Link nicht verbunden.
# Weicht die spaeter gemeldete Discovery-ID von einem Slot-Namen ab, folgt der
# Eintrag in agent-models.jsonc (Key + name-Feld) der gemeldeten ID — und damit
# der erwartete String in Testfall 3 (D1).
#
# GEMESSEN-FOLGE (D3, P2.5): dieser Guard prueft bewusst nur die Slot-
# DEKLARATION, nicht die limit-Werte. Nach dem Vulkan-Messschritt (K3,
# User-Task in T006840, Ergebnis als Ticket-Kommentar mit ausfuehrbarem
# Mess-Befehl) wird die Datei um eine GEMESSEN-Limit-Pruefung erweitert.

setup() {
  load helpers/llm-endpoint
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MODEL_FILE="${REPO_ROOT}/.opencode/agent-models.jsonc"
  PROXY_URL="${LLM_PROXY_URL:-http://127.0.0.1:18235}"
}

# Der "lmstudio"-Provider-Block von MODEL_FILE, eingegrenzt (T003104 — keine
# Positionsmessung des ersten Zufallstreffers im ganzen Dokument): von der
# Zeile '"lmstudio": {' bis zur ersten schliessenden Klammer mit 4 Leerzeichen
# Einrueckung (die Provider-Klammer; Ist-Stand 2026-08-15: Zeile 272, die
# models-Klammer steht mit 6 Leerzeichen und faellt nicht darunter). Andere
# Provider-Bloecke desselben Dokuments bleiben aussen vor.
lmstudio_block() {
  awk '
    /"lmstudio": \{/ { in_block = 1 }
    in_block && /^[[:space:]]{4}\}/ { print; exit }
    in_block { print }
  ' "$MODEL_FILE"
}

# Ein einzelner Slot-Eintrag (gezielte Negativ-Aussage in Testfall 2): von der
# Slot-Key-Zeile '"<key>": {' bis zur ersten schliessenden Klammer mit 8
# Leerzeichen Einrueckung (die Eintrag-Klammer; die limit-Klammer steht mit 10
# Leerzeichen — Ist-Stand 2026-08-15 verifiziert). index() statt Regex, damit
# Punkt und @ im Slot-Namen nicht als Regex-Metazeichen wirken.
slot_entry() {
  local key="$1"
  awk -v key="$key" '
    index($0, "\"" key "\": {") { in_entry = 1 }
    in_entry && /^[[:space:]]{8}\}/ { print; exit }
    in_entry { print }
  ' "$MODEL_FILE"
}

# Skippt, wenn der Proxy nicht laeuft. Bewusst ueber den HTTP-Status und nicht
# ueber den curl-Exit-Code (siehe Kopfkommentar in helpers/llm-endpoint.bash).
# Muster uebernommen aus bge-role-routes.bats (T003205).
_require_proxy() {
  local code
  if ! code=$(llm_endpoint_healthy "${PROXY_URL}/v1/models" 5); then
    skip "llm-proxy auf ${PROXY_URL} nicht erreichbar (HTTP ${code}) — kein Aussagewert"
  fi
}

@test "T006840: lmstudio-Slots gemma-4-12b@ud-iq3_xxs und qwen3.5-4b@q6_k sind deklariert" {
  local block active
  block="$(lmstudio_block)"
  active="$(printf '%s\n' "$block" | grep -vE '^[[:space:]]*(#|//)' || true)"

  # Trefferzahl == 1 je Slot im aktiven Text des lmstudio-Blocks (formatfrei,
  # T002716); -e statt -F '--flag'-Muster (T003108).
  run bash -c "printf '%s' '$active' | grep -ce '\"gemma-4-12b@ud-iq3_xxs\"' || true"
  [ "$output" -eq 1 ]

  run bash -c "printf '%s' '$active' | grep -ce '\"qwen3.5-4b@q6_k\"' || true"
  [ "$output" -eq 1 ]
}

@test "T006840: die neuen Slot-Eintraege enthalten keine Backend-Port-Literale" {
  # Positiv-Anker ZUERST (T002356-M1): beide Slots sind deklariert — ohne den
  # Anker waere "kein Port-Literal in []" trivial erfuellt, sobald die Slots
  # fehlen und die Kandidatenmenge leer bleibt.
  local block active
  block="$(lmstudio_block)"
  active="$(printf '%s\n' "$block" | grep -vE '^[[:space:]]*(#|//)' || true)"
  run bash -c "printf '%s' '$active' | grep -ce '\"gemma-4-12b@ud-iq3_xxs\"' || true"
  [ "$output" -eq 1 ]
  run bash -c "printf '%s' '$active' | grep -ce '\"qwen3.5-4b@q6_k\"' || true"
  [ "$output" -eq 1 ]

  # Negativ-Aussage, GEZIELT auf die zwei neuen Eintraege (nicht auf die ganze
  # Datei — die deckt der gateway-consumer-lint T002582 bereits global ab).
  # Kommentarzeilen ausgeschlossen. Begruendung: die Provider-Definition mit
  # baseURL lebt in .opencode/opencode.jsonc und ist keine tracked surface; die
  # Eintraege hier bleiben portfrei (erreicht ueber den llm-proxy :18235, nie
  # direkt ueber ein Backend).
  local entries
  entries="$(slot_entry 'gemma-4-12b@ud-iq3_xxs' | grep -vE '^[[:space:]]*(#|//)'; slot_entry 'qwen3.5-4b@q6_k' | grep -vE '^[[:space:]]*(#|//)')"

  run bash -c "printf '%s' '$entries' | grep -cE ':1234|:8093' || true"
  [ "$output" -eq 0 ]
}

@test "T006840: beide lmstudio-Slots erscheinen in der llm-proxy-Discovery (:18235/v1/models)" {
  _require_proxy

  run curl -s --max-time 10 "${PROXY_URL}/v1/models"
  [ "$status" -eq 0 ]
  run bash -c "printf '%s' '$output' | jq -r '.data[].id'"
  [ "$status" -eq 0 ]
  local ids="$output"

  # Geraete-offline-Skip (tasks.md Fix-Step: der Check skippt, wenn llm-proxy
  # ODER Geraete offline sind). Antwortet der Proxy, ohne dass ein lmstudio-Slot
  # in der Discovery erscheint, sind die Geraete nicht verbunden — die Liste
  # traegt keinen Aussagewert. Erscheint mindestens ein Slot, wird
  # weitergesprueft: der Halb-Online-Fall bleibt rot.
  if ! grep -qe 'gemma-4-12b@ud-iq3_xxs' -e 'qwen3.5-4b@q6_k' <<<"$ids"; then
    skip "keine lmstudio-Modelle in der Discovery — Geraete offline, kein Aussagewert"
  fi

  # Substring-Vergleich (formatfrei, T002716): LM Studio kann die IDs mit
  # Datei-/Repo-Praefix melden (z. B. lmstudio-community/...).
  run bash -c "printf '%s' '$ids' | grep -ce 'gemma-4-12b@ud-iq3_xxs' || true"
  [ "$output" -eq 1 ]

  run bash -c "printf '%s' '$ids' | grep -ce 'qwen3.5-4b@q6_k' || true"
  [ "$output" -eq 1 ]
}
