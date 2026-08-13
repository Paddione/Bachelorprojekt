#!/usr/bin/env bats
# tests/spec/software-factory/sandbox-egress.bats
# SSOT: openspec/specs/software-factory.md
# T003871 — sandbox-run.sh: Egress-Allowlist ist wirkungslos (kein iptables im
# Bild, falscher netns, NET_ADMIN an jeden Container).
#
# Prüfmodus [T002448-M4]: Output-/Resultat-Verifikation — die Tests FÜHREN
# scripts/factory/sandbox-run.sh aus (bzw. inspizieren dessen Artefakte via
# `docker network inspect`) und prüfen die Ergebnisse.
#
# Externe Abhängigkeit [T002820]: Docker. CI hat kein docker (kein docker-Setup
# in .github/workflows/ci.yml), deshalb skip-Guard in setup().
#
# Probe-Design: reines Bash (keine Tool-Abhängigkeit im Probe-Image) —
#   - allowlistet: TCP-CONNECT durch den Egress-Proxy (Squid entscheidet per
#     dstdomain-ACL — die Antwortzeile ist die Durchsetzungsentscheidung)
#   - nicht-allowlistet: direkter Socket zu example.com:80 — ein Agent, der den
#     Proxy ignoriert, muss strukturell blockiert sein (internal network).

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

_skip_if_no_docker() {
  command -v docker >/dev/null 2>&1 || skip "docker not installed"
  docker info >/dev/null 2>&1 || skip "docker daemon not reachable"
}

# Positiv-Anker zuerst [T002356-M1]: der allowlistete Endpunkt muss durch den
# Proxy erreichbar bleiben, sonst waere die Negativ-Aussage trivial (ein Fix,
# der alles blockt, waere gruen). Danach die Negativ-Aussage: der
# nicht-allowlistete Host ist direkt nicht erreichbar. Auf dem Bestandscode
# schlaegt der Negativteil fehl (unbeschraenkter Egress: ERREICHT).
@test "sandbox egress: allowlisted host via proxy, non-allowlisted host blocked (T003871)" {
  _skip_if_no_docker
  local wt probe
  wt="$(mktemp -d)"
  probe='exec 3<>/dev/tcp/factory-sandbox-proxy/3128 && printf "CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n" >&3 && IFS= read -r -t 10 resp <&3 && case "$resp" in *" 200 "*) echo PROXY_OK ;; *) echo PROXY_FAIL ;; esac || echo PROXY_FAIL; if timeout 5 bash -c "exec 3<>/dev/tcp/example.com/80" 2>/dev/null; then echo ERREICHT; else echo BLOCKIERT; fi'
  run env FACTORY_REPO="$REPO" FACTORY_SANDBOX=docker FACTORY_SANDBOX_IMAGE=debian:bookworm \
    bash "$REPO/scripts/factory/sandbox-run.sh" "$wt" "$probe"
  local status_run="$status" output_run="$output"
  rm -rf "$wt"
  [ "$status_run" -eq 0 ]
  echo "$output_run" | grep -q 'PROXY_OK'
  echo "$output_run" | grep -q 'BLOCKIERT'
  ! echo "$output_run" | grep -q 'ERREICHT'
}

# Default-deny per Konstruktion: das Netz, das sandbox-run.sh anlegt, muss
# internal sein. Auf dem Bestandscode ist es ein normales Bridge-Netz (false) —
# rot.
@test "sandbox egress: sandbox network is internal (default-deny) (T003871)" {
  _skip_if_no_docker
  local wt
  wt="$(mktemp -d)"
  run env FACTORY_REPO="$REPO" FACTORY_SANDBOX=docker FACTORY_SANDBOX_IMAGE=debian:bookworm \
    bash "$REPO/scripts/factory/sandbox-run.sh" "$wt" 'true'
  rm -rf "$wt"
  [ "$status" -eq 0 ]
  run docker network inspect factory-sandbox-egress --format '{{.Internal}}'
  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}
