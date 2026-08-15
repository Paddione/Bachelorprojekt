#!/usr/bin/env bats
# T002595: scripts/plan-qa-check.sh baute sein curl-Payload per String-Interpolation.
# Jeder mehrzeilige Plan erzeugte damit ungueltiges JSON ("Invalid control character"),
# der API-Call konnte seit 2026-06-14 nie erfolgreich sein. Aufgefallen ist es nie,
# weil das Skript advisory laeuft (|| true) und auch im Defektfall exit 0 liefert.
#
# Diese Tests sichern den Payload-Bau offline ab: --emit-payload schreibt das Payload
# auf stdout statt es zu senden. Kein Gateway, kein Netz, kein Schluessel noetig.
#
# Pruefmodus: command output verification [T002448-M4] — das Skript wird AUSGEFUEHRT
# und seine Ausgabe geprueft; kein grep auf die Implementierungsquelle.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  QA="$REPO/scripts/plan-qa-check.sh"
}

# mkplan <ziel> — ein Plan mit genau den Zeichen, die die String-Interpolation brach:
# Anfuehrungszeichen, Backticks, Backslashes, Dollar-Zeichen und Zeilenumbrueche.
# Mindestens 10 Zeilen, sonst greift der Kurzplan-Skip des Skripts.
mkplan() {
  cat > "$1" <<'PLANEOF'
---
title: "Fixture — Implementation Plan"
ticket_id: T002595
domains: [test]
status: active
---

# Fixture Implementation Plan

## File Structure

- Modify: `scripts/example.sh`

## Task 1: RED

Der Plan enthaelt ein "Anfuehrungszeichen", einen `Backtick-Span`, einen
Backslash \ und ein $DOLLAR_ZEICHEN — alles Zeichen, die rohe
String-Interpolation in JSON zerbrechen.

Run: `bats tests/unit/example.bats`
Expected: FAIL

## Task 2: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
PLANEOF
}

@test "T002595: --emit-payload erzeugt valides JSON trotz Sonderzeichen im Plan" {
  mkplan "$BATS_TEST_TMPDIR/plan.md"
  run bash "$QA" --emit-payload "$BATS_TEST_TMPDIR/plan.md"
  [ "$status" -eq 0 ]
  # Der eigentliche Regressionsnachweis: das Payload muss parsebar sein.
  echo "$output" | jq -e . >/dev/null
}

@test "T002595: der Planinhalt landet unverfaelscht im Payload" {
  # Positiv-Anker [T002356-M1]: valides JSON allein genuegt nicht — ein Payload,
  # das den Plan gar nicht enthaelt, waere ebenfalls valide und der Test vakuos.
  mkplan "$BATS_TEST_TMPDIR/plan.md"
  run bash "$QA" --emit-payload "$BATS_TEST_TMPDIR/plan.md"
  [ "$status" -eq 0 ]

  local user_content
  user_content=$(echo "$output" | jq -r '[.messages[] | select(.role=="user") | .content] | first')
  [ -n "$user_content" ]
  grep -q 'Anfuehrungszeichen' <<<"$user_content"
  grep -q 'Backtick-Span'      <<<"$user_content"
  grep -q 'DOLLAR_ZEICHEN'     <<<"$user_content"
}

@test "T002595: der System-Prompt traegt Kriterium 6 vollstaendig" {
  # D1: `< file` im doppelt gequoteten SYSTEM_PROMPT wurde als Command Substitution
  # ausgefuehrt; der Hinweis fiel als Leerstring aus dem Prompt. stdin-Umleitung ist
  # das Beispiel, das im Text stehen MUSS.
  mkplan "$BATS_TEST_TMPDIR/plan.md"
  run bash "$QA" --emit-payload "$BATS_TEST_TMPDIR/plan.md"
  [ "$status" -eq 0 ]

  local sys
  sys=$(echo "$output" | jq -r '[.messages[] | select(.role=="system") | .content] | first')
  [ -n "$sys" ]
  # Positiv-Anker: der Prompt traegt ueberhaupt die Kriterienliste.
  grep -q 'Kriterien' <<<"$sys"
  # Die Aussage: das Beispiel zur stdin-Umleitung ist noch da.
  grep -q '< file' <<<"$sys"
}

@test "T002595: --emit-payload gibt kein Kommando-Ergebnis statt Prompttext aus" {
  # Negativprobe zu D1: bei aktiver Command Substitution erschien die Ausgabe von
  # `file` (bzw. ein Leerstring) im Prompt und bash meldete auf stderr.
  mkplan "$BATS_TEST_TMPDIR/plan.md"
  run bash "$QA" --emit-payload "$BATS_TEST_TMPDIR/plan.md"
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst: der Lauf liefert ueberhaupt ein Payload.
  echo "$output" | jq -e '.messages | length > 0' >/dev/null
  # Die Negativ-Aussage.
  ! grep -q 'No such file or directory' <<<"$output"
}

