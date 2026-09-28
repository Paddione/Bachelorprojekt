#!/usr/bin/env bash
# tests/lib/guard-preconditions.sh — geteilte Umgebungs-Probes fuer BATS-Guards.
# SOURCE via `load` (nicht ausfuehren):
#   load "../../lib/guard-preconditions.sh"   # aus tests/spec/<area>/
#   load "../lib/guard-preconditions.sh"      # aus tests/spec/
#
# Regel (T900537, verallgemeinert T900651): Ein Probe muss die Ressource
# benennen, auf die die Assertion sich stuetzt — kein Liveness-Proxy
# ("Cluster antwortet", "Pod laeuft", "Port offen"), wo die Assertion eine
# spezifische Tabelle, Route oder ausgerollte Workload braucht. Ein falscher
# Probe meldet Umgebungsmangel als Produktfehler und faerbt test:changed rot,
# waehrend CI gruen ist.
#
# Zwei Ebenen pro Probe: Praedikat (0/1, still) + require_* (skippt mit
# benanntem Grund). require_* ruft `skip` auf und ist nur im BATS-Kontext
# gueltig; ausserhalb (z.B. Selbsttest) `skip` als Funktion stubben.

# ── Binary ─────────────────────────────────────────────────────────────

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# require_command <binary> [was] — Fix-Pfad-Konvention als Bibliothek.
require_command() {
  local bin="$1" what="${2:-$1}"
  command_exists "$bin" \
    || skip "${bin} nicht installiert — ${what} nicht pruefbar (Umgebung, kein Produktfehler; T900651)"
}

# ── TCP-Port (Loopback-Listener) ───────────────────────────────────────

port_open() {
  (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null
}

require_port() {
  local host="$1" port="$2" what="${3:-$1:$2}"
  port_open "$host" "$port" \
    || skip "${host}:${port} nicht erreichbar — ${what} nicht geprueft (Umgebung, kein Produktfehler; T900651)"
}

# ── HTTP ───────────────────────────────────────────────────────────────

# http_code <url> — gibt den Statuscode aus, leer wenn unerreichbar.
http_code() {
  curl -s -m 2 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true
}

# require_http <url> <erwarteter-code> [was] — die Route benennen, auf die
# die Assertion sich stuetzt (nicht /livez, wo /admin/state gemeint ist).
require_http() {
  local url="$1" expected="$2" what="${3:-$1}" code
  code="$(http_code "$url")"
  [ "$code" = "$expected" ] \
    || skip "${what} antwortet mit '${code:-kein Code}' statt '${expected}' (Umgebung, kein Produktfehler; T900651)"
}

# require_http_contains <url> <substring> [was] — wo die Assertion vom
# INHALT der Antwort abhaengt (z.B. Modell im Live-Katalog), nicht nur vom
# Code. Holt die Antwort einmal selbst (Loopback, Millisekunden).
require_http_contains() {
  local url="$1" needle="$2" what="${3:-$1}" body
  body="$(curl -s -m 2 "$url" 2>/dev/null || true)"
  [ -n "$body" ] || skip "${what} nicht erreichbar (Umgebung, kein Produktfehler; T900651)"
  [[ "$body" == *"$needle"* ]] \
    || skip "${what} enthaelt '${needle}' nicht (Umgebung, kein Produktfehler; T900651)"
}

# ── Node-Module (pnpm) ────────────────────────────────────────────────────
# Ein veralteter lokaler Install meldet Phantom-Fehler (z.B. 137 ESLint-
# Parser-Fehler bei gruener CI, T900653) — Umgebungsmangel, kein Produktfehler.
# Frische-Heuristik: .modules.yaml schreibt pnpm bei jedem Install neu; ist
# Lockfile oder package.json juenger, wurde seitdem nicht installiert.
node_modules_fresh() {
  local mod="$1/node_modules/.modules.yaml"
  [ -f "$mod" ] || return 1
  [ "$1/pnpm-lock.yaml" -ot "$mod" ] || return 1
  [ "$1/package.json" -ot "$mod" ] || return 1
  return 0
}

require_fresh_node_modules() {
  local dir="$1"
  node_modules_fresh "$dir" \
    || skip "${dir}/node_modules aelter als Lockfile/package.json — 'pnpm install' im Haupt-Checkout (nie im Worktree mit verlinkten Modulen; Umgebung, kein Produktfehler; T900653)"
}

# ── Kubernetes ─────────────────────────────────────────────────────────

k8s_context_ready() {
  command_exists kubectl || return 1
  kubectl --context "$1" get nodes --request-timeout=3s &>/dev/null
}

require_k8s_context() {
  local ctx="$1"
  require_command kubectl "Kubernetes-Probe"
  k8s_context_ready "$ctx" || skip "cluster ${ctx} not running"
}

# k8s_rollout_ready <context> <namespace> <kind> <name> — 0, wenn die
# Workload existiert UND readyReplicas == replicas != 0 ist. Ein laufender
# Cluster beweist kein ausgerolltes Deployment (T900537: devmesh da,
# sdlc-console 0/1).
k8s_rollout_ready() {
  local ctx="$1" ns="$2" kind="$3" name="$4" ready replicas
  ready="$(kubectl --context "$ctx" get "$kind" "$name" -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)"
  replicas="$(kubectl --context "$ctx" get "$kind" "$name" -n "$ns" -o jsonpath='{.spec.replicas}' 2>/dev/null || true)"
  [ "${ready:-0}" = "${replicas:-1}" ] && [ "${ready:-0}" != "0" ]
}

require_k8s_rollout() {
  local ctx="$1" ns="$2" kind="$3" name="$4" ready replicas
  require_k8s_context "$ctx"
  ready="$(kubectl --context "$ctx" get "$kind" "$name" -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)"
  replicas="$(kubectl --context "$ctx" get "$kind" "$name" -n "$ns" -o jsonpath='{.spec.replicas}' 2>/dev/null || true)"
  k8s_rollout_ready "$ctx" "$ns" "$kind" "$name" \
    || skip "${kind}/${name} in ${ctx}/${ns} nicht ausgerollt (readyReplicas=${ready:-0}/${replicas:-?}) — lokaler Stack unvollstaendig (Umgebung, kein Produktfehler; T900651)"
}
