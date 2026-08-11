#!/usr/bin/env bats
# T003112: scripts/plan-qa-check.sh meldete "FAIL — Missing criteria: Could not parse
# missing items" statt einer inhaltlichen QA-Rueckmeldung.
#
# Zwei getrennte Defekte, die dieselbe Zeile erzeugt:
#
# (a) PARSE — die drei `python3 -c`-Bloecke rufen `json.loads()` direkt auf dem
#     Modell-Content auf. Ein Modell, das seine JSON-Antwort in einen Markdown-Fence
#     (```json … ```) legt oder ihr einen Satz voranstellt, laesst alle drei scheitern.
#     Reproduziert am 2026-08-10 gegen einen Fixture-Gateway (siehe unten): Ausgabe
#     "FAIL — Missing criteria: - Could not parse missing items", exit 1, obwohl die
#     Antwort ein wohlgeformtes verdict/missing/suggestions-Objekt enthielt.
#
# (b) SICHTBARKEIT — das eigentliche Problem. Die Pruefung ist advisory und wird als
#     `bash scripts/plan-qa-check.sh … || true` aufgerufen (.claude/skills/dev-flow-plan/
#     SKILL.md:187), der Exit-Code ist also bedeutungslos. Alle Ausfallpfade
#     (Gateway tot, HTTP != 200, Envelope unparsebar) enden mit `exit 0` und
#     unterscheiden sich fuer einen Aufrufer nicht von einem bestandenen Lauf —
#     eine uebersprungene Pruefung sieht aus wie eine bestandene. Umgekehrt wird ein
#     Parse-Ausfall als inhaltliches Verdict FAIL ausgegeben, also als Aussage ueber
#     den Plan statt als Stoerung des Pruefwegs. Genau diese Klasse haelt T002848 fuer
#     alle LLM-gestuetzten Pruefungen im Repo fest.
#
# Geforderter Vertrag: JEDER Lauf gibt genau eine maschinenlesbare Ergebniszeile aus,
# die den Ausgang benennt — `RESULT: PASS`, `RESULT: FAIL`, `RESULT: SKIPPED` oder
# `RESULT: ERROR`. SKIPPED und ERROR sind damit weder als PASS noch als inhaltliches
# FAIL lesbar.
#
# Pruefmodus: command output verification [T002448-M4] — das Skript wird AUSGEFUEHRT
# und seine Ausgabe geprueft; kein grep auf die Implementierungsquelle.
# Geprueft wird die Semantik des Ausgangs (Token `RESULT: <STATUS>`, Vorhandensein des
# inhaltlichen Befunds), nicht ein Zeilenlayout [T002716].
#
# Kein echter LLM-Aufruf: der Gateway ist ein lokaler Fixture-Server. Die GPU-Backends
# des echten Gateways (Port 18235) sind haeufig `degraded` und teilen sich exklusiv eine
# GPU — ein Test dagegen wuerde die Tagesform der Hardware messen, nicht das Skript.
# Warten per Polling statt festem `sleep` (Flake-Quelle, vgl. T002850).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  QA="$REPO/scripts/plan-qa-check.sh"
  TMP="$BATS_TEST_TMPDIR"
  PLAN="$TMP/plan.md"
  GW_PID=""
  mkplan "$PLAN"
}

teardown() {
  if [[ -n "${GW_PID:-}" ]]; then
    kill "$GW_PID" 2>/dev/null || true
    wait "$GW_PID" 2>/dev/null || true
  fi
}

# Ein Plan mit Frontmatter und mindestens 10 Zeilen — beides prueft das Skript vor
# dem Gateway-Kontakt und braeche sonst mit exit 1 ab, bevor der Parse-Pfad laeuft.
# Seit [T003381] prueft das Skript die drei Abschluss-Kommandos deterministisch VOR
# dem Gateway — die Fixture muss sie enthalten, sonst endet jeder Lauf schon im
# Pre-Check mit RESULT: FAIL und kein Gateway-Pfad wird erreicht.
mkplan() {
  cat > "$1" <<'PLANEOF'
---
title: "Fixture — Implementation Plan"
ticket_id: T003112
domains: [test]
status: active
---

# Fixture Implementation Plan

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Beispiel

Ein Schritt, damit der Plan die Mindestlaenge erreicht.

## Task 2: Abschluss

- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
PLANEOF
}

