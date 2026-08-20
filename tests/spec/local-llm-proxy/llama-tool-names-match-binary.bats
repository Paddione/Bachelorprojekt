#!/usr/bin/env bats
# tests/spec/local-llm-proxy/llama-tool-names-match-binary.bats
# SSOT: openspec/specs/local-llm-proxy.md
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Der Test
# fragt das installierte Binary mit `llama-server --help` nach seiner Tool-Liste
# und vergleicht sie mit der Allowlist in scripts/llm-proxy/loadouts.mjs sowie
# mit den `tools`-Feldern in scripts/llm/loadouts.json. Er greppt keine
# Buildnummer — die sagt nichts darueber, welche Namen das Binary annimmt.
#
# WARUM: `--tools` ist fail-closed und BRICHT DEN START AB, wenn ein Name
# unbekannt ist ("tools setup failed: unknown tool ..."), noch bevor das Modell
# geladen wird. Am 2026-08-20 hatte ein llama.cpp-Upgrade 'get_datetime' in
# 'get_info' umbenannt; gemma26-factory fuehrte den alten Namen weiter, wurde
# von systemd 40 mal neu gestartet und war nie gesund. Weil es die
# exclusiveGroup 'chat-gpu' haelt, stoppte der Proxy bei jedem Startversuch
# zuvor das laufende gemma12-vision — die Stoerung zeigte sich also an einem
# Loadout, das gar nicht defekt war. Ein Guard, der nur die Repo-Dateien
# untereinander vergleicht, haette das nicht gesehen: beide waren in sich
# stimmig und beide falsch.
#
# SKIP statt Fehlschlag ohne Binary: auf CI-Runnern gibt es kein llama.cpp. Ein
# Guard, der dort gruen meldet, ohne geprueft zu haben, waere schlimmer als
# einer, der sich als uebersprungen ausweist.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
  LLAMA_BIN="${LLAMA_SERVER_BIN:-${HOME}/opt/llama-current/bin/llama-server}"
}

# Die vom Binary angebotenen Tool-Namen, einer je Zeile.
_binary_tools() {
  "${LLAMA_BIN}" --help 2>&1 \
    | sed -n '/available tools:/,/^ *note:/p' \
    | sed 's/.*available tools://' \
    | tr ',' '\n' \
    | sed 's/note:.*//' \
    | tr -d ' ' \
    | grep -E '^[a-z_]+$' \
    | sort -u
}

# Die Namen der Allowlist in loadouts.mjs, einer je Zeile.
_allowlist_tools() {
  node --input-type=module -e "
    const src = await import('${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs')
    // Die Menge ist modulprivat; sie wird ueber ihr Verhalten erhoben, damit
    // der Test nicht an einem Export haengt, den es nur fuer ihn gaebe.
    const probe = JSON.parse(await (await import('node:fs/promises')).readFile('${LOADOUTS}', 'utf8'))
    const one = structuredClone(probe.loadouts[0])
    // Nur EIN Loadout, und ohne 'roles': die Rollenketten verweisen auf die
    // uebrigen Slugs und wuerden den Probelauf aus einem Grund scheitern
    // lassen, der mit Tool-Namen nichts zu tun hat.
    const { roles, ...rest } = probe
    const doc = { ...rest, loadouts: [one] }
    for (const name of process.argv.slice(1)) {
      one.tools = name
      try { src.parseLoadouts(JSON.stringify(doc)); console.log(name) } catch { /* abgelehnt */ }
    }
  " -- $(_binary_tools) | sort -u
}

@test "T012970: die Allowlist akzeptiert jeden Tool-Namen des installierten Binaries" {
  [ -x "${LLAMA_BIN}" ] || skip "kein llama-server unter ${LLAMA_BIN}"

  run _binary_tools
  [ "$status" -eq 0 ]
  # Positiv-Anker: die Liste wurde ueberhaupt gelesen. Ohne ihn wuerde ein
  # geaendertes Hilfe-Format als leere Menge durchgehen und alles bestehen.
  [ -n "$output" ]
  echo "$output" | grep -qx 'read_file'

  local from_binary="$output"
  run _allowlist_tools
  [ "$status" -eq 0 ]

  local missing
  missing="$(comm -23 <(echo "$from_binary") <(echo "$output"))"
  [ -z "$missing" ] || {
    echo "Vom Binary angeboten, von der Allowlist abgelehnt: ${missing}" >&2
    echo "Reparatur: TOOL_NAMES in scripts/llm-proxy/loadouts.mjs angleichen." >&2
    false
  }
}

@test "T012970: kein Loadout fuehrt einen Tool-Namen, den das Binary nicht kennt" {
  [ -x "${LLAMA_BIN}" ] || skip "kein llama-server unter ${LLAMA_BIN}"

  run _binary_tools
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  local from_binary="$output"

  local declared
  declared="$(node -e "
    const doc = require('${LOADOUTS}')
    const out = new Set()
    for (const l of doc.loadouts) for (const t of (l.tools ?? '').split(',')) if (t) out.add(t)
    console.log([...out].sort().join('\n'))
  ")"

  # Positiv-Anker: mindestens ein Loadout deklariert ueberhaupt Tools. Ohne ihn
  # bestuende der Test auch dann, wenn das Feld ueberall verschwunden waere.
  [ -n "$declared" ]

  local unknown
  unknown="$(comm -13 <(echo "$from_binary") <(echo "$declared"))"
  [ -z "$unknown" ] || {
    echo "In loadouts.json deklariert, vom Binary nicht angeboten: ${unknown}" >&2
    echo "Diese Namen brechen den Start ab (exit 1, 'tools setup failed')." >&2
    false
  }
}
