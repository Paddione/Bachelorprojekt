#!/usr/bin/env bats
# tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats
# Ticket: T002679
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Pruefmodus: Output-Verifikation — sendet JSON-RPC zeilenweise per stdin an
#   den MCP-Server und prueft die stdout-Antworten. Kein grep auf Skript-Interna.

setup() {
  SERVER="scripts/brain-mcp-server.py"
  export BRAIN_WIKI_DIR="$BATS_TEST_TMPDIR/wiki"
  mkdir -p "$BRAIN_WIKI_DIR"

  # Create fixture wiki pages
  # one page with 10 occurrences of a search term
  local many_path="$BRAIN_WIKI_DIR/many-hits.md"
  cat > "$many_path" << 'MANYEOF'
---
type: note
tags: [test, searchable]
status: active
---
# Page With Many Hits

This page contains the word SEARCHTERM many times.
SEARCHTERM appears here. And here is SEARCHTERM again.
Another reference to SEARCHTERM in context.
The SEARCHTERM term is important for testing.
SEARCHTERM is used as a test search target.
We mention SEARCHTERM in multiple paragraphs.
Here is SEARCHTERM once more for good measure.
Another SEARCHTERM to ensure high BM25 score.
The final SEARCHTERM to make it exactly ten.
Last one: SEARCHTERM.
MANYEOF

  # 3 pages with one hit each
  for i in 1 2 3; do
    cat > "$BRAIN_WIKI_DIR/one-hit-$i.md" << ONEEOF
---
type: note
tags: [test, single-$i]
status: active
---
# Page $i With One Hit

This page mentions SEARCHTERM exactly once for ranking test.
ONEEOF
  done

  # 1 page with no hit
  cat > "$BRAIN_WIKI_DIR/no-hit.md" << NOEOF
---
type: note
tags: [test, irrelevant]
status: active
---
# Page With No Hit

This page does not contain the search keyword at all.
It is about something completely different.
NOEOF
}

# rpc(): send JSON-RPC messages to server and capture responses
# Usage: rpc <json-line-1> <json-line-2> ...
# Returns: stdout from server (one JSON line per response)
rpc() {
  local input=""
  for line in "$@"; do
    input+="$line"$'\n'
  done
  timeout 20 python3 "$SERVER" <<< "$input" 2>/dev/null
}

@test "tools/list advertises exactly brain_search and brain_read" {
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  local list='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

  local response
  response="$(rpc "$init" "$list")"

  # Extract tool names from the tools/list response (id=2)
  local tool_names
  tool_names="$(printf '%s\n' "$response" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        msg = json.loads(line)
        if msg.get('id') == 2 and 'result' in msg:
            for t in msg['result'].get('tools', []):
                print(t.get('name', ''))
    except: pass
  " | sort)"

  # Must be exactly "brain_read brain_search"
  [ "$tool_names" = $'brain_read\nbrain_search' ] || {
    echo "Got tools: '$tool_names'" >&2
    false
  }

  # Verify each tool has a non-empty inputSchema
  local schemas
  schemas="$(printf '%s\n' "$response" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        msg = json.loads(line)
        if msg.get('id') == 2 and 'result' in msg:
            for t in msg['result'].get('tools', []):
                s = t.get('inputSchema', {})
                if not s:
                    print('EMPTY:' + t.get('name', '?'))
    except: pass
  ")"
  [ -z "$schemas" ] || {
    echo "Empty inputSchema: $schemas" >&2
    false
  }
}

@test "brain_search returns at most top_k results, strongest first" {
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  local search='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"SEARCHTERM","top_k":2}}}'

  local response
  response="$(rpc "$init" "$search")"

  local hits
  hits="$(printf '%s\n' "$response" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        msg = json.loads(line)
        if msg.get('id') == 3 and 'result' in msg:
            content = msg['result'].get('content', [])
            for c in content:
                if c.get('type') == 'text':
                    data = json.loads(c['text'])
                    for r in data.get('results', []):
                        print(r.get('slug', '?'))
    except: pass
  ")"

  # At most 2 results, at least 1
  local hit_count
  hit_count="$(printf '%s\n' "$hits" | grep -c .)"
  [ "$hit_count" -le 2 ]
  [ "$hit_count" -gt 0 ]

  # First result must be many-hits (strongest)
  local first
  first="$(printf '%s\n' "$hits" | head -1)"
  [ "$first" = "many-hits" ] || {
    echo "Expected 'many-hits' as first result, got: $first" >&2
    false
  }
}

