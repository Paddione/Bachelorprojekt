#!/usr/bin/env bats
# Prüfmodus: Output-Verifikation (erzeugte Fixture-Datei, Exit-Code), siehe
# CLAUDE.md T002448-M4. gen_fixtures.py wird als CLI gegen einen lokalen
# Stub-Server gefahren — kein Modell, keine GPU, aber der echte HTTP-Pfad
# inklusive extract_text. [T002634]

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GEN="$REPO_ROOT/scripts/finetune/gen_fixtures.py"
  TESTSET="$REPO_ROOT/scripts/finetune/testsets/agent-actions.jsonl"
  TMPD="$(mktemp -d)"

  # Stub-Endpunkt: spiegelt den empfangenen Prompt in die Antwort zurück, damit
  # der Test prüfen kann, WAS gesendet wurde — nicht nur, dass etwas ankam.
  python3 - "$TMPD" <<'PY' &
import http.server, json, sys, threading
tmpd = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with open(f"{tmpd}/last-request.json", "w") as fh:
            json.dump(body, fh)
        prompt = body.get("prompt") or body["messages"][0]["content"]
        if "prompt" in body:
            payload = {"choices": [{"text": prompt[:40], "finish_reason": "stop"}]}
        else:
            payload = {"choices": [{"message": {"content": prompt[:40]}, "finish_reason": "stop"}]}
        out = json.dumps(payload).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out))); self.end_headers()
        self.wfile.write(out)
    def log_message(self, *a): pass
srv = http.server.HTTPServer(("127.0.0.1", 18777), H)
with open(f"{tmpd}/port", "w") as fh: fh.write("ready")
srv.serve_forever()
PY
  STUB_PID=$!
  for _ in $(seq 1 50); do [ -f "$TMPD/port" ] && break; sleep 0.1; done
  ENDPOINT="http://127.0.0.1:18777/v1"
}

teardown() {
  [ -n "${STUB_PID:-}" ] && kill "$STUB_PID" 2>/dev/null
  rm -rf "$TMPD"
}

@test "gen_fixtures schreibt für jeden Testset-Fall genau einen Fixture-Eintrag" {
  run python3 "$GEN" --testset "$TESTSET" --model stub --output "$TMPD/fx.json" --endpoint "$ENDPOINT"
  [ "$status" -eq 0 ]
  cases=$(grep -c '' "$TESTSET")
  entries=$(python3 -c "import json;print(len(json.load(open('$TMPD/fx.json'))))")
  [ "$entries" -eq "$cases" ]
}

@test "der gesendete Prompt ist exakt build_prompt aus eval_harness" {
  run python3 "$GEN" --testset "$TESTSET" --model stub --output "$TMPD/fx.json" --endpoint "$ENDPOINT"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der letzte Fall des Testsets, durch build_prompt gejagt,
  # muss zeichengenau dem entsprechen, was der Stub empfangen hat. Ohne diesen
  # Anker wäre die Aussage "Prompt-Pfad identisch" nicht überprüfbar.
  run python3 - "$REPO_ROOT" "$TESTSET" "$TMPD/last-request.json" <<'PY'
import json, sys
sys.path.insert(0, f"{sys.argv[1]}/scripts/finetune")
from eval_harness import build_prompt
last_case = [json.loads(l) for l in open(sys.argv[2], encoding="utf-8") if l.strip()][-1]
sent = json.load(open(sys.argv[3]))["prompt"]
assert sent == build_prompt(last_case), f"Prompt weicht ab:\n{sent!r}\n{build_prompt(last_case)!r}"
print("identisch")
PY
  [ "$status" -eq 0 ]
  [[ "$output" == *"identisch"* ]]
}

@test "greedy und das Token-Budget spiegeln ModelBackend" {
  run python3 "$GEN" --testset "$TESTSET" --model stub --output "$TMPD/fx.json" --endpoint "$ENDPOINT"
  [ "$status" -eq 0 ]
  temp=$(python3 -c "import json;print(json.load(open('$TMPD/last-request.json'))['temperature'])")
  [ "$temp" = "0" ]
  # Gegen die Konstante des Harness, nicht gegen eine Zahl: sonst verankert der
  # Test eine Kopie und merkt nicht, wenn beide Seiten auseinanderlaufen.
  expected=$(python3 -c "import sys;sys.path.insert(0,'$REPO_ROOT/scripts/finetune');import eval_harness;print(eval_harness.MAX_NEW_TOKENS)")
  maxt=$(python3 -c "import json;print(json.load(open('$TMPD/last-request.json'))['max_tokens'])")
  [ "$maxt" = "$expected" ]
}

