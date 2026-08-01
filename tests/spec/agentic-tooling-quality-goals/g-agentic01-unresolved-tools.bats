#!/usr/bin/env bats
# tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats
# SSOT: openspec/specs/agentic-tooling-quality-goals.md
# Ticket: T002494 — Gate G-AGENTIC01 misst kuenftig ins Leere zeigende tools:-Eintraege
#
# PRUEFMODUS (Konvention T002448-M4): resultatsbasiert. Die Tests rufen den
# Zaehler als Kommando auf und pruefen dessen Ausgabe ($output/$status) gegen
# vorbereitete Fixtures. KEIN grep auf Script-Interna. Genau dafuer wird die
# Messung aus dem Inline-Ausdruck in health-goals-check.sh in ein eigenes,
# parametrisierbares Skript gezogen.
#
# HINTERGRUND
# Gate G-AGENTIC01 forderte bisher einen tools:-Key fuer bachelorprojekt-{db,
# infra,security}. Test T002221 (tests/spec/agent-library.bats) verbietet genau
# das — er war ein Bugfix: die fruehere Liste nannte 'mcp_postgres_query' statt
# 'mcp__mcp-postgres__query', resolvte zur leeren Menge, und jeder Dispatch starb
# mit "would be spawned with zero tools - refusing". Das Gate mass damit ein
# Stellvertretermerkmal (Key vorhanden?) statt des realen Schadens (Eintrag zeigt
# ins Leere?). T002494 stellt es auf den realen Schaden um.
#
# ZWEI ZU ZAEHLENDE ZUSTAENDE:
#   (a) tools:-Key vorhanden, resolvt aber zur leeren Menge
#   (b) tools:-Eintrag der Form mcp__<server>__<tool>, dessen <server> nicht
#       unter clients: in docs/agent-guide/registry/mcp.yaml steht
#
# POSITIV-ANKER-PFLICHT (T002356-M1): Der Repo-Ist-Zustand kennt derzeit KEINEN
# einzigen mcp__*-Eintrag in irgendeinem tools:-Key. Eine reine Negativaussage
# ("kein unbekannter MCP-Name") waere damit vakuos gruen — die Kandidatenliste
# ist leer. Deshalb pruefen die Tests unten ZUERST an einer Fixture, dass der
# gueltige Fall durchlaeuft und der ungueltige Fall tatsaechlich gezaehlt wird.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  COUNTER="$REPO/scripts/lib/count-unresolved-agent-tools.sh"
  REGISTRY="$REPO/docs/agent-guide/registry/mcp.yaml"
  FIXTURES="$BATS_TEST_TMPDIR/agents"
  mkdir -p "$FIXTURES"
}

# Schreibt eine minimale Agent-Definition mit dem uebergebenen tools:-Block.
_mkagent() {
  local name="$1"; shift
  {
    echo "---"
    echo "name: $name"
    echo "description: fixture"
    if [ "$#" -gt 0 ]; then
      echo "tools:"
      for t in "$@"; do echo "  - $t"; done
    fi
    echo "---"
    echo "fixture body"
  } > "$FIXTURES/$name.md"
}

# ── Positiv-Anker: der gueltige Fall MUSS durchlaufen ──────────────────

@test "T002494 POSITIV-ANKER: Agent mit gueltigen Built-ins und gueltigem MCP-Namen zaehlt 0" {
  # Ohne diesen Anker koennte der Zaehler konstant 0 zurueckgeben und alle
  # Negativtests unten wuerden trotzdem bestehen.
  _mkagent valid-agent Bash Read mcp__mcp-postgres__query
  run bash "$COUNTER" "$FIXTURES" "$REGISTRY"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "T002494 POSITIV-ANKER: Agent ganz ohne tools:-Key zaehlt 0 (er erbt alle)" {
  # Das ist der von T002221 bewusst hergestellte Zustand der drei Agenten
  # bachelorprojekt-{db,infra,security}. Er darf das Gate NICHT ausloesen —
  # exakt hier lag der alte Widerspruch.
  _mkagent keyless-agent
  run bash "$COUNTER" "$FIXTURES" "$REGISTRY"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# ── Zustand (a): tools: resolvt zur leeren Menge ───────────────────────

@test "T002494: tools:-Key, der zur leeren Menge resolvt, wird gezaehlt" {
  printf -- '---\nname: empty-agent\ndescription: fixture\ntools: []\n---\nbody\n' \
    > "$FIXTURES/empty-agent.md"
  run bash "$COUNTER" "$FIXTURES" "$REGISTRY"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ── Zustand (b): MCP-Name zeigt ins Leere ──────────────────────────────

@test "T002494: falsch geschriebener MCP-Name (der T002221-Bug) wird gezaehlt" {
  # Genau die Schreibweise, die den urspruenglichen Zero-Tool-Bug ausloeste:
  # einfacher Unterstrich, Servername nicht abgetrennt.
  _mkagent legacy-bug-agent Bash mcp_postgres_query
  run bash "$COUNTER" "$FIXTURES" "$REGISTRY"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "T002494: mcp__<server>__<tool> mit unbekanntem Server wird gezaehlt" {
  _mkagent ghost-server-agent Bash mcp__gibt-es-nicht__query
  run bash "$COUNTER" "$FIXTURES" "$REGISTRY"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "T002494: mehrere Verstoesse werden aufsummiert, nicht auf 1 gedeckelt" {
  _mkagent ghost-a Bash mcp__gibt-es-nicht__query
  _mkagent ghost-b Bash mcp__auch-nicht__query
  run bash "$COUNTER" "$FIXTURES" "$REGISTRY"
  [ "$status" -eq 0 ]
  [ "$output" = "2" ]
}

# ── Realer Repo-Zustand: das Gate-Ziel ─────────────────────────────────

@test "T002494: der reale Agentenbestand erfuellt das Gate-Ziel (<= 0)" {
  run bash "$COUNTER" "$REPO/.claude/agents" "$REGISTRY"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# ── Fail-closed: kaputte Eingaben duerfen nicht still 0 liefern ────────

@test "T002494: fehlende Registry bricht mit rc=2 ab statt still 0 zu melden" {
  # Ein Zaehler, der bei unlesbarer Registry 0 zurueckgibt, meldet ein gruenes
  # Gate auf Basis einer nicht stattgefundenen Messung.
  #
  # Geprueft wird auf den DEFINIERTEN Code 2, nicht auf "irgendwas != 0":
  # solange das Skript fehlt, liefert bash 127 — ein `-ne 0` waere also auch
  # ohne jede Implementierung gruen und damit vakuos (Konvention T002356-M1).
  _mkagent any-agent Bash
  run bash "$COUNTER" "$FIXTURES" "$REPO/docs/agent-guide/registry/gibt-es-nicht.yaml"
  [ "$status" -eq 2 ]
}