# free_port — freien Port vom Kernel zuweisen lassen. Kein fester Port: unter WSL2
# sind Bereiche wie 49152-49251 von Hyper-V reserviert und liefern EADDRINUSE ohne
# sichtbaren Lauscher.
free_port() {
  python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
}

# start_fake_gateway <port> <mode> — /livez 200; POST /v1/chat/completions liefert
# HTTP 200 mit einem gueltigen OpenAI-Envelope, dessen `content` je nach Modus variiert:
#   plain  — nacktes JSON-Objekt, verdict PASS (der Fall, den das Skript heute kann)
#   fenced — dasselbe Objekt in einem ```json-Fence, verdict FAIL mit echtem Befund
#   prose  — ueberhaupt kein JSON (Modell antwortet in Prosa)
#   fail_then_pass — Request 1: FAIL mit suggestions, Request 2: PASS (T003621)
start_fake_gateway() {
  local port="$1" mode="$2"
  python3 - "$port" "$mode" <<'PYEOF' &
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1])
MODE = sys.argv[2]

PLAIN = json.dumps({"verdict": "PASS", "missing": [], "suggestions": ""})
FENCED = (
    "```json\n"
    + json.dumps({
        "verdict": "FAIL",
        "missing": ["Kriterium 4: S1-Budget-Kommentar fehlt"],
        "suggestions": "Budgetzeile je Datei ergaenzen",
    })
    + "\n```"
)
PROSE = "Ich habe den Plan geprueft und finde ihn insgesamt schluessig."
FTP = json.dumps({
    "verdict": "FAIL",
    "missing": ["Kriterium 1: kein Pfad"],
    "suggestions": "Konkreten Pfad nennen.",
})

STATE = {"n": 0}


def content():
    if MODE != "fail_then_pass":
        return {"plain": PLAIN, "fenced": FENCED, "prose": PROSE}[MODE]
    STATE["n"] += 1
    return FTP if STATE["n"] == 1 else PLAIN


class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = body.encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/livez":
            self._send(200, '{"alive":true}')
        else:
            self._send(404, '{"error":"not found"}')

    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length") or 0))
        self._send(200, json.dumps({"choices": [{"message": {"content": content()}}]}))

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
PYEOF
  GW_PID=$!
  local i
  for ((i = 0; i < 100; i++)); do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${port}/livez"; then
      return 0
    fi
    sleep 0.1
  done
  echo "Fake-Gateway auf Port ${port} wurde nicht bereit"
  return 1
}

# --- (a) Parse -------------------------------------------------------------

@test "T003112: wohlgeformte JSON-Antwort ergibt RESULT: PASS (Positiv-Anker)" {
  # Positiv-Anker [T002356-M1]: der Fall, den das Skript beherrschen MUSS. Faellt er
  # aus, sind die Negativ-Aussagen der folgenden Tests wertlos, weil sie dann auch
  # bei einem komplett kaputten Pfad trivial zutraefen.
  local port; port="$(free_port)"
  start_fake_gateway "$port" plain

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  [ "$status" -eq 0 ] || { echo "erwartet exit 0 bei PASS, war $status"; echo "$output"; return 1; }
  echo "$output" | grep -qF 'PASS' \
    || { echo "MISSING: kein PASS in der Ausgabe"; echo "$output"; return 1; }
  echo "$output" | grep -Eq 'RESULT:[[:space:]]*PASS' \
    || { echo "MISSING: keine maschinenlesbare Ergebniszeile 'RESULT: PASS'"; echo "$output"; return 1; }
}