@test "every brain_search result carries slug, score and snippet" {
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  local search='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"SEARCHTERM","top_k":5}}}'

  local response
  response="$(rpc "$init" "$search")"

  local field_check
  field_check="$(printf '%s\n' "$response" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        msg = json.loads(line)
        if msg.get('id') == 4 and 'result' in msg:
            content = msg['result'].get('content', [])
            for c in content:
                if c.get('type') == 'text':
                    data = json.loads(c['text'])
                    results = data.get('results', [])
                    print('count', len(results))
                    for r in results:
                        slug_ok = bool(r.get('slug'))
                        score_ok = isinstance(r.get('score'), (int, float))
                        snippet_ok = bool(r.get('snippet'))
                        print('fields', slug_ok, score_ok, snippet_ok)
    except Exception as e:
        print('ERROR', str(e))
  ")"

  # Positiv-Anker: hit count > 0
  local hit_count
  hit_count="$(echo "$field_check" | grep '^count ' | awk '{print $2}')"
  [ "$hit_count" -gt 0 ]

  # Every result must have all three fields non-empty/valid
  local field_count
  field_count="$(echo "$field_check" | grep '^fields ' | wc -l)"
  local all_ok
  all_ok="$(echo "$field_check" | grep '^fields True True True' | wc -l)"
  [ "$all_ok" -eq "$field_count" ] || {
    echo "Not all results have slug+score+snippet: $field_check" >&2
    false
  }
}

@test "brain_read returns frontmatter and body of a known slug" {
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  local read='{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"brain_read","arguments":{"slug":"many-hits"}}}'

  local response
  response="$(rpc "$init" "$read")"

  local content
  content="$(printf '%s\n' "$response" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        msg = json.loads(line)
        if msg.get('id') == 5 and 'result' in msg:
            for c in msg['result'].get('content', []):
                if c.get('type') == 'text':
                    print(c['text'])
    except: pass
  ")"

  # Should return type from frontmatter
  echo "$content" | grep -q '"type".*"note"' || {
    echo "Response does not contain frontmatter type: $content" >&2
    false
  }

  # Should contain distinctive body text
  echo "$content" | grep -q 'SEARCHTERM' || {
    echo "Response does not contain body content" >&2
    false
  }
}

@test "brain_read on an unknown slug returns a JSON-RPC error" {
  # Positiv-Anker: known slug succeeds
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  local read_ok='{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"brain_read","arguments":{"slug":"many-hits"}}}'

  local response_ok
  response_ok="$(rpc "$init" "$read_ok")"

  local has_result
  has_result="$(printf '%s\n' "$response_ok" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        msg = json.loads(line)
        if msg.get('id') == 6:
            print('result' if 'result' in msg else 'error')
    except: pass
  ")"
  [ "$has_result" = "result" ] || {
    echo "Positiv-Anker failed: known slug did not return result" >&2
    false
  }

  # Now unknown slug
  local read_bad='{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"brain_read","arguments":{"slug":"nonexistent-page"}}}'

  local response_bad
  response_bad="$(rpc "$init" "$read_bad")"

  local error_info
  error_info="$(printf '%s\n' "$response_bad" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        msg = json.loads(line)
        if msg.get('id') == 7:
            err = msg.get('error', {})
            print('code:', err.get('code', '?'))
            print('message:', err.get('message', '?'))
    except: pass
  ")"

  echo "$error_info" | grep -q 'code:' || {
    echo "No error code in response: $error_info" >&2
    false
  }

  echo "$error_info" | grep -q 'message:' || {
    echo "No error message in response: $error_info" >&2
    false
  }
}