@test "T002595: Payload nennt das Gateway-Modell und deaktiviert Thinking" {
  # Die Gemma-Loadouts liefern ohne enable_thinking:false ein leeres content-Feld
  # (finish_reason=length, Budget im reasoning verbraucht) — gemessen 2026-08-03.
  # Das Flag ist damit Funktionsbedingung, nicht Optimierung.
  #
  # [T003538] Der Modellname wird NICHT mehr als Literal gepinnt. Hier stand
  # '.model == "gemma26-factory"'; die ID war zu dem Zeitpunkt bereits tot (Loadout
  # aktiviert, Backend nicht geladen), und der Test schrieb sie als Sollzustand fest.
  # Ein Modellwechsel soll moeglich bleiben — geprueft wird die Semantik: das Payload
  # traegt UEBERHAUPT ein Modell, und dieses kommt aus PLAN_QA_MODEL. Damit belegt der
  # Test die Verdrahtung statt den Tageswert (Konvention "Semantik statt Darstellung",
  # T002716).
  mkplan "$BATS_TEST_TMPDIR/plan.md"

  run bash "$QA" --emit-payload "$BATS_TEST_TMPDIR/plan.md"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.model | type == "string" and length > 0' >/dev/null
  echo "$output" | jq -e '.enable_thinking == false' >/dev/null
  echo "$output" | jq -e '.chat_template_kwargs.enable_thinking == false' >/dev/null

  # Gegenprobe: der Wert stammt tatsaechlich aus PLAN_QA_MODEL und ist nicht
  # irgendwo im Skript festverdrahtet.
  run env PLAN_QA_MODEL=pruefmodell-xyz bash "$QA" --emit-payload "$BATS_TEST_TMPDIR/plan.md"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.model == "pruefmodell-xyz"' >/dev/null
}

# T007067 (Mishap 6, 2026-08-15): plan-qa-check bewertete Index+Partials-Plaene
# als FAIL, weil die eigentliche Arbeit in tasks.d/pX-*.md steht, die das Skript
# nicht in den QA-Prompt einlas — waehrend plan-lint.sh die Partials korrekt
# einbezieht (PASS). Fix: die Partials werden an den Payload-Content angehaengt,
# wenn neben der tasks.md ein tasks.d/-Verzeichnis liegt (T002074-Struktur).
# Ohne tasks.d/ bleibt der Modus byte-identisch zum Single-Plan-Fall.
@test "T007067: Index+Partials-Plan — tasks.d/ wird in den Payload eingelesen" {
  local plan_dir="$BATS_TEST_TMPDIR/index-plan"
  mkdir -p "$plan_dir/tasks.d"
  mkplan "$plan_dir/tasks.md"

  # Partials-Manifest-Zeile + Partial-Datei anlegen (T002074-Konvention).
  cat >> "$plan_dir/tasks.md" <<'MANIFEST'

## Partials

| id  | Datei | Rolle  | Ziel-Dateien |
|-----|-------|--------|--------------|
| p1  | tasks.d/p1-impl.md | impl | scripts/example.sh |
MANIFEST

  cat > "$plan_dir/tasks.d/p1-impl.md" <<'PARTIAL'
# Partial p1 — Implementierung

Konkreter Dateipfad: `scripts/example.sh`, Budget S1: Ist 42 - Baseline 10 -> Budget 32.

Test-Schritt: `bats tests/unit/example.bats`
PARTIAL

  run bash "$QA" --emit-payload "$plan_dir/tasks.md"
  [ "$status" -eq 0 ]

  local user_content
  user_content=$(echo "$output" | jq -r '[.messages[] | select(.role=="user") | .content] | first')
  # Der Partial-Inhalt ist im Prompt (das ist die T007067-Erwartung).
  grep -q 'tasks.d/p1-impl.md' <<<"$user_content"
  grep -q 'Budget S1' <<<"$user_content"
  # Der Index selbst ist weiterhin enthalten (kein Ersatz, nur Anhaengen).
  grep -q 'Fixture Implementation Plan' <<<"$user_content"
}

@test "T007067: Single-Plan ohne tasks.d/ bleibt unveraendert (kein Partials-Anhang)" {
  mkplan "$BATS_TEST_TMPDIR/plan.md"
  run bash "$QA" --emit-payload "$BATS_TEST_TMPDIR/plan.md"
  [ "$status" -eq 0 ]

  local user_content
  user_content=$(echo "$output" | jq -r '[.messages[] | select(.role=="user") | .content] | first')
  # Kein Partials-Anhang eingeschleust.
  ! grep -q '--- Partial:' <<<"$user_content"
}
