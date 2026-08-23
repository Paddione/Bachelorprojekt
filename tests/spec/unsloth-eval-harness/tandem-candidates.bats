#!/usr/bin/env bats
# Prüfmodus: Output-/Artefakt-Verifikation (T002448-M4). Struktureller Guard
# gegen die Tandem-Deliverables aus T015248 (openspec/changes/tandem-small-models):
#   - docs/finetune/tandem-candidates.json  (Kandidaten-Matrix)
#   - docs/finetune/tandem-model-evaluation.md (Empfehlung + Trainingsplan)
# Die Assertions prüfen die Artefakte selbst, nicht den Plan-Text. JSON wird
# mit python3+stdlib-json geprüft; jq/PyYAML werden bewusst NICHT vorausgesetzt,
# damit der Guard nicht an fehlenden Extras scheitert (Verfügbarkeits-Guard ist
# daher nur `command -v python3`, vgl. T002820).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  MATRIX="$REPO_ROOT/docs/finetune/tandem-candidates.json"
  EVALDOC="$REPO_ROOT/docs/finetune/tandem-model-evaluation.md"
}

require_python3() {
  command -v python3 >/dev/null 2>&1 || skip "python3 nicht verfügbar"
}

# --- Assertion 1: Matrix existiert und ist valides JSON ---

@test "tandem-candidates.json exists and parses as JSON" {
  require_python3
  [ -f "$MATRIX" ]
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$MATRIX"
}

# --- Assertion 2a: Rollen-Schlüssel draft/router/worker in JEDEM Kandidaten ---

@test "every candidate entry carries all three role keys" {
  require_python3
  python3 - "$MATRIX" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
candidates = data["candidates"]
assert candidates, "candidates list is empty"
for c in candidates:
    roles = c.get("roles", {})
    missing = [r for r in ("draft", "router", "worker") if r not in roles]
    assert not missing, f"{c.get('slug')}: missing role keys {missing}"
    for r in ("draft", "router", "worker"):
        assert "fit" in roles[r], f"{c.get('slug')}: role {r} has no fit"
        assert isinstance(roles[r].get("reasons"), list) and roles[r]["reasons"], \
            f"{c.get('slug')}: role {r} has empty reasons"
EOF
}

# --- Assertion 2b: pro Rolle mindestens 1 Kandidat fit != excluded ---

@test "each role has at least one non-excluded candidate" {
  require_python3
  python3 - "$MATRIX" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
candidates = data["candidates"]
for role in ("draft", "router", "worker"):
    usable = [c["slug"] for c in candidates if c["roles"][role]["fit"] != "excluded"]
    assert usable, f"role {role}: no candidate with fit != excluded"
EOF
}

# --- Assertion 3: harte Kriterien params_b/gguf/vram für JEDEN Kandidaten ---

@test "every candidate satisfies the hard gates (params_b<=8, gguf_exportable, qlora_vram_fit_16gb_shared)" {
  require_python3
  python3 - "$MATRIX" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
for c in data["candidates"]:
    slug = c.get("slug")
    assert isinstance(c.get("params_b"), (int, float)) and c["params_b"] <= 8, \
        f"{slug}: params_b {c.get('params_b')} exceeds 8"
    assert c.get("gguf_exportable") is True, f"{slug}: gguf_exportable is not true"
    assert c.get("qlora_vram_fit_16gb_shared") is True, \
        f"{slug}: qlora_vram_fit_16gb_shared is not true"
    assert c.get("evidence"), f"{slug}: no evidence entries"
EOF
}

# --- Assertion 4: Draft-Empfehlung erfordert Tokenizer-Match (D3, HART) ---

@test "recommended draft candidates have tokenizer_match_with_resident=true" {
  require_python3
  python3 - "$MATRIX" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
recommended = [c for c in data["candidates"] if c["roles"]["draft"]["fit"] == "recommended"]
assert recommended, "no draft candidate marked recommended"
for c in recommended:
    assert c.get("tokenizer_match_with_resident") is True, \
        f"{c['slug']}: draft recommended without tokenizer match (design D3)"
EOF
}

# --- Assertion 5: Evaluations-Dokument mit Pflicht-Abschnitten ---

@test "tandem-model-evaluation.md exists with required section headings" {
  [ -f "$EVALDOC" ]
  grep -qE '^#+.*Empfehlung je Rolle' "$EVALDOC"
  grep -qE '^#+.*Trainingsplan' "$EVALDOC"
}

# --- Assertion 6: keine Platzhalter in beiden Artefakten ---

@test "no TBD or TODO markers in either artifact" {
  for f in "$MATRIX" "$EVALDOC"; do
    [ -f "$f" ] || { echo "missing artifact: $f"; return 1; }
    hits="$(grep -nE 'TBD|TODO' "$f" || true)"
    [ -z "$hits" ] || { echo "placeholder found in $f:"; echo "$hits"; return 1; }
  done
}
