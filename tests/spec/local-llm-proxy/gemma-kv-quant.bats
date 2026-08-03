#!/usr/bin/env bats
# tests/spec/local-llm-proxy/gemma-kv-quant.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002459 (Korrektur aus T002501)
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Geprueft
# wird die von buildServerArgv() tatsaechlich erzeugte Kommandozeile, nicht der
# Inhalt von loadouts.json und kein grep auf Script-Interna.
#
# Hintergrund: Beim Cutover von scripts/llm/start-gemma-server.ps1 auf den
# Linux-Loadout-Stack wurden cacheTypeK/V = q4_0 uebernommen. Das ist der
# param()-DEFAULT des PowerShell-Skripts — nicht das Profil, mit dem der Server
# tatsaechlich laeuft. watchdog-llm-servers.ps1 und install-startup-autostart.ps1
# starteten ihn von T002297 bis zu ihrer Entfernung (T002551) mit
# "-Ctx 262144 -Slots 1 -KvType q8_0". Wer die
# Defaults migriert, senkt die Qualitaet still: der Skriptkopf schreibt q4_0-KV
# ausdruecklich zu, es degradiere das woertliche Zurueckholen von Pfaden,
# Symbolnamen und Tool-Call-Argumenten.
#
# VRAM ist kein Gegenargument: mit "-fit on" sizet llama.cpp den Kontext selbst
# und "-fitc" haelt nur die Untergrenze. Auf der RTX 5070 Ti (16303 MiB) kostet
# der schlechteste Fall (gemma-multiagent, minCtx 65536, q8_0) rund 9137 MiB plus
# 2400 MiB Margin — knapp 4,7 GB Luft.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LOADOUTS="$REPO/scripts/llm/loadouts.json"
}

# Gibt je GPU-Chat-Loadout eine Zeile "<slug> <ctk> <ctv> <fa>" aus.
_argv_facts() {
  node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    const { buildServerArgv } = await import('file://$REPO/scripts/llm-proxy/runner.mjs');
    const d = JSON.parse(readFileSync('$LOADOUTS', 'utf8'));
    const defaults = { host: '127.0.0.1' };
    for (const l of d.loadouts) {
      if (l.exclusiveGroup !== 'chat-gpu') continue;
      const argv = buildServerArgv(l, '/models/x.gguf', defaults, {});
      const val = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : '-'; };
      console.log([l.slug, val('-ctk'), val('-ctv'), val('-fa')].join(' '));
    }
  "
}

@test "GPU-Chat-Loadouts existieren und erzeugen ueberhaupt eine KV-Quantisierung" {
  # Positiv-Anker fuer die Negativ-Aussage im naechsten Test: gaebe es keine
  # chat-gpu-Loadouts oder setzte keines ein -ctk, waere "kein q4_0" trivial erfuellt.
  run _argv_facts
  echo "$output"
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  local n_total n_with_ctk
  n_total=$(echo "$output" | grep -c .)
  n_with_ctk=$(echo "$output" | awk '$2 != "-"' | grep -c .)
  echo "chat-gpu-Loadouts: $n_total, davon mit -ctk: $n_with_ctk"
  [ "$n_total" -ge 2 ]
  # Mindestens eines, nicht alle: ein Loadout DARF cacheType weglassen und damit
  # llama.cpps f16-Default nehmen (so faehrt devstral-quality). Der Anker soll
  # nur belegen, dass der -ctk-Pfad ueberhaupt existiert — sonst waere die
  # Negativ-Aussage im naechsten Test vakuos.
  [ "$n_with_ctk" -ge 1 ]

  # Die beiden Gemma-Loadouts sind der Gegenstand dieser Datei und MUESSEN
  # quantisieren; fehlt einer, ist der Guard blind geworden.
  echo "$output" | awk '$1 == "gemma-factory"'    | grep -q .
  echo "$output" | awk '$1 == "gemma-multiagent"' | grep -q .
}

# Loadouts, die bewusst von der q4_0-Sperre ausgenommen sind. Jeder Eintrag
# braucht eine Begruendung im Block darunter — die Liste ist keine Sammelstelle.
_KV_Q4_ALLOWED="gemma26-factory
gemma9-factory"

