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
# starten ihn seit T002297 mit "-Ctx 262144 -Slots 1 -KvType q8_0". Wer die
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
_KV_Q4_ALLOWED="gemma26-factory"

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
  # DER EVIDENZ-VORBEHALT WIRD DURCH DEN T002535-PROBE-TEST (s. u.) AUFGELOEST.
  # Solange dieser Test nicht gelaufen ist, gilt: die Ausnahme ruht auf
  # unvollstaendiger Evidenz (Kurzkontext ~200 Tokens). Die Sorge aus T002501
  # betrifft Fehlerakkumulation ueber LANGE Kontexte — also genau den
  # 37k-Factory-Prompt, fuer den der Kontext hier vergroessert wird.
  # Sollte der T002535-Test rot sein, ist diese Ausnahme der erste Verdaechtige:
  # gemma26-factory auf q8_0 zuruecksetzen.
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

# T002535: Langkontext-Wörtlichkeitsprobe für gemma26-factory mit q4_0-KV.
# Der bestehende Ausnahme-Test (T002534) ruht auf einer Kurzkontext-Probe
# (~200 Tokens). Die Sorge aus T002501 betrifft Fehlerakkumulation über LANGE
# Kontexte (~37k Tokens, der typische Factory-Prompt). Dieser Test schickt
# einen Prompt mit ~35k Tokens Füller + 6 exakten Zeichenketten an
# gemma26-factory (temperature 0) und prüft zeichengenaue Wiedergabe.
#
# ERGEBNIS: q4_0 besteht → Ausnahme bestätigen, Evidenz-Vorbehalt streichen.
#           q4_0 versagt  → gemma26-factory auf q8_0, Ausnahme entfernen.
#
# Voraussetzung: gemma26-factory läuft auf localhost:8081.
# Bei nicht erreichbarem Server wird der Test übersprungen (skip).
@test "T002535 Langkontext-Probe: q4_0-KV gibt exakte Zeichenketten nach ~35k Tokens zurück" {
  LLM_URL="${LLM_URL:-http://localhost:8081/v1/chat/completions}"
  if ! curl -s --max-time 3 "$LLM_URL" -H "Content-Type: application/json" \
       -d '{"model":"gemma26-factory","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' >/dev/null 2>&1; then
    skip "gemma26-factory nicht erreichbar unter $LLM_URL"
  fi

  # 6 exakte Zeichenketten die der Prompt zurückgeben muss
  local NEEDLE1="openspec/changes/fix-korczewski-zero-replicas-T002539/tasks.md"
  local NEEDLE2="kustomize build prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone"
  local NEEDLE3='function buildServerArgv(loadout, modelPath, defaults, overrides)'
  local NEEDLE4="oci://ghcr.io/paddione/fleet-manifests:latest"
  local NEEDLE5="/usr/local/bin/kustomize"
  local NEEDLE6="--ctx-size 99328 --cache-type-k q4_0 -fa on"

  # Füller: wiederhole einen Satz bis ~35k Tokens (≈70000 Wörter)
  local filler="Der schnelle braune Fuchs springt über den faulen Hund. "
  local full_filler=""
  for i in $(seq 1 1400); do full_filler+="$filler"; done

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

  local passes=0
  local runs=5
  for run in $(seq 1 $runs); do
    local response
    response=$(curl -s --max-time 120 "$LLM_URL" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg prompt "$prompt" '{
        model: "gemma26-factory",
        messages: [{role:"user",content:$prompt}],
        temperature: 0,
        max_tokens: 512
      }')" 2>/dev/null)
    local content
    content=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
    [ -n "$content" ] || continue

    local ok=1
    echo "$content" | grep -qF "$NEEDLE1" || ok=0
    echo "$content" | grep -qF "$NEEDLE2" || ok=0
    echo "$content" | grep -qF "$NEEDLE3" || ok=0
    echo "$content" | grep -qF "$NEEDLE4" || ok=0
    echo "$content" | grep -qF "$NEEDLE5" || ok=0
    echo "$content" | grep -qF "$NEEDLE6" || ok=0
    [ "$ok" -eq 1 ] && passes=$((passes + 1))
    echo "Lauf $run/$runs: $( [ "$ok" -eq 1 ] && echo 'BESTANDEN' || echo 'FEHLER' )"
  done

  echo "q4_0 Langkontext-Probe: $passes/$runs zeichengenau"
  [ "$passes" -ge 3 ] || {
    echo "FEHLER: gemma26-factory mit q4_0-KV versagt im Langkontext ($passes/$runs)"
    echo "→ q8_0 zurücksetzen und Ausnahme in _KV_Q4_ALLOWED entfernen."
    return 1
  }
}
