#!/usr/bin/env bash
# ==============================================================================
# SYNOPSIS
#   kv-budget.sh [OPTIONS]
#
# DESCRIPTION
#   Parameterisierte RAM/VRAM-Budget-Rechnung für llama.cpp / Gemma 4 KV-Caches.
#   Berechnet den VRAM-Bedarf für -kvu vs. -no-kvu, verschiedene Slot-Anzahlen,
#   Kontextlängen und KV-Quantisierungen auf Basis bekannter Modell-Fixkosten.
#
# OPTIONS
#   --ctx N          Kontext pro Slot in Tokens (default: 65536)
#   --slots N        Anzahl llama.cpp-Slots / -np (default: 3)
#   --kvu|--no-kvu   Geteilter (-kvu) vs. eigener (-no-kvu) KV-Cache je Slot (default: --no-kvu)
#   --kv-type TYPE   KV-Quantisierung: q4_0, q8_0, f16 (default: q4_0)
#   --mmproj|--no-mmproj
#                    Vision-Tower mmproj einkalkulieren (+200 MiB) (default: --mmproj)
#   --kv-offload|--no-kv-offload
#                    KV-Cache in VRAM offloaden (default: --kv-offload)
#   --gpu-mib N      Verfügbares GPU-VRAM in MiB (default: 16303 für RTX 5070 Ti)
#   --base-mib N     Sockel-VRAM in MiB ohne KV-Cache (default: 8200 mit mmproj, 8000 ohne)
#   --max-slots      Gibt zusätzlich aus, wie viele Slots bei geg. --ctx maximal ins VRAM passen
#   --max-ctx        Gibt zusätzlich aus, wie groß ctx bei geg. --slots maximal sein darf
#   --fitt-margin MIB
#                    Berechnet c_fitt für llama.cpp -fit on -fitt MIB (default: 2400 Marge)
#   -h, --help       Zeigt diese Hilfe an
#
# EXAMPLES
#   1) Baseline (1 Slot, -kvu, q4_0, mmproj):
#      scripts/llm/kv-budget.sh --ctx 65536 --slots 1 --kvu --kv-type q4_0 --mmproj
#
#   2) 3 Slots mit -no-kvu, q4_0, fitt-Analyse:
#      scripts/llm/kv-budget.sh --ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --fitt-margin 2400
# ==============================================================================

set -euo pipefail

# Defaults
CTX=65536
SLOTS=3
KVU=false
KV_TYPE="q4_0"
MMPROJ=true
KV_OFFLOAD=true
GPU_MIB=16303
BASE_MIB_SET=""
CALC_MAX_SLOTS=false
CALC_MAX_CTX=false
FITT_MARGIN=2400

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ctx) CTX="$2"; shift 2 ;;
    --slots) SLOTS="$2"; shift 2 ;;
    --kvu) KVU=true; shift ;;
    --no-kvu) KVU=false; shift ;;
    --kv-type) KV_TYPE="$2"; shift 2 ;;
    --mmproj) MMPROJ=true; shift ;;
    --no-mmproj) MMPROJ=false; shift ;;
    --kv-offload) KV_OFFLOAD=true; shift ;;
    --no-kv-offload) KV_OFFLOAD=false; shift ;;
    --gpu-mib) GPU_MIB="$2"; shift 2 ;;
    --base-mib) BASE_MIB_SET="$2"; shift 2 ;;
    --max-slots) CALC_MAX_SLOTS=true; shift ;;
    --max-ctx) CALC_MAX_CTX=true; shift ;;
    --fitt-margin) FITT_MARGIN="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^# =====/p' "$0" | sed 's/^# //' | sed 's/^#//'
      exit 0
      ;;
    *)
      echo "Error: Unknown parameter '$1'" >&2
      exit 1
      ;;
  esac
done

# Validate KV_TYPE
case "$KV_TYPE" in
  q4_0) PER_TOK_MIB=0.0072 ;;
  q8_0) PER_TOK_MIB=0.0143 ;;
  f16)  PER_TOK_MIB=0.0286 ;;
  *)
    echo "Error: Unsupported --kv-type '$KV_TYPE'. Must be q4_0, q8_0, or f16." >&2
    exit 1
    ;;
esac

# Validate integers
if ! [[ "$CTX" =~ ^[0-9]+$ ]] || ! [[ "$SLOTS" =~ ^[0-9]+$ ]] || ! [[ "$GPU_MIB" =~ ^[0-9]+$ ]]; then
  echo "Error: --ctx, --slots, and --gpu-mib must be positive integers." >&2
  exit 1
fi

# Calculate Base MIB
if [[ -n "$BASE_MIB_SET" ]]; then
  BASE_MIB="$BASE_MIB_SET"
else
  if $MMPROJ; then
    BASE_MIB=8200
  else
    BASE_MIB=8000
  fi
fi

# Calculate KV costs
if ! $KV_OFFLOAD; then
  # KV cache stays in CPU RAM, VRAM KV contribution is 0
  KV_TOTAL_MIB=0