@test "T003112: JSON im Markdown-Fence wird geparst, nicht als Parse-Fehler gemeldet" {
  local port; port="$(free_port)"
  start_fake_gateway "$port" fenced

  # Anker: der Fixture liefert wirklich einen Fence mit dem erwarteten Befund.
  local content
  content="$(curl -s --max-time 5 -X POST "http://127.0.0.1:${port}/v1/chat/completions" \
    -H 'content-type: application/json' -d '{}' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["choices"][0]["message"]["content"])')"
  echo "$content" | grep -qF '```json' \
    || { echo "Anker verletzt: Fixture lieferte keinen Markdown-Fence"; echo "$content"; return 1; }
  echo "$content" | grep -qF 'S1-Budget-Kommentar fehlt' \
    || { echo "Anker verletzt: Fixture-Befund fehlt"; echo "$content"; return 1; }

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  echo "$output" | grep -qF 'S1-Budget-Kommentar fehlt' \
    || { echo "MISSING: der inhaltliche Befund des Modells taucht nicht auf"; echo "$output"; return 1; }
  echo "$output" | grep -qF 'Could not parse missing items' \
    && { echo "REGRESSION: gefencte, wohlgeformte Antwort als Parse-Fehler gemeldet"; echo "$output"; return 1; }
  echo "$output" | grep -Eq 'RESULT:[[:space:]]*FAIL' \
    || { echo "MISSING: inhaltliches FAIL nicht als 'RESULT: FAIL' ausgewiesen"; echo "$output"; return 1; }
  return 0
}

# --- (b) Ausfall als Ausfall sichtbar --------------------------------------

@test "T003112: unlesbare Modellantwort ergibt RESULT: ERROR, kein inhaltliches Verdict" {
  local port; port="$(free_port)"
  start_fake_gateway "$port" prose

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  echo "$output" | grep -Eq 'RESULT:[[:space:]]*ERROR' \
    || { echo "MISSING: unlesbare Antwort nicht als 'RESULT: ERROR' ausgewiesen"; echo "$output"; return 1; }
  echo "$output" | grep -Eq 'RESULT:[[:space:]]*(PASS|FAIL)' \
    && { echo "REGRESSION: Stoerung des Pruefwegs als inhaltliches Verdict ausgegeben"; echo "$output"; return 1; }
  # Diagnostizierbar: ein Auszug der tatsaechlichen Antwort muss mitgegeben werden,
  # sonst ist der Ausfall zwar sichtbar, aber nicht untersuchbar.
  echo "$output" | grep -qF 'Ich habe den Plan geprueft' \
    || { echo "MISSING: kein Auszug der unlesbaren Antwort in der Diagnose"; echo "$output"; return 1; }
  return 0
}

@test "T003112: uebersprungene Pruefung ergibt RESULT: SKIPPED, nicht PASS" {
  local port; port="$(free_port)"
  # Bewusst KEIN Server auf diesem Port — der Skip-Pfad des Skripts.

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  [ "$status" -eq 0 ] \
    || { echo "advisory QA muss exit 0 liefern, war $status"; echo "$output"; return 1; }
  echo "$output" | grep -Eq 'RESULT:[[:space:]]*SKIPPED' \
    || { echo "MISSING: Skip nicht als 'RESULT: SKIPPED' ausgewiesen"; echo "$output"; return 1; }
  echo "$output" | grep -Eq 'RESULT:[[:space:]]*PASS' \
    && { echo "REGRESSION: uebersprungene Pruefung als PASS lesbar"; echo "$output"; return 1; }
  return 0
}

@test "T003112: bei unlesbarer Antwort laeuft kein Auto-Fix-Versuch" {
  # Der Auto-Fix-Loop haengt bei Parse-Ausfall einen leeren Abschnitt
  # '## QA-Ergaenzungen' an den geprueften Plan (die leere `suggestions` eines
  # gescheiterten Parses) und laeuft eine zweite, ebenso sinnlose Iteration. Eine
  # Stoerung des Pruefwegs darf keine Korrektur an einem Artefakt ausloesen, ueber
  # das nichts bekannt ist.
  #
  # Geprueft wird der *Versuch* im Output, nicht der Endzustand der Datei: das Skript
  # spielt am Ende ohnehin das Backup zurueck, ein md5-Vergleich waere darum auch
  # beim heutigen Fehlverhalten gruen — also vakuos.
  local port; port="$(free_port)"
  start_fake_gateway "$port" prose

  local before after
  before="$(md5sum < "$PLAN")"
  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"
  after="$(md5sum < "$PLAN")"

  echo "$output" | grep -qiF 'auto-fix' \
    && { echo "REGRESSION: Auto-Fix-Versuch trotz unlesbarer Antwort"; echo "$output"; return 1; }
  [ "$before" = "$after" ] \
    || { echo "REGRESSION: Plandatei wurde bei unlesbarer Antwort veraendert"; echo "$output"; return 1; }
  return 0
}