@test "nur ausdruecklich ausgenommene GPU-Chat-Loadouts starten mit q4_0-KV" {
  run _argv_facts
  [ "$status" -eq 0 ]

  # Der eigentliche Gegenstand. q4_0 degradiert Tool-Call-Argumente; das
  # ueberwachte Profil faehrt q8_0.
  #
  # AUSNAHME gemma26-factory (T002534): Das 26B-A4B-Modell belegt 14,25 GB von
  # 16 GB VRAM, die es sich mit dem Windows-Desktop teilt. Mit q8_0 bleiben
  # 62464 Kontext, mit q4_0 sind es 99328 — bei gemessen gleichem Durchsatz
  # (160 vs. 166 tok/s). Eine Woertlichkeits-Probe mit sechs exakten
  # Zeichenketten (Kustomize-Pfad, Manifest-Dateiname, Funktionssignatur mit
  # Klammern und Kommata, OCI-Referenz, absoluter Binaerpfad, Flag-Kombination)
  # kam bei temperature 0 fuenfmal von fuenf zeichengenau zurueck.
  #
  # EVIDENZ-STAND (T002579, 2026-08-02): die Langkontext-Probe weiter unten ist
  # nachgeholt worden und faellt zugunsten von q4_0 aus — 39388 Prompt-Tokens,
  # fuenf von fuenf Laeufen zeichengenau (30/30). Die Ausnahme ruht damit nicht
  # mehr allein auf der Kurzkontext-Probe von ~200 Tokens.
  #
  # Sie ruht aber weiterhin auf einem REDUNDANTEN Fuellkontext (ein wiederholter
  # Satz). Echte Factory-Prompts aus Code, Diffs und Logs sind heterogen und
  # belasten den KV-Cache staerker; die Fehlerakkumulation, um die es T002501
  # geht, ist damit gemildert belegt, nicht ausgeschlossen.
  # Bei Fehlern in Tool-Call-Argumenten oder Pfaden bleibt diese Ausnahme der
  # erste Verdaechtige: gemma26-factory auf q8_0 zuruecksetzen.
  #
  # AUSNAHME gemma9-factory (T002599): Gemma 2 9B mit 98304 Kontext und 2 Slots.
  # q8_0-KV wuerde ~55705 ctx pro Slot erlauben; q4_0 halbiert den KV-Fussabdruck
  # und erreicht 98304 ctx — gebraucht fuer lange Agenten-Dispatch-Sessions.
  # Tool-Call-Argumente in dieser Konfiguration verifiziert (smoke, auto,
  # multi-arg, E2E — alle korrekt).
  #
  # Bis T002579 zeigte die Probe auf localhost:8081 — den toten TEI-Port — und
  # skippte deshalb bei jedem Lauf, waehrend T002535 als done gefuehrt wurde.
  local offenders
  offenders=$(echo "$output" | awk '$2 == "q4_0" || $3 == "q4_0" { print $1 }' \
              | grep -vxF "$_KV_Q4_ALLOWED" || true)
  echo "unerlaubte q4_0-Loadouts: ${offenders:-<keine>}"
  [ -z "$offenders" ]
}

@test "die q4_0-Ausnahme ist wirksam und nicht bloss deklariert" {
  # Positiv-Anker: Waere gemma26-factory nicht mehr auf q4_0 (oder ganz weg),
  # liefe der Test darueber vakuos durch — er verbietet dann nur noch etwas,
  # das ohnehin niemand tut. Dieser Test faellt in dem Fall auf.
  run _argv_facts
  [ "$status" -eq 0 ]
  echo "$output" | awk '$1 == "gemma26-factory" && ($2 == "q4_0" && $3 == "q4_0")' | grep -q .
}

@test "quantisierter KV-Cache zieht FlashAttention nach sich" {
  # Harte Kopplung in llama.cpp: mit "-fa off" bricht der Start ab mit
  # "V cache quantization requires flash_attn". Nur f16 laedt ohne. Ein Loadout
  # mit quantisiertem KV und ohne -fa on startet also gar nicht erst.
  run _argv_facts
  [ "$status" -eq 0 ]

  local broken
  broken=$(echo "$output" | awk '($2 == "q8_0" || $2 == "q4_0") && $4 != "on" { print $1 }')
  echo "quantisiert ohne -fa on: ${broken:-<keine>}"
  [ -z "$broken" ]
}

