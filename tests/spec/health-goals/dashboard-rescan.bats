#!/usr/bin/env bats
#
# T013306 — Vertrag des Scan-Wrappers scripts/health-goals-scan.sh
#
# Pruefmodus: Output-Verifikation [T002448-M4]. Jeder Test fuehrt den Wrapper
# tatsaechlich aus und prueft dessen Ausgabe bzw. Exit-Status; kein Grep auf
# Implementierungsmuster im Quelltext. JSON wird mit python3 strukturell
# geparst — ein Substring-Match wuerde die Schreibweise statt der Struktur
# bestaetigen.
#
# Ziel-Auswahl nach Laufzeit (p6-Vorgabe): G-CQ06 ist ein reiner Datei-Zaehler
# (grep über components/website/src), G-TEST05 liefert mit --fast den
# SKIP-Sentinel ohne einen Coverage-Lauf zu starten. Kein Cluster, kein Netz,
# keine node_modules.
#
# SSOT-Invariante (REQ-HEALTH-GOALS-011): der Rescan ist read-only gegenüber
# .claude/lib/goals.md und goals-data.generated.json — Fall 5 ist deren
# ausfuehrbare Form.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
  WRAPPER="$REPO_ROOT/scripts/health-goals-scan.sh"
  ARTIFACT="$REPO_ROOT/components/website/src/lib/sdlc/goals-data.generated.json"
  command -v python3 >/dev/null 2>&1 || skip "python3 not installed"
}

@test "messbares Ziel (G-CQ06): exit 0, genau ein Eintrag, measurable true, actual Zahl" {
  run bash "$WRAPPER" G-CQ06
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" > "$BATS_TEST_TMPDIR/out.json"
  python3 - "$BATS_TEST_TMPDIR/out.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert isinstance(data, list), f"Ausgabe ist kein JSON-Array: {type(data)}"
entries = [e for e in data if e.get("id") == "G-CQ06"]
assert len(entries) == 1, f"erwartet genau 1 Eintrag fuer G-CQ06, gefunden {len(entries)}"
e = entries[0]
assert e.get("measurable") is True, f"measurable ist nicht True: {e}"
assert isinstance(e.get("actual"), int), f"actual ist keine Zahl: {e.get('actual')!r}"
PY
}

@test "Positiv-Anker: Anzahl Eintraege == Anzahl angeforderter IDs" {
  run bash "$WRAPPER" G-CQ06 G-TEST05 --fast
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" > "$BATS_TEST_TMPDIR/out.json"
  python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
assert len(data) == 2, f"erwartet 2 Eintraege, gefunden {len(data)}"' "$BATS_TEST_TMPDIR/out.json"
}

@test "nicht messbares Ziel (G-TEST05, --fast): measurable false, kein actual, kein dokumentierter Wert" {
  run bash "$WRAPPER" --fast G-TEST05
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" > "$BATS_TEST_TMPDIR/out.json"
  python3 - "$BATS_TEST_TMPDIR/out.json" "$ARTIFACT" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
entries = [e for e in data if e.get("id") == "G-TEST05"]
assert len(entries) == 1, f"erwartet genau 1 Eintrag fuer G-TEST05, gefunden {len(entries)}"
e = entries[0]
assert e.get("measurable") is False, f"measurable ist nicht False: {e}"
assert "actual" not in e, f"SKIP-Eintrag traegt ein actual-Feld: {e}"
doc = next(g for g in json.load(open(sys.argv[2])) if g["id"] == "G-TEST05")
if doc.get("current") is not None:
    assert doc["current"] != e.get("actual"), \
        f"dokumentierter Wert {doc['current']} taucht als Messwert auf"
PY
}

@test "unbekannte ID wird abgelehnt: exit != 0, stderr nennt die ID" {
  run bash "$WRAPPER" G-NICHT-EXISTENT
  [ "$status" -ne 0 ]
  [[ "$output" == *"G-NICHT-EXISTENT"* ]]
}

@test "ID mit Shell-Metazeichen wird abgelehnt" {
  run bash "$WRAPPER" 'G-BAD;echo injected'
  [ "$status" -ne 0 ]
  [[ "$output" == *"G-BAD"* ]]
  [[ "$output" != *"injected ok"* ]]
}

@test "ohne Argumente: Usage auf stderr, exit 2" {
  run bash "$WRAPPER"
  [ "$status" -eq 2 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "SSOT bleibt byte-gleich: goals.md und generiertes Artefakt unverändert" {
  BEFORE_MD="$(sha256sum .claude/lib/goals.md | cut -d' ' -f1)"
  BEFORE_JSON="$(sha256sum components/website/src/lib/sdlc/goals-data.generated.json | cut -d' ' -f1)"
  run bash "$WRAPPER" G-CQ06 --fast G-TEST05
  [ "$status" -eq 0 ]
  AFTER_MD="$(sha256sum .claude/lib/goals.md | cut -d' ' -f1)"
  AFTER_JSON="$(sha256sum components/website/src/lib/sdlc/goals-data.generated.json | cut -d' ' -f1)"
  [ "$BEFORE_MD" = "$AFTER_MD" ]
  [ "$BEFORE_JSON" = "$AFTER_JSON" ]
}
