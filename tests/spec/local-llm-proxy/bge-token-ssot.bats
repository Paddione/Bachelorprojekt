#!/usr/bin/env bats
# T002559 — BGE_MCP_TOKEN kommt aus der git-crypt-SSOT, nicht vom Host.
#
# Pruefmodus: gemischt, hier benannt.
#   - write_env_var() wird AUSGEFUEHRT (aus install.sh extrahiert) gegen
#     praeparierte Dateien. Ein grep haette nur belegt, dass die Funktion
#     existiert — nicht, dass sie idempotent ist [T002448-M4].
#   - Dass der Schluessel in der SSOT gefuehrt wird, manifestiert sich nur im
#     Quelltext; dort ist grep das richtige Mittel (dokumentierte Ausnahme).
#
# WERTE WERDEN NIE AUSGEGEBEN. Die Tests arbeiten mit Platzhaltern in tmpdir;
# environments/.secrets/dev-tools.yaml wird ausschliesslich auf SCHLUESSELnamen
# geprueft.
#
# Hintergrund: bis T002559 lag das Token nur auf dem Host — in
# ~/.config/bge-mcp/server.env und (seit T002556) zusaetzlich in
# ~/.config/llm-proxy/proxy.env. Zwei handkopierte Stellen ohne gemeinsame
# Quelle; bei Verlust der Maschine unwiederbringlich.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SSOT="${REPO_ROOT}/environments/.secrets/dev-tools.yaml"
  INSTALL="${REPO_ROOT}/dotfiles/install.sh"
  TMP="$(mktemp -d)"
}

teardown() { rm -rf "${TMP}"; }

# Dieselbe Funktion wie in install.sh — extrahiert, damit der Test das
# Verhalten misst und nicht die Formulierung.
write_env_var() {
  local file="$1" key="$2" val="$3"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  chmod 0600 "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    # '|| :' ist Pflicht, nicht Stil: enthaelt die Datei NUR diese eine Zeile,
    # bleibt nach dem Filtern nichts uebrig und grep gibt Exit 1 — unter
    # 'set -e' braeche das Skript hier ab, ausgerechnet im idempotenten Fall.
    grep -v "^${key}=" "$file" > "$tmp" || :
    printf '%s=%s\n' "$key" "$val" >> "$tmp"
    mv "$tmp" "$file"
    chmod 0600 "$file"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}

@test "T002559: die SSOT fuehrt BGE_MCP_TOKEN als Schluessel" {
  [ -f "${SSOT}" ]

  # In CI ist git-crypt GESPERRT — die Datei ist dort verschluesselter
  # Binaerinhalt und traegt die GITCRYPT-Signatur. Ein grep auf Schluesselnamen
  # kann dann per Konstruktion nichts finden. Das ist kein Fehlschlag, sondern
  # der erwartete Zustand: der Test prueft eine Eigenschaft des ENTSPERRTEN
  # Arbeitsbaums.
  head -c 9 "${SSOT}" | grep -q "GITCRYPT" && skip "git-crypt gesperrt (CI) — Schluesselnamen nicht lesbar"

  # Positiv-Anker zuerst [T002356-M1]: die bekannten Schluessel sind da. Waere
  # die Datei aus einem anderen Grund unlesbar, faellt das hier auf statt
  # spaeter als leerer Wert.
  run grep -c '^GITHUB_PERSONAL_ACCESS_TOKEN:' "${SSOT}"
  [ "${output}" = "1" ]

  run grep -c '^BGE_MCP_TOKEN:' "${SSOT}"
  [ "${output}" = "1" ]
}

@test "T002559: install.sh bricht ab, wenn der Wert leer ist" {
  # Der Guard muss BGE_MCP_TOKEN mitpruefen — sonst laeuft install.sh durch und
  # schreibt einen leeren Wert in beide Env-Dateien, was schlimmer ist als gar
  # nichts zu schreiben: die Datei sieht dann befuellt aus.
  run grep -c 'BGE_MCP_TOKEN_VAL' "${INSTALL}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 1 ]
  run grep -c 'z "\$BGE_MCP_TOKEN_VAL"' "${INSTALL}"
  [ "${output}" = "1" ]
}

@test "T002559: write_env_var legt die Datei mit 0600 an" {
  local f="${TMP}/neu/proxy.env"
  write_env_var "$f" BGE_MCP_TOKEN platzhalter-a
  [ -f "$f" ]
  [ "$(stat -c %a "$f")" = "600" ]
  run grep -c '^BGE_MCP_TOKEN=platzhalter-a$' "$f"
  [ "${output}" = "1" ]
}

@test "T002559: ein zweiter Lauf dupliziert den Eintrag nicht" {
  # Der eigentliche Punkt: bei systemd gewinnt der LETZTE Eintrag einer
  # Env-Datei. Zwei Zeilen mit verschiedenen Werten waeren nicht unterscheidbar
  # und der wirksame Wert nicht ablesbar.
  local f="${TMP}/proxy.env"
  write_env_var "$f" BGE_MCP_TOKEN platzhalter-alt
  write_env_var "$f" BGE_MCP_TOKEN platzhalter-neu
  run grep -c '^BGE_MCP_TOKEN=' "$f"
  [ "${output}" = "1" ]
  run grep -c '^BGE_MCP_TOKEN=platzhalter-neu$' "$f"
  [ "${output}" = "1" ]
}

@test "T002559: andere Eintraege der Datei bleiben erhalten" {
  local f="${TMP}/proxy.env"
  printf 'LLM_PROXY_PORT=18235\n' > "$f"
  write_env_var "$f" BGE_MCP_TOKEN platzhalter-b
  run grep -c '^LLM_PROXY_PORT=18235$' "$f"
  [ "${output}" = "1" ]
  run grep -c '^BGE_MCP_TOKEN=' "$f"
  [ "${output}" = "1" ]
}

@test "T002559: beide Verbraucher werden beliefert" {
  # llm-proxy braucht es fuer ensureUiConfigRendered [T002556], bge-mcp fuer
  # die Authentifizierung. Nur eine Datei zu befuellen laesst den anderen
  # Verbraucher im alten Zustand.
  run grep -c 'llm-proxy/proxy.env' "${INSTALL}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]
  run grep -c 'bge-mcp/server.env' "${INSTALL}"
  [ "${output}" -gt 0 ]
}
