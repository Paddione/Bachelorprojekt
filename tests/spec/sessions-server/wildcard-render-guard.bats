#!/usr/bin/env bats
# tests/spec/sessions-server/wildcard-render-guard.bats
# T900029 — Render-Guard gegen leere Sessions-Wildcards (SA-SEC-01, zweite Haelfte).
# SSOT-Delta: openspec/changes/fix-sessions-wildcard-render-guard/specs/sessions-server.md
# Pruefmodus: Verhaltens-Verifikation (Komando-Output/Exit-Code von
# scripts/render-guard.sh auf echten Render-Artefakten) — kein Source-Grep als
# Erfolgsnachweis. Die beiden Verdrahtungs-Tests am Ende sind Querschnitt-Checks
# (Ergebnis manifestiert sich in der Render-Pipeline-Konfiguration) und als solche
# markiert; der Rot-Gruen-Nachweis haengt an den Verhaltens-Tests darueber.
# Konventionen: vendored bats, kein ticket-nummerierter Dateiname (T002416),
# Positiv-Anker im selben Test bei jeder Negativ-Aussage (T002356-M1).

setup() {
  load "../../unit/lib/bats-support/load"
  load "../../unit/lib/bats-assert/load"
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/render-guard.sh"
  SRC="$REPO_ROOT/prod-fleet/mentolder/sessions-server.yaml"
}

render_sessions() {
  # $1 = SESSIONS_DOMAIN-Wert; rendert die echte Overlay-Quelle wie der
  # Flux-Pfad (kustomize+envsubst), hier fokussiert auf die Sessions-Datei.
  SESSIONS_DOMAIN="$1" envsubst '$SESSIONS_DOMAIN' < "$SRC"
}

@test "gesunder Sessions-Render passiert den Guard (Positiv-Anker)" {
  tmp="$(mktemp)"
  render_sessions "sessions.mentolder.de" > "$tmp"
  # Der gesunde Render enthaelt die volle Wildcard — sonst misst der Test
  # gegen ein leeres Setup statt gegen den Guard.
  run grep -qF '"*.sessions.mentolder.de"' "$tmp"
  assert_success
  run bash "$GUARD" "$tmp"
  assert_success
  rm -f "$tmp"
}

@test "leere SESSIONS_DOMAIN wird abgewiesen (dnsNames \"*.\") " {
  healthy="$(mktemp)"
  broken="$(mktemp)"
  render_sessions "sessions.mentolder.de" > "$healthy"
  render_sessions "" > "$broken"
  # Positiv-Anker: der Guard existiert und laesst den gesunden Render durch —
  # ohne ihn waere ein assert_failure unten bei fehlendem Helper vakuos (127).
  run bash "$GUARD" "$healthy"
  assert_success
  # Defekt-Nachweis (T003548): der leere Render enthaelt wirklich "*.\"" —
  # der Test misst die Fehlerklasse aus T900029, nicht das Setup.
  run grep -qF '"*."' "$broken"
  assert_success
  # Guard muss den kaputten Render abweisen (fail-closed).
  run bash "$GUARD" "$broken"
  assert_failure
  rm -f "$healthy" "$broken"
}

@test "leere SESSIONS_DOMAIN wird abgewiesen (HostRegexp-Rest)" {
  healthy="$(mktemp)"
  broken="$(mktemp)"
  render_sessions "sessions.mentolder.de" > "$healthy"
  render_sessions "" > "$broken"
  # Positiv-Anker wie oben: ohne funktionierenden Helper ist assert_failure
  # unten (Exit 127) kein Defekt-Nachweis.
  run bash "$GUARD" "$healthy"
  assert_success
  # Defekt-Nachweis: der HostRegexp-Match endet auf den leeren Rest (\.$).
  run grep -qF '\.$`' "$broken"
  assert_success
  run bash "$GUARD" "$broken"
  assert_failure
  rm -f "$healthy" "$broken"
}

@test 'unsubstituiertes ${SESSIONS_DOMAIN} in dnsNames wird abgewiesen' {
  healthy="$(mktemp)"
  broken="$(mktemp)"
  render_sessions "sessions.mentolder.de" > "$healthy"
  run bash "$GUARD" "$healthy"
  assert_success
  # Platzhalter stehen lassen statt substituieren = unvollstaendiger Render.
  sed 's/sessions\.mentolder\.de/${SESSIONS_DOMAIN}/g' "$healthy" > "$broken"
  run grep -qF '${SESSIONS_DOMAIN}' "$broken"
  assert_success
  run bash "$GUARD" "$broken"
  assert_failure
  rm -f "$healthy" "$broken"
}

@test "sessions-freies Manifest passiert ohne False Positive (korczewski-Scope)" {
  healthy="$(mktemp)"
  plain="$(mktemp)"
  render_sessions "sessions.mentolder.de" > "$healthy"
  run bash "$GUARD" "$healthy"
  assert_success
  # Ein Manifest ohne Sessions-Inhalt (wie der korczewski-Overlay, der kein
  # sessions-Cert enthaelt) darf den Guard nicht ausloesen.
  printf 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\ndata:\n  key: value\n' > "$plain"
  run grep -qE 'dnsNames|Host\(|HostRegexp' "$plain"
  assert_failure
  run bash "$GUARD" "$plain"
  assert_success
  rm -f "$healthy" "$plain"
}

@test "Verdrahtung [Konfiguration]: Flux-Render ruft den Guard auf" {
  run grep -qF 'render-guard.sh' "$REPO_ROOT/scripts/flux-render-artifact.sh"
  assert_success
}

@test "Verdrahtung [Konfiguration]: Taskfile-workspace:deploy ruft den Guard auf" {
  run grep -qF 'render-guard.sh' "$REPO_ROOT/Taskfile.yml"
  assert_success
}
