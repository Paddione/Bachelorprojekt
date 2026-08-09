#!/usr/bin/env bats
# tests/spec/openspec-embedding/dynamic-port-T003077.bats
# SSOT: openspec/specs/openspec-embedding.md (delta in
# openspec/changes/openspec-embed-dynamic-port/)
#
# T003077: scripts/openspec-embed-local.sh hardcodes local port 15432 for its
# kubectl port-forward onto svc/shared-db. A permanently running dev
# port-forward on the same port (common on this host, e.g. a manual
# `kubectl --context k3d-mentolder-dev port-forward -n workspace svc/shared-db
# 15432:5432`) collides with it on EVERY commit that touches
# openspec/changes/<slug>/. The wrapper already fails loud instead of
# silently writing to the wrong DB (T002870) — the gap is that a shared fixed
# port keeps re-colliding.
#
# Fix: let `kubectl port-forward svc/shared-db :5432` (empty local port)
# choose a free local port per run instead of sharing 15432. kubectl reports
# the chosen port on stdout as "Forwarding from 127.0.0.1:<port> -> 5432".
# This test covers the new pure parsing helper `parse_pf_local_port()` in
# scripts/openspec-embed-lib.sh that extracts that port — testable without a
# real cluster.
#
# Test mode: command output verification (run/$status/$output) against the
# real helper function — no source-grep. Positive anchor precedes each
# negative/edge assertion (T002356-M1).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO/scripts/openspec-embed-lib.sh"
}

@test "parse_pf_local_port extracts the kubectl-assigned port from the 127.0.0.1 forwarding line (positive anchor)" {
  # expected: FAIL — parse_pf_local_port does not exist yet in openspec-embed-lib.sh.
  [ -f "$LIB" ]
  source "$LIB"
  run parse_pf_local_port "Forwarding from 127.0.0.1:41287 -> 5432"
  [ "$status" -eq 0 ]
  [ "$output" = "41287" ]
}

@test "parse_pf_local_port picks the 127.0.0.1 line, not an accompanying IPv6 line" {
  # expected: FAIL — function does not exist yet.
  source "$LIB"
  MULTILINE="$(printf 'Forwarding from [::1]:41287 -> 5432\nForwarding from 127.0.0.1:41287 -> 5432\n')"
  run parse_pf_local_port "$MULTILINE"
  [ "$status" -eq 0 ]
  [ "$output" = "41287" ]
}

@test "parse_pf_local_port returns empty (not a stray match) on kubectl error output" {
  # expected: FAIL — function does not exist yet.
  source "$LIB"
  run parse_pf_local_port "error: unable to forward port because pod is not running"
  [ -z "$output" ]
}
