# Proposal: unterstuetzermodelle-e2b-slot

## Why

T007033 setzte den Tablet-Slot auf `gemma-4-e4b@ud-q4_k_xl` — auf Basis einer falschen
Groessenannahme (~2,7 GB). Die HF-Realitaet: Die E4B-UD-Q4_K_XL ist **4,77 GiB** gross.
Mit den gemessenen Tablet-Daten (Intel Iris Plus, **8 GB RAM geteilt, 128 MB dediziert**,
Windows braucht 3-4 GB) sprengt 4,77 GiB + KV-Cache das Tablet. Googles Gemma-4-Familie
hat fuer genau diese Gerateklasse die **E2B** („high-end phones", laut Model-Card), deren
UD-Q4_K_XL nur **2,97 GiB** gross ist.

## What

1. Tablet-Slot in `.opencode/agent-models.jsonc`: `gemma-4-e4b@ud-q4_k_xl` → **`gemma-4-e2b@ud-q4_k_xl`**
   (Name mit korrekter Groesse „~2,97 GiB, PK-Tablet"), limits `context 16384` (8-GB-RAM-Budget)
   und `output 4096`, Messkommentar mit Verweis auf die ausstehende Tablet-K3-Messung
2. Guard `tests/spec/local-llm-proxy/support-model-slots.bats`: Slot-Namen und Limits
   (16384/4096) im Test 1 nachziehen
3. Delta-Spec `local-llm-proxy.md`: E4B → E2B im MODIFIED-Requirement, context 16384
4. Proxy-Alias-Ummap (DB, ausserhalb des Datei-Scopes): `gemma-4-e4b@ud-q4_k_xl` →
   `gemma-4-e2b@ud-q4_k_xl` (Ziel `gemma-4-e2b-it`)

Geraete-Task (T007055, folgt): E2B-Datei aufs Tablet, `lms load` mit
`--identifier gemma-4-e2b@ud-q4_k_xl`, K3-Messung Tablet → Limits nachjustieren.

_Ticket: T007055_
