---
id: P1
title: Fix der eval-Zeile in pocket-id-client-seed.yaml
role: impl
target_files:
  - k3d/pocket-id-client-seed.yaml
depends_on: []
---

# P1 — Fix der eval-Zeile

## Problem

In `k3d/pocket-id-client-seed.yaml` (Zeile 395):
```sh
secret=$(eval "printf '%s' \"\$$env\"")
```
Flux `postBuild` ersetzt `$$` durch `$`. Im Cluster gerendert:
```sh
secret=$(eval "printf '%s' \"\$env\"")
```
Da die äußeren Quotes Doppelquotes sind, expandiert `sh` vor `eval` das `\$env` zu `$env`. `eval` führt `printf '%s' "$env"` aus und gibt den Namen der Variable zurück (z. B. `"SECRET_downloads"`). Dadurch greift `if [ -z "$secret" ]; then echo "skip ... (no secret configured)"; return 0; fi` nie.

## Lösung

Ersetzen der Zeile durch:
```sh
eval 'secret="$'$env'"'
```
Im gerenderten Skript baut die Shell das Argument an `eval` zusammen als: `secret="$<wert_von_env>"`. `eval` führt dies aus und weist `secret` den Wert der indirekt referenzierten Variable zu. Ist die Variable leer oder nicht definiert, bleibt `secret` leer `""`.
Quoting-Sicherheit: Selbst wenn der Secret-Wert Sonderzeichen (Leerzeichen, `$`, Anführungszeichen) enthält, bleibt der Wert erhalten, da die Variablenexpansion erst innerhalb des `eval`-Laufs im doppel-gequoteten Kontext stattfindet.

## Änderung in `k3d/pocket-id-client-seed.yaml`

Zeile 395 ersetzen durch:
```sh
                eval 'secret="$'$env'"'
```
inklusive erklärendem Kommentar zu T901061.