# T002535/T002579: Langkontext-Wörtlichkeitsprobe für gemma26-factory mit q4_0-KV.
#
# WARUM DIESER TEST FRÜHER NIE LIEF: er richtete seine Anfrage an localhost:8081
# — den Port des am 2026-07-27 decommissionierten TEI-Embed-Dienstes.
# gemma26-factory läuft auf 8091. Der Skip-Guard griff deshalb bei JEDEM Lauf,
# die Probe hat nie gemessen, und T002535 wurde trotzdem auf done gesetzt.
#
# ERGEBNIS DER NACHGEHOLTEN MESSUNG (2026-08-02, T002579): bei 39388
# Prompt-Tokens kamen in fünf von fünf Läufen alle sechs Zeichenketten
# zeichengenau zurück (30/30). Die q4_0-Ausnahme aus T002534 ist damit für den
# Langkontext belegt — anders als vorher, wo nur eine ~200-Token-Probe vorlag.
#
# VERBLEIBENDE EINSCHRÄNKUNG (der Vorbehalt ist präzisiert, nicht erledigt):
# der Füllkontext ist ein wiederholter Satz und damit hochredundant. Echte
# Factory-Prompts (Code, Diffs, Logs) sind heterogen und belasten den KV-Cache
# stärker. Bei Fehlern in Tool-Call-Argumenten oder Pfaden bleibt die
# q4_0-Ausnahme der erste Verdächtige; der Hebel ist -KvType q8_0.
#
# Voraussetzung: gemma26-factory läuft auf dem Port aus loadouts.json.
# Bei nicht erreichbarem Server wird übersprungen (skip).
@test "T002535 Langkontext-Probe: q4_0-KV gibt exakte Zeichenketten nach ~39k Tokens zurück" {
  # Port aus der Registry statt hartkodiert — so kann eine Portänderung in
  # loadouts.json die Probe nicht erneut stillschweigend abschalten.
  local port
  port=$(python3 -c "
import json
d=json.load(open('scripts/llm/loadouts.json'))
lo=[x for x in d['loadouts'] if x['slug']=='gemma26-factory']
print(lo[0]['port'] if lo else '')
")
  [ -n "$port" ] || { echo "kein gemma26-factory-Loadout in loadouts.json"; return 1; }
  LLM_URL="${LLM_URL:-http://127.0.0.1:${port}/v1/chat/completions}"

  # Skip-Guard über den HTTP-Status, nicht über den curl-Exit: `curl -s`
  # liefert auch bei HTTP 500 Exit 0 und würde einen kaputten Server für
  # gesund halten (T002574).
  source "$(dirname "$BATS_TEST_FILENAME")/helpers/llm-endpoint.bash"
  local health_code
  health_code=$(llm_endpoint_healthy "http://127.0.0.1:${port}/health") || \
    skip "gemma26-factory auf :${port} nicht verfügbar (HTTP ${health_code})"

  local NEEDLE1="openspec/changes/fix-korczewski-zero-replicas-T002539/tasks.md"
  local NEEDLE2="kustomize build prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone"
  local NEEDLE3='function buildServerArgv(loadout, modelPath, defaults, overrides)'
  local NEEDLE4="oci://ghcr.io/paddione/fleet-manifests:latest"
  local NEEDLE5="/usr/local/bin/kustomize"
  local NEEDLE6="--ctx-size 99328 --cache-type-k q4_0 -fa on"

  # 2800 statt 1400 Wiederholungen: 1400 ergaben gemessen nur 19788 Tokens.
  # Ein wiederholter Satz tokenisiert mit ~14 Tokens je Wiederholung, deutlich
  # effizienter als eine Überschlagsrechnung nach Zeichenzahl vermuten lässt.
  local filler="Der schnelle braune Fuchs springt über den faulen Hund. "
  local full_filler=""
  for i in $(seq 1 2800); do full_filler+="$filler"; done

  local prompt="Merke dir die folgenden sechs exakten Zeichenketten wörtlich:
1. $NEEDLE1
2. $NEEDLE2
3. $NEEDLE3
4. $NEEDLE4
5. $NEEDLE5
6. $NEEDLE6

$full_filler

Gib jetzt die sechs Zeichenketten exakt so zurück wie oben, eine pro Zeile:
1. "

  # Prompt und Payload über DATEIEN, nicht über Argumente: bei ~160k Zeichen
  # scheitert jq sonst mit "Argument list too long" (ARG_MAX) — der Server
  # bekommt dann nichts, und ohne den prompt_tokens-Anker unten sähe das
  # Ergebnis wie ein bestandener Lauf aus.
  local prompt_file="$BATS_TEST_TMPDIR/kv-probe-prompt.txt"
  local payload_file="$BATS_TEST_TMPDIR/kv-probe-payload.json"
  printf '%s' "$prompt" > "$prompt_file"
  # enable_thinking:false ist Pflicht, seit Thinking der Server-Default ist
  # (T002579/P4): sonst bleibt content leer, bis die Denkphase endet, und die
  # Probe misst das Reasoning-Budget statt der KV-Treue (T002501).
  jq -n --rawfile p "$prompt_file" '{
    model: "gemma26-factory",
    messages: [{role:"user",content:$p}],
    temperature: 0,
    max_tokens: 900,
    chat_template_kwargs: {enable_thinking: false}
  }' > "$payload_file"

  local passes=0
  local runs=5
  for run in $(seq 1 $runs); do
    local response
    response=$(curl -s --max-time 600 "$LLM_URL" \
      -H "Content-Type: application/json" -d @"$payload_file" 2>/dev/null)

    # POSITIV-ANKER (T002356-M1): ohne Beleg der tatsächlichen Prompt-Größe
    # meldet die Probe auch dann Erfolg, wenn der Füllkontext gar nicht griff.
    # Am 2026-08-02 ist genau das zweimal passiert — 19788 Tokens (Füller zu
    # kurz) und 0 Tokens (jq an ARG_MAX gescheitert).
    local ptok
    ptok=$(echo "$response" | jq -r '.usage.prompt_tokens // 0' 2>/dev/null)
    if [ "${ptok:-0}" -lt 20000 ]; then
      echo "UNGÜLTIG: nur ${ptok:-0} Prompt-Tokens — Langkontext nicht erreicht."
      echo "Die Probe misst dann nicht, was sie messen soll."
      return 1
    fi

    local content
    content=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
    # Leerer content ist ein FEHLSCHLAG, kein Grund zum Überspringen: genau so
    # äußert sich der T002501-Ausfallmodus (Denkphase frisst max_tokens,
    # finish_reason=length). Ein `continue` würde ihn unsichtbar machen.
    if [ -z "$content" ]; then
      echo "Lauf $run/$runs: LEERE ANTWORT (finish_reason=$(echo "$response" | jq -r '.choices[0].finish_reason // "?"'))"
      continue
    fi

    local ok=1
    echo "$content" | grep -qF -- "$NEEDLE1" || ok=0
    echo "$content" | grep -qF -- "$NEEDLE2" || ok=0
    echo "$content" | grep -qF -- "$NEEDLE3" || ok=0
    echo "$content" | grep -qF -- "$NEEDLE4" || ok=0
    echo "$content" | grep -qF -- "$NEEDLE5" || ok=0
    echo "$content" | grep -qF -- "$NEEDLE6" || ok=0
    [ "$ok" -eq 1 ] && passes=$((passes + 1))
    echo "Lauf $run/$runs (${ptok} Tokens): $( [ "$ok" -eq 1 ] && echo 'BESTANDEN' || echo 'FEHLER' )"
  done

  echo "q4_0 Langkontext-Probe: $passes/$runs zeichengenau"
  [ "$passes" -ge 3 ] || {
    echo "FEHLER: gemma26-factory mit q4_0-KV versagt im Langkontext ($passes/$runs)"
    echo "→ q8_0 zurücksetzen und Ausnahme in _KV_Q4_ALLOWED entfernen."
    return 1
  }
}