@test "build_prompt nennt das Schema, das der Scorer erzwingt" {
  # T002634: die Regression, die diesen Test noetig macht — build_prompt sagte
  # nur "a JSON list of actions", waehrend _is_well_formed_action zwingend
  # name/params verlangt. Gemessen ergab das 0.0 auf JEDEM action-Fall, bei
  # korrekter Aktionswahl. Beide Seiten scheiterten gleich, also blieb der Gate
  # gruen — der Fehler war unsichtbar.
  run python3 - "$REPO_ROOT" <<'PY'
import json, sys
sys.path.insert(0, f"{sys.argv[1]}/scripts/finetune")
from eval_harness import build_prompt, parse_action_output
from eval_scoring import score_case

case = {
    "id": "t", "class": "action", "language": "en", "request": "Do the thing.",
    "action_schemas": {"create_task": {"required": ["title"], "optional": []}},
    "expected_actions": [{"name": "create_task", "params": {"title": "X"}}],
}
prompt = build_prompt(case)
for key in ("name", "params"):
    assert f'"{key}"' in prompt, f'build_prompt nennt {key!r} nicht — Modell muesste raten'

# Positiv-Anker: eine Ausgabe im angesagten Format muss auch wirklich 1.0 geben.
# Ohne ihn koennte der Prompt die Schluessel nennen und der Scorer trotzdem
# etwas anderes verlangen.
good = json.dumps([{"name": "create_task", "params": {"title": "X"}}])
assert score_case(case, parse_action_output(good))["score"] == 1.0

# Negativ-Anker: genau die Form, die gemma-4-12b-it ungeprompted lieferte.
bad = json.dumps([{"action": "create_task", "parameters": {"title": "X"}}])
assert score_case(case, parse_action_output(bad))["score"] == 0.0
print("ok")
PY
  [ "$status" -eq 0 ]
  [[ "$output" == *"ok"* ]]
}

@test "--mode chat sendet messages statt prompt, Default sendet prompt" {
  run python3 "$GEN" --testset "$TESTSET" --model stub --output "$TMPD/c.json" --endpoint "$ENDPOINT" --mode chat
  [ "$status" -eq 0 ]
  run python3 -c "import json;b=json.load(open('$TMPD/last-request.json'));print('messages' in b, 'prompt' in b)"
  [[ "$output" == "True False" ]]

  run python3 "$GEN" --testset "$TESTSET" --model stub --output "$TMPD/d.json" --endpoint "$ENDPOINT"
  [ "$status" -eq 0 ]
  run python3 -c "import json;b=json.load(open('$TMPD/last-request.json'));print('messages' in b, 'prompt' in b)"
  [[ "$output" == "False True" ]]
}

@test "unerreichbarer Endpunkt liefert Exit 2 statt einer leeren Fixture" {
  run python3 "$GEN" --testset "$TESTSET" --model stub --output "$TMPD/none.json" \
      --endpoint "http://127.0.0.1:1/v1" --timeout 5
  [ "$status" -eq 2 ]
  [ ! -f "$TMPD/none.json" ]
}

@test "die erzeugte Fixture ist für eval_harness lesbar" {
  run python3 "$GEN" --testset "$TESTSET" --model stub --output "$TMPD/fx.json" --endpoint "$ENDPOINT"
  [ "$status" -eq 0 ]
  # Beide Seiten mit derselben Fixture: der Gate muss durchlaufen (Tuned ist
  # nirgends schlechter als Base, weil identisch) — belegt, dass das Format passt.
  run python3 "$REPO_ROOT/scripts/finetune/eval_harness.py" --testset "$TESTSET" \
      --fixture-base "$TMPD/fx.json" --fixture-tuned "$TMPD/fx.json" --quiet
  [ "$status" -eq 0 ]
}