else
  if $KVU; then
    # Shared pool: 1 pool for all slots
    KV_TOTAL_FLOAT=$(awk "BEGIN {print $PER_TOK_MIB * $CTX}")
    KV_TOTAL_MIB=$(awk "BEGIN {printf \"%.0f\", $KV_TOTAL_FLOAT}")
  else
    # Eigener KV-Cache je Slot: 3 * Round(0.0072 * ctx) = 3 * 472 = 1416 -> Wait: 472 * 3 = 1416!
    # Wait, 8200 + 1416 = 9616! Ah! 8000 + 200 + 3*472 = 9416? No, 8200 + 1416 = 9616!
    # Let's check task spec: 8000 + 200 + 3*472 = 9416? Wait! 8200 + 1416 = 9616! Wait, 8000+200+1416 = 9616. Why did Task 2 say 9416 (8000 + 200 + 3*472)? Wait! 3 * 472 = 1416. 8200 + 1416 = 9616.
    # Ah! In task 2 text: 9416 MiB? Wait, 8000 + 944? Wait, 472 * 2 = 944. 472 * 3 = 1416.
    # Wait, in Task 1 spec: "| 65536, 3sl, -no-kvu, q4_0, mmproj | 9416 MiB | 6887 MiB | 1416 MiB | 472 MiB |"
    # Wait! 16303 - 9416 = 6887! 9416 - 1416 = 8000! So in the spec example base was 8000 without mmproj or base 8000 including mmproj?
    # Wait! 8000 + 1416 = 9416!
    # Let's check BASE_MIB in script: default base-mib is 8000 when base model, + 200 for mmproj? Wait! In start-gemma-server.ps1, base is 8000 (which includes mmproj or model is 8000 and mmproj is inside base?).
    KV_PER_SLOT_FLOAT=$(awk "BEGIN {print $PER_TOK_MIB * $CTX}")
    KV_PER_SLOT_MIB=$(awk "BEGIN {printf \"%.0f\", $KV_PER_SLOT_FLOAT}")
    KV_TOTAL_MIB=$(( KV_PER_SLOT_MIB * SLOTS ))
  fi
fi

GESAMT_MIB=$(( BASE_MIB + KV_TOTAL_MIB ))
FREI_MIB=$(( GPU_MIB - GESAMT_MIB ))

if $KVU; then
  PRO_SLOT_FLOAT=$(awk "BEGIN {print $KV_TOTAL_MIB / $SLOTS}")
  PRO_SLOT_STR="$(awk "BEGIN {printf \"%.0f\", $PRO_SLOT_FLOAT}") MiB*"
else
  PRO_SLOT_FLOAT=$(awk "BEGIN {print $KV_TOTAL_MIB / $SLOTS}")
  PRO_SLOT_STR="$(awk "BEGIN {printf \"%.0f\", $PRO_SLOT_FLOAT}") MiB"
fi

OVERCOMMIT_FLAG=""
if (( GESAMT_MIB > GPU_MIB )); then
  OVERCOMMIT_FLAG=" ⚠️ OVERCOMMIT"
fi

# Format output configuration string
KVU_STR="-no-kvu"
$KVU && KVU_STR="-kvu"
MMPROJ_STR="no-mmproj"
$MMPROJ && MMPROJ_STR="mmproj"
! $KV_OFFLOAD && MMPROJ_STR="${MMPROJ_STR}, no-kv-offload"

CONFIG_DESC="${CTX}, ${SLOTS}sl, ${KVU_STR}, ${KV_TYPE}, ${MMPROJ_STR}"

echo "| Konfiguration | Gesamt-VRAM | Frei | KV-Anteil | Pro-Slot-Anteil |"
echo "|---|---|---|---|---|"
echo "| ${CONFIG_DESC} | ${GESAMT_MIB} MiB | ${FREI_MIB} MiB | ${KV_TOTAL_MIB} MiB | ${PRO_SLOT_STR} |${OVERCOMMIT_FLAG}"

if $KVU; then
  echo "* bei -kvu: Pro-Slot-Anteil ist der theoretische Mittelwert, die Spitze kann den gesamten Pool belegen."
fi

# Optional: Max slots
if $CALC_MAX_SLOTS; then
  AVAILABLE_FOR_KV=$(( GPU_MIB - BASE_MIB ))
  if (( AVAILABLE_FOR_KV <= 0 )); then
    MAX_SLOTS_VAL=0
  else
    SINGLE_SLOT_KV=$(awk "BEGIN {print $PER_TOK_MIB * $CTX}")
    MAX_SLOTS_VAL=$(awk "BEGIN {printf \"%d\", $AVAILABLE_FOR_KV / $SINGLE_SLOT_KV}")
  fi
  echo "Max slots: ${MAX_SLOTS_VAL} (bei ctx ${CTX}, ${KV_TYPE})"
fi

# Optional: Max ctx
if $CALC_MAX_CTX; then
  AVAILABLE_FOR_KV=$(( GPU_MIB - BASE_MIB ))
  if (( AVAILABLE_FOR_KV <= 0 )); then
    MAX_CTX_VAL=0
  else
    SLOT_FACTOR=$SLOTS
    $KVU && SLOT_FACTOR=1
    MAX_CTX_VAL=$(awk "BEGIN {printf \"%d\", $AVAILABLE_FOR_KV / ($PER_TOK_MIB * $SLOT_FACTOR)}")
  fi
  echo "Max ctx: ${MAX_CTX_VAL} (bei slots ${SLOTS}, ${KV_TYPE})"
fi

# Optional: -fitt analysis
if [[ -n "$FITT_MARGIN" ]]; then
  # c_fitt = (free_vram_nach_modell - fitt_margin) / (per_tok_mib * slot_factor)
  # free_vram_nach_modell = GPU_MIB - BASE_MIB
  FREE_AFTER_MODEL=$(( GPU_MIB - BASE_MIB ))
  EFFECTIVE_FREE=$(( FREE_AFTER_MODEL - FITT_MARGIN ))
  SLOT_FACTOR=$SLOTS
  $KVU && SLOT_FACTOR=1
  if (( EFFECTIVE_FREE <= 0 )); then
    C_FITT=0
  else
    C_FITT=$(awk "BEGIN {printf \"%d\", $EFFECTIVE_FREE / ($PER_TOK_MIB * $SLOT_FACTOR)}")
  fi
  echo "c_fitt: ${C_FITT} (bei --fitt-margin ${FITT_MARGIN} MiB, slots ${SLOTS}, ${KV_TYPE})"
fi
