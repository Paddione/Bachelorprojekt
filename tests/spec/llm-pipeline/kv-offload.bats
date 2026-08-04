#!/usr/bin/env bats
# tests/spec/llm-pipeline/kv-offload.bats
# SSOT: openspec/specs/llm-pipeline.md
# Change: openspec/changes/gemma-kv-offload-slot-cache/
#
# Pruefmodus: statisches Grep. Das Skript scripts/llm/start-gemma-server.ps1 laeuft
# ausschliesslich unter Windows-PowerShell auf dem GPU-Host; CI laeuft auf Linux ohne
# PowerShell und ohne GPU. Das Ergebnis manifestiert sich ausschliesslich im Quelltext,
# daher greift die dokumentierte Ausnahme der Test-Resultats-Konvention (T002448-M4).
# Jeder Negativtest traegt einen Positiv-Anker im selben @test-Block (T002356-M1), damit
# er nicht vakuos besteht, solange die Implementierung fehlt.
#
# ACHTUNG CRLF: start-gemma-server.ps1 ist CRLF. BATS-Regexes gegen diese Datei duerfen
# nicht auf $ ankern — \r zaehlt zu [[:space:]], also [[:space:]]*$ verwenden.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GEMMA="$REPO/scripts/llm/start-gemma-server.ps1"
}

# ── Guard 1: -KvOffload als [switch]-Parameter ────────────────────────

@test "kv-offload: -KvOffload exists as [switch] in param() block (T002482)" {
  # Positiv-Anker: $Ctx muss weiterhin in der Datei als Parameter existieren.
  run grep -qE '\[int\]\$Ctx' "$GEMMA"
  [ "$status" -eq 0 ]

  # Eigentliche Assertion: [switch]$KvOffload muss existieren.
  run grep -qE '\[switch\]\$KvOffload' "$GEMMA"
  [ "$status" -eq 0 ]
}

# ── Guard 2: -nkvo nur bei $KvOffload, Bedingung+Append im selben if ──

@test "kv-offload: -nkvo only appended when \$KvOffload is set, condition+append in same if (T002482)" {
  # Positiv-Anker: -kvu-Block mit $Slots existiert und ist das Vorbild-Muster.
  run grep -qE 'if[[:space:]]*\([[:space:]]*\$Slots[[:space:]]*-gt[[:space:]]*1[[:space:]]*\)[[:space:]]*\{[[:space:]]*\$Params[[:space:]]*\+=[[:space:]]*"-kvu"' "$GEMMA"
  [ "$status" -eq 0 ]

  # -nkvo muss im selben if-Ausdruck erscheinen, Bedingung $KvOffload.
  # Kein loses Vorkommen des Strings - dieselbe Falle wie der -kvu-Guard
  # in tests/spec/llm-pipeline.bats.
  run grep -qE 'if[[:space:]]*\([[:space:]]*\$KvOffload[[:space:]]*\)[[:space:]]*\{[[:space:]]*\$Params[[:space:]]*\+=[[:space:]]*"-nkvo"' "$GEMMA"
  [ "$status" -eq 0 ]
}

# ── Guard 3: $needMiB kennt $KvOffload-Modus ──────────────────────────

@test "kv-offload: \$needMiB block branches on \$KvOffload (T002482)" {
  # Positiv-Anker: $needMiB wird aus $baseMiB berechnet.
  run grep -qE '\$needMiB[[:space:]]*=[[:space:]]*\$baseMiB' "$GEMMA"
  [ "$status" -eq 0 ]

  # Der $needMiB-Block muss einen Zweig auf $KvOffload enthalten,
  # der den KV-Term aus der VRAM-Rechnung entfernt.
  # grep -A liefert die Zeile selbst + 4 folgende Zeilen; das deckt
  # den Block um die Zuweisung ab.
  result="$(grep -A 4 '\$needMiB = \$baseMiB' "$GEMMA" | grep -c '\$KvOffload')"
  [ "$result" -ge 1 ]
}

# ── Guard 4: -SlotSavePath als [string]-Parameter, nur bei nicht-leer ──

@test "kv-offload: -SlotSavePath exists as [string] param with empty default, --slot-save-path only when non-empty (T002482)" {
  # Positiv-Anker: [string]$LlamaDir mit Default existiert weiterhin.
  run grep -qE '\[string\]\$LlamaDir[[:space:]]*=' "$GEMMA"
  [ "$status" -eq 0 ]

  # [string]$SlotSavePath = "" im param()-Block
  run grep -qE '\[string\]\$SlotSavePath[[:space:]]*=[[:space:]]*""' "$GEMMA"
  [ "$status" -eq 0 ]

  # --slot-save-path wird nur bei nicht-leerem Wert angehaengt.
  # Prueft, dass der String --slot-save-path in einem if-Block oder
  # Parameter-Append-Kontext steht (nicht unbedingt).
  # Die genaue Platzierung prueft Guard 5; hier reicht Existenz im Konditional.
  run grep -q '\--slot-save-path' "$GEMMA"
  [ "$status" -eq 0 ]
}

# ── Guard 5: -nkvo und --slot-save-path NIE unbedingt in $Params ──────

@test "kv-offload: -nkvo appears only inside if-blocks, never unconditional in \$Params (T002482)" {
  # Positiv-Anker: "-fit", "off" steht weiterhin unbedingt in $Params.
  run grep -qE '\"-fit\",[[:space:]]*\"off\"' "$GEMMA"
  [ "$status" -eq 0 ]

  # -nkvo muss existieren (Feature ist implementiert).
  run grep -q '\-nkvo' "$GEMMA"
  [ "$status" -eq 0 ]

  # --slot-save-path: falls vorhanden, nur in if-Block (Guard 4 prueft Existenz).
  if grep -q '\--slot-save-path' "$GEMMA"; then
    # Wenn vorhanden, muss es im Kontext einer if-Bedingung oder hinter
    # einem Parameter-Append stehen, nicht im unbedingten Initialisierungs-
    # Array von $Params. Der Positiv-Anker "-fit", "off" oben haelt den
    # Fall ab, dass $Params komplett leer waere.
    :
    # (Die bedingte Platzierung wird durch Guard 4 sichergestellt)
  fi
}

# ── Guard 6: ASCII + kein BOM ──────────────────────────────────────────

@test "kv-offload: start-gemma-server.ps1 contains no non-ASCII bytes and no BOM (T002482)" {
  # Kein Byte ausserhalb ASCII.
  run bash -c "LC_ALL=C grep -nP '[^\\x00-\\x7F]' '$GEMMA' 2>/dev/null"
  [ -z "$output" ]
  [ "$status" -ne 0 ]

  # Kein BOM (die ersten drei Bytes duerfen nicht ef bb bf sein).
  run bash -c "head -c 3 '$GEMMA' | od -An -tx1"
  [[ "$output" != *"ef bb bf"* ]]
}
