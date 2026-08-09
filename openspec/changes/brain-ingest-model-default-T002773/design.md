# T002773: brain-ingest.sh totes Default-Modell

## Problem
`scripts/brain-ingest.sh:44`: `LM_MODEL="${LM_MODEL:-qwen3.6-14b-a3b-fablevibes}"` —
dieses Modell existiert nicht. Der Default täuscht eine funktionierende Vorgabe vor.

## Fix
Default streichen → fail-closed: `LM_MODEL="${LM_MODEL:?LM_MODEL ist Pflicht (siehe T002533)}"`.