@test "T003621: PASS nach Auto-Fix-Iteration hinterlaesst die Plandatei byte-identisch" {
  # Request 1 → FAIL mit suggestions (Auto-Fix haengt die QA-Ergaenzungen-Sektion
  # an), Request 2 → PASS. Vor dem Fix blieb die '## QA-Ergänzungen'-Sektion im
  # Artefakt zurueck — ein gruener Lauf mutierte die Plandatei.
  local port; port="$(free_port)"
  start_fake_gateway "$port" fail_then_pass

  local before after
  before="$(md5sum < "$PLAN")"
  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"
  after="$(md5sum < "$PLAN")"

  echo "$output" | grep -Eq 'RESULT:[[:space:]]*PASS' \
    || { echo "MISSING: Ergebniszeile RESULT: PASS"; echo "$output"; return 1; }
  [ "$status" -eq 0 ] || { echo "erwartet exit 0 bei PASS, war $status"; echo "$output"; return 1; }
  [ "$before" = "$after" ] \
    || { echo "REGRESSION: Plandatei nach PASS nicht byte-identisch zum Eingang"; echo "$output"; return 1; }
  grep -qF '## QA-Ergänzungen' "$PLAN" \
    && { echo "REGRESSION: QA-Ergaenzungen-Sektion trotz PASS im Artefakt"; return 1; }
  return 0
}

@test "T003381: fehlendes Abschluss-Kommando wird deterministisch ohne Gateway erkannt" {
  # Kriterium 5 wird vor dem Gateway-Kontakt per grep geprueft (plan-lint STRUCT3
  # analog). Ein Plan ohne 'task freshness:check' muss RESULT: FAIL liefern und
  # exit 1 — auch wenn kein Gateway lauscht (deterministisch, offline).
  local plan_no_cmd="$TMP/plan-no-check.md"
  sed 's/task freshness:check//' "$PLAN" > "$plan_no_cmd"
  grep -qF 'task freshness:check' "$plan_no_cmd" && { echo "Fixture kaputt: Kommando noch da"; return 1; }

  local port; port="$(free_port)"
  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$plan_no_cmd"

  echo "$output" | grep -Eq 'RESULT:[[:space:]]*FAIL' \
    || { echo "MISSING: deterministisches FAIL"; echo "$output"; return 1; }
  echo "$output" | grep -qF 'freshness:check' \
    || { echo "MISSING: fehlendes Kommando wird benannt"; echo "$output"; return 1; }
  [ "$status" -eq 1 ] || { echo "erwartet exit 1 bei deterministischem FAIL, war $status"; echo "$output"; return 1; }
  return 0
}

@test "T003381: Plan mit allen drei Kommandos als Checkbox-Task + Gateway PASS ergibt PASS" {
  # Kein Widerspruch zu plan-lint: die drei Kommandos als Checkbox-Task im Index
  # sind STRUCT3-konform — Kriterium 5 darf darueber nicht falsch-positiv faellen.
  local port; port="$(free_port)"
  start_fake_gateway "$port" plain

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  [ "$status" -eq 0 ] || { echo "erwartet exit 0 bei PASS, war $status"; echo "$output"; return 1; }
  echo "$output" | grep -Eq 'RESULT:[[:space:]]*PASS' \
    || { echo "MISSING: RESULT: PASS"; echo "$output"; return 1; }
  echo "$output" | grep -qiF 'deterministisch' \
    || { echo "MISSING: Kriterium 5 wird als deterministisch geprueft ausgewiesen"; echo "$output"; return 1; }
  return 0
}
