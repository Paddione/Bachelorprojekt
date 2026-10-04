#!/usr/bin/env bats
# tests/spec/p0min-freeze-embed.bats
# Partial p3 (T900989, gate G2): embedding pin + held-out retrieval checks.
#
# Record/spec staged AHEAD of the first full embedding run: the pin tests
# (model + corpus hash + K3 snapshot) and the FSD zero-FP checks run green
# now; the 3 held-out top-k retrieval tests SKIP until the embed pipeline
# lands its index artifact (docs/brain/embed-index.json). Red-first proof:
# re-run with P0MIN_FORCE_RETRIEVAL=1 — the retrieval tests then FAIL with
# "embed pipeline not implemented yet", proving the spec binds.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  CORPUS="$REPO/docs/brain/corpus-freeze.json"
  HBMAP="$REPO/docs/brain/handled-by-map.json"
  REPORT="$REPO/docs/brain/embed-eval-report.md"
  INDEX="$REPO/docs/brain/embed-index.json"
}

_require_retrieval() {
  if [ -z "${P0MIN_FORCE_RETRIEVAL:-}" ] && [ ! -f "$INDEX" ]; then
    skip "embed pipeline not implemented yet (no docs/brain/embed-index.json) — red-first: P0MIN_FORCE_RETRIEVAL=1 forces the binding FAIL"
  fi
}

@test "p0min G2: corpus freeze pin — 349 routes @8fed539b" {
  [ -f "$CORPUS" ]
  route_count="$(python3 -c "import json; print(json.load(open('$CORPUS'))['route_count'])")"
  [ "$route_count" = "349" ]
  frozen="$(python3 -c "import json; print(json.load(open('$CORPUS'))['frozen_at_commit'])")"
  [ "$frozen" = "8fed539b996fdcb89181fa8e8084fec8d299c8ab" ]
}

@test "p0min G2: handled-by map covers all 349 rows" {
  [ -f "$HBMAP" ]
  python3 -c "import json; d=json.load(open('$HBMAP')); assert len(d)==349, len(d); assert all(r.get('handled_by') for r in d), 'unhandled rows remain'"
}

@test "p0min G2: eval report pins bge-m3 Q8_0 1024d + corpus hash + K3 snapshot" {
  [ -f "$REPORT" ]
  grep -q "bge-m3" "$REPORT"
  grep -q "Q8_0" "$REPORT"
  grep -q "1024" "$REPORT"
  grep -q "8fed539b996fdcb89181fa8e8084fec8d299c8ab" "$REPORT"
  actual="$(sha256sum "$CORPUS" | cut -d' ' -f1)"
  grep -q "$actual" "$REPORT"
}

@test "p0min G2 FSD zero-FP: denylisted artefacts absent from corpus routes" {
  python3 -c "
import json
d = json.load(open('$CORPUS'))
bad = [r['id'] for r in d['routes'] if 'repo-index.json' in r['path'] or 'openspec-status.json' in r['path']]
assert not bad, bad
"
}

@test "p0min G2 FSD zero-FP: every frozen route path resolves on disk" {
  python3 -c "
import json, os
d = json.load(open('$CORPUS'))
missing = [r['path'] for r in d['routes'] if not os.path.exists(os.path.join('$REPO', r['path']))]
assert not missing, missing[:5]
"
}

@test "p0min G2 retrieval: held-out auth/callback.ts:GET ranks lib/auth.ts top-k" {
  _require_retrieval
  [ -f "$INDEX" ] || { echo "embed pipeline not implemented yet (no docs/brain/embed-index.json)" >&2; return 1; }
  python3 -c "
import json
idx = json.load(open('$INDEX'))
hits = idx['held_out']['auth/callback.ts:GET']
assert 'components/website/src/lib/auth.ts' in hits[:5], hits
"
}

@test "p0min G2 retrieval: held-out billing/create-invoice.ts:POST ranks lib/stripe-billing.ts top-k" {
  _require_retrieval
  [ -f "$INDEX" ] || { echo "embed pipeline not implemented yet (no docs/brain/embed-index.json)" >&2; return 1; }
  python3 -c "
import json
idx = json.load(open('$INDEX'))
hits = idx['held_out']['billing/create-invoice.ts:POST']
assert 'components/website/src/lib/stripe-billing.ts' in hits[:5], hits
"
}

@test "p0min G2 retrieval: held-out brett/bot.ts:POST ranks lib/brett-bot.ts top-k" {
  _require_retrieval
  [ -f "$INDEX" ] || { echo "embed pipeline not implemented yet (no docs/brain/embed-index.json)" >&2; return 1; }
  python3 -c "
import json
idx = json.load(open('$INDEX'))
hits = idx['held_out']['brett/bot.ts:POST']
assert 'components/website/src/lib/brett-bot.ts' in hits[:5], hits
"
}
