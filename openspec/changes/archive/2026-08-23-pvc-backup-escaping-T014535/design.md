# Design: pvc-backup-escaping-T014535

## Root-Cause (mit Evidenz)

Reproducer (lokal, 2026-08-23): Flux-Render-Logik auf `prod-fleet/mentolder`
→ Heredoc-Expansion des MJOB-Blocks → `bash -n` auf das generierte
Mounter-Script:

```
/tmp/gen-backup.sh: line 11: syntax error near unexpected token `('
```

Identisch mit dem Mounter-Log im Cluster (`/bin/bash: -c: line 11: syntax
error near unexpected token '('`). Der envsubst-Einzelbeweis:

```
printf 'echo "Backing up \\${LABEL} (\\${SRC})..."\n' | envsubst '$LABEL $SRC'
# → echo "Backing up \ (\)..."   ← \ bleibt, ${LABEL}/${SRC} leer substituiert
```

Mechanik im Flux-Renderer (`scripts/flux-render-artifact.sh render_component`):

1. Zeile 83: Extraktor `grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}'` sammelt
   ALLE `${VAR}`-Referenzen — auch die hinter einem Backslash.
2. Zeile 107–113: Der runtime_vars-Filter kennt nur `$${VAR}` (T002306).
   `\${VAR}` ist kein Marker → kein Schutz.
3. envsubst substituiert `${LABEL}`, `${OUT}`, `${FAILED}` leer (nicht in
   der Render-Umgebung). `SRC`/`STAMP`/`BACKUP_DIR` überleben nur, weil
   andere Dateien im Overlay `$${SRC}` etc. nutzen und die Filterung
   global über den ganzen kustomize-Output läuft.
4. Der Backslash überlebt envsubst (`\ `), die kaputten Strings überleben
   den Unwrap, und das unquotierte MJOB-Heredoc im Orchestrator-Pod
   expandiert das Ergebnis zu einem syntaktisch ungültigen Mounter-Script.

Die uncommitteten WIP-Änderungen im Haupt-Checkout (`\${` → `\$${`, Stand
10:35–10:39) gingen in die richtige Richtung, waren aber unvollständig
(kein Taskfile-Fix, keine Tests) und wurden nicht übernommen.

## Render-Pfad-Matrix

| Pfad | Render-Strecke | Liste | Unwrap |
|---|---|---|---|
| Flux (primär) | `flux-render-artifact.sh` | dynamisch + `$${VAR}`-Filter | `s/\$\$([a-zA-Z0-9_({!?])/$\1/g` |
| Push/Dev (`workspace:deploy`) | Taskfile ~3402 | kuratiert (`ENVSUBST_VARS`) | `s/\$\$([a-zA-Z0-9_]\|\{)/$\1/g` — deckt `$$(` NICHT ab |
| Platform | `kustomize build prod-fleet/platform` | ohne envsubst | — (pvc-backup nicht enthalten) |

## Entscheidungen

- **D1 — Klasse B (Mounter-Runtime-Vars):** `\$${VAR}`, `\$$(...)`,
  `\$$((...))`. Der Renderer sieht `$${`/`$$(` → Filter schützt vor
  envsubst, Unwrap stellt `\${VAR}`/`\$(...)` im Pod-Script wieder her,
  das Heredoc quotet sie wörtlich ins MJOB-YAML, der Mounter-Pod
  expandiert sie zur Laufzeit. Positionsargumente: `\$1` → `$$1`,
  `\$5` → `$$5` (Unwrap deckt alnum ab — schon heute in beiden Pfaden).
- **D2 — Klasse A (Orchestrator-Vars):** `${MOUNTER}`, `${VW_AFFINITY}`,
  `${VW_CLAIM}` → `$${VAR}`. Entfernt die heutige Zufalls-Immunität
  (die nur hält, solange eine andere Datei im Overlay `$${VAR}` nutzt).
  `$NS`-Referenzen ohne Klammern bleiben unangetastet (der Extraktor
  sieht sie nicht).
- **D3 — Taskfile-Unwrap:** auf die breite Regex
  `s/\$\$([a-zA-Z0-9_({!?])/$\1/g` anheben (Parität mit dem
  Flux-Renderer, T012503). Ohne das bricht der Push-/Dev-Pfad an
  `\$$(date ...)` (bliebe als `$$(date ...)` im Pod → PID-Expansion →
  Syntaxfehler). Es gibt keinen legitimen Fall, in dem ein Pod-Script
  literal `$$(` will.
- **D4 — korczewski db-backup-Suspension:** Bleibt dokumentiert im
  Ticket-Kommentar; Reaktivierung (`suspend=false`) erst nach
  verifiziertem grünem Mounter-Lauf im Post-Merge-Deploy. Kein blinder
  Live-Eingriff ohne Beleg der Backup-Kette.

## Verworfen

- **Quoted Heredoc (`<<'MJOB'`) + envsubst im Orchestrator:** würde die
  Klasse-A-Expansion im Pod erzwingen; `envsubst` ist im
  pgvector-Image nicht garantiert vorhanden. Größerer Eingriff, neues
  Runtime-Risiko.
- **Renderer-Fix statt Datei-Fix (runtime_vars um `\${VAR}` erweitern):**
  ließe die Datei-Konvention `\${VAR}` bestehen, führt aber eine zweite
  Runtime-Marker-Syntax im Renderer ein und die Klasse-A-Referenzen
  blieben zufallsgeschützt. Verworfen zugunsten der dokumentierten
  `$${VAR}`-Konvention (T002306).

## Edge-Cases

- **Push-Pfad-Liste enthält die Vars nicht:** envsubst fasst
  `\$${VAR}` nicht an, Unwrap (nach D3 breit) stellt `\${VAR}` her. ✓
- **Flux-Filter greift nicht (Regression):** envsubst macht `\$` aus
  `\$${VAR}` → Heredoc liefert `$` + leer → fail-fast sichtbarer Bruch,
  kein stiller Drift.
- **frisch generierte Artefakte:** `freshness:regenerate` erzeugt
  ggf. Indexdateien — im Verify-Schritt abgedeckt (STRUCT3).
