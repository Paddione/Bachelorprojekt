#!/usr/bin/env bats

# Prüfmodus: Output-Verifikation (Test 1) — führt gitleaks tatsächlich gegen
# eine Fixture aus und prüft dessen Ergebnis. Source-Inspektion (Test 2) —
# Konfigurations-Konvention, deren Ergebnis sich ausschließlich im Dateitext
# manifestiert (T002448-M4-Ausnahme für Querschnittstests).
#
# Hintergrund: T004808 — der Alibaba-Token-Plan-Key (Format "sk-sp-…") stand
# plaintext in .opencode/agent-models.jsonc. Die Repo-gitleaks-Config mit
# schmalen Custom-Regeln (openai-api-key = sk-[A-Za-z0-9]{20,}) matcht das
# Format wegen Punkten/Bindestrichen nicht; Default-gitleaks fängt es über
# generic-api-key. Test 1 stellt sicher, dass die Config das Format erfasst;
# Test 2, dass der Key nicht erneut ins Repo gelangt. Der fail-closed-Gate in
# CI ist der security-scan-Job — dort läuft gitleaks mit genau dieser Config.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GITLEAKS_CONFIG="$REPO_ROOT/.gitleaks.toml"
}

teardown() {
  # Cleanup der Fixture-Kopie in /dev/shm. Bewusst teardown() statt
  # 'trap ... EXIT' im Testkoerper: bats-core ueberschreibt den EXIT-trap
  # (bats-exec-test) — der trap wuerde nie feuern und jeder Lauf leakte ein
  # alk.*-Verzeichnis nach /dev/shm. teardown() laeuft bei Pass UND Fail.
  # if-Block statt '&&'-Einzeiler: eine false-Bedingung als letzte Zeile der
  # Funktion endet mit Exit 1 und bats faerbt den Test als teardown-Fehler,
  # obwohl die Testlogik gruen war (beobachtet am 2026-08-18).
  if [ -n "${SCAN_DIR:-}" ]; then
    rm -rf "$SCAN_DIR"
  fi
}

@test "gitleaks-Config erfasst das Alibaba-Token-Format (sk-separated-api-key)" {
  command -v gitleaks >/dev/null || skip "gitleaks nicht installiert (CI: security-scan-Job deckt den Scan ab)"

  # Positiv-Anker: ein plaintext-Key im sk-sp-…-Format MUSS einen Fund auslösen.
  # Die Fixture liegt im allowlisted Pfad tests/spec/security/fixtures/ (der
  # Repo-Scan soll sie nicht sehen). Für den Scan wird sie in ein Verzeichnis
  # OHNE 'tmp' im Pfad kopiert [T011580]: Seit T002554 matcht die Allowlist
  # ".*tmp.*" auch $BATS_TEST_TMPDIR (unter /tmp) — dort wurde der Fund
  # allowlisted und der Test lief vakuos rot (gitleaks Exit 0 statt 1).
  # /dev/shm (tmpfs ausserhalb des Repos) matcht kein Allowlist-Muster und
  # taucht nie im --no-git-Arbeitsbaum-Scan des Pre-Commit-Hooks auf.
  [ -d /dev/shm ] || skip "kein /dev/shm vorhanden — Test braucht einen Scan-Pfad ohne 'tmp'-Segment"
  SCAN_DIR="$(mktemp -d /dev/shm/alk.XXXXXX)"
  cp "$REPO_ROOT/tests/spec/security/fixtures/alibaba-token-key-leak.txt" "$SCAN_DIR/"
  run gitleaks detect --config "$GITLEAKS_CONFIG" --no-git \
    --source "$SCAN_DIR/alibaba-token-key-leak.txt" 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"leaks found"* ]]
}

@test "agent-models.jsonc enthält keinen plaintext sk-API-Key" {
  AGENT_MODELS="$REPO_ROOT/.opencode/agent-models.jsonc"

  # Positiv-Anker: der alibaba-intl-Provider ist definiert.
  grep -q '"alibaba-intl"' "$AGENT_MODELS"

  # Negativ: kein sk-…-Token und kein apiKey-Feld mit sk-…-Wert mehr im Repo.
  ! grep -Eq 'sk-[A-Za-z0-9._-]{20,}' "$AGENT_MODELS"
  ! grep -Eq '"apiKey"[[:space:]]*:[[:space:]]*"sk-' "$AGENT_MODELS"
}
