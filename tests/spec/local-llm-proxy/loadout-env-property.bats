#!/usr/bin/env bats
# tests/spec/local-llm-proxy/loadout-env-property.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002538
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Geprueft
# wird die von buildStartCommand() erzeugte Kommandozeile und der Rueckgabewert
# von parseLoadouts() — kein grep auf Script-Interna.
#
# Hintergrund: Die bge-Server sind CPU-gebunden (-ngl 0), allokieren aber
# trotzdem je Prozess rund 600 MB CUDA-Kontext. Nur CUDA_VISIBLE_DEVICES=''
# verhindert das. Ohne env-Unterstuetzung im Loadout-Schema waere ein
# Registry-Eintrag nicht aequivalent zu den handangelegten Units, sondern
# still schlechter — der VRAM-Gewinn (2,65 GB, entspricht rund 34.000 Tokens
# Kontext beim Gemma 26B) ginge verloren, ohne dass irgendetwas rot wird.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LOADOUTS="$REPO/scripts/llm/loadouts.json"
}

# Gibt die Kommandozeile fuer <slug> aus der echten loadouts.json aus.
_start_cmd() {
  node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    const { buildStartCommand } = await import('file://$REPO/scripts/llm-proxy/runner.mjs');
    const d = JSON.parse(readFileSync('$LOADOUTS', 'utf8'));
    const l = d.loadouts.find((x) => x.slug === '$1');
    if (!l) { console.error('slug nicht gefunden'); process.exit(1); }
    console.log(buildStartCommand(l, '/m.gguf', d.defaults, '/bin/llama-server').join('\n'));
  "
}

# Validiert ein Loadout-Dokument und gibt 'OK' oder die Fehlermeldung aus.
_validate() {
  node --input-type=module -e "
    const { parseLoadouts } = await import('file://$REPO/scripts/llm-proxy/loadouts.mjs');
    try { parseLoadouts(process.argv[1]); console.log('OK'); }
    catch (e) { console.log(e.message); }
  " "$1"
}

_doc_with_env() {
  cat <<EOF
{"version":1,"modelRoots":["~/m"],"defaults":{"host":"127.0.0.1"},"loadouts":[
 {"slug":"t","label":"t","model":"a.gguf","port":9999,
  "fit":{"enabled":false},"args":{"ctx":8192,"ngl":0},"env":$1}]}
EOF
}

# ── Schema ───────────────────────────────────────────────────────────────────

@test "T002538: env mit leerem Wert wird akzeptiert" {
  # Der eigentliche Anwendungsfall. Ein Schema, das leere Werte ablehnt, waere
  # fuer CUDA_VISIBLE_DEVICES unbrauchbar.
  run _validate "$(_doc_with_env '{"CUDA_VISIBLE_DEVICES":""}')"
  echo "$output"
  [ "$output" = "OK" ]
}

@test "T002538: env mit ungueltigem Variablennamen wird abgelehnt" {
  # Positiv-Anker zuerst (T002356-M1): ein gueltiger Name muss durchgehen,
  # sonst waere die Ablehnung auch bei kaputtem Schema 'richtig'.
  run _validate "$(_doc_with_env '{"GUELTIG_1":"x"}')"
  [ "$output" = "OK" ]

  run _validate "$(_doc_with_env '{"NICHT GUELTIG":"x"}')"
  echo "$output"
  [ "$output" != "OK" ]
  [[ "$output" == *"env-Name"* ]]
}

@test "T002538: env mit Nicht-String-Wert wird abgelehnt" {
  run _validate "$(_doc_with_env '{"A":"ok"}')"
  [ "$output" = "OK" ]

  run _validate "$(_doc_with_env '{"A":1}')"
  echo "$output"
  [ "$output" != "OK" ]
}

@test "T002538: env als Array wird abgelehnt" {
  run _validate "$(_doc_with_env '["A=1"]')"
  echo "$output"
  [ "$output" != "OK" ]
}

# ── Kommandozeile ────────────────────────────────────────────────────────────

@test "T002538: bge-embed setzt CUDA_VISIBLE_DEVICES als systemd-Property" {
  run _start_cmd bge-embed
  [ "$status" -eq 0 ]
  echo "$output"
  echo "$output" | grep -Fxq -- '--property=Environment=CUDA_VISIBLE_DEVICES='
}

@test "T002538: bge-rerank setzt CUDA_VISIBLE_DEVICES als systemd-Property" {
  run _start_cmd bge-rerank
  [ "$status" -eq 0 ]
  echo "$output" | grep -Fxq -- '--property=Environment=CUDA_VISIBLE_DEVICES='
}

@test "T002538: die Environment-Property steht VOR dem '--'-Trenner" {
  # Danach gaebe systemd-run sie als Argument an llama-server weiter, das die
  # Option nicht kennt und mit Fehler abbricht. Die Reihenfolge ist der
  # eigentliche Gegenstand — dass die Zeile ueberhaupt vorkommt, sagt nichts.
  run _start_cmd bge-embed
  [ "$status" -eq 0 ]
  local i_env i_sep
  i_env=$(echo "$output" | grep -nFx -- '--property=Environment=CUDA_VISIBLE_DEVICES=' | cut -d: -f1)
  i_sep=$(echo "$output" | grep -nFx -- '--' | head -1 | cut -d: -f1)
  echo "env at $i_env, separator at $i_sep"
  [ -n "$i_env" ] && [ -n "$i_sep" ]
  [ "$i_env" -lt "$i_sep" ]
}

@test "T002538: ein Loadout ohne env erzeugt keine Environment-Property" {
  # Gegenprobe: die Erweiterung darf bestehende Loadouts nicht veraendern.
  # Positiv-Anker zuerst — ohne ihn waere die Negativ-Aussage auch dann wahr,
  # wenn _start_cmd gar nichts ausgibt.
  run _start_cmd gemma26-factory
  [ "$status" -eq 0 ]
  echo "$output" | grep -Fxq -- '--property=Restart=on-failure'

  local n
  n=$(echo "$output" | grep -cF -- '--property=Environment=' || true)
  echo "Environment-Properties: $n"
  [ "$n" -eq 0 ]
}

@test "T002538: bge-embed und bge-rerank halten -ngl 0 und eigene Ports" {
  # Belegt, dass die Registry-Eintraege den laufenden Units entsprechen:
  # CPU-gebunden, und die kanonischen Ports 8095/8096 statt der stillgelegten
  # Batch-Ports 8085/8086.
  run _start_cmd bge-embed
  echo "$output" | grep -Fxq -- '8095'
  echo "$output" | grep -Fxq -- '0'

  run _start_cmd bge-rerank
  echo "$output" | grep -Fxq -- '8096'
}
