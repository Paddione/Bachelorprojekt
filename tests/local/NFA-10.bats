#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL}"
}

@test "NFA-10: /healthz p95 < 200ms over 50 sequential requests" {
  rm -f /tmp/nfa10-times.txt
  for i in $(seq 1 50); do
    /usr/bin/time -f "%e" -o /tmp/nfa10-time-one.txt \
      curl -s -o /dev/null -w '%{time_total}\n' "$ARENA_WS_URL/healthz" \
      >> /tmp/nfa10-times.txt
  done
  P95=$(sort -n /tmp/nfa10-times.txt | awk 'NR==48 { print }')
  # awk does string-to-float compare; convert to ms for the assertion message.
  P95_MS=$(echo "$P95 * 1000" | bc -l | cut -d. -f1)
  echo "p95 = ${P95_MS}ms" >&3
  [ "$P95_MS" -lt 200 ]
}