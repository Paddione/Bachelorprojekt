---
title: "pvc-backup-escaping-T014535 — Implementation Plan"
ticket_id: T014535
domains: [backup]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pvc-backup-escaping-T014535 — Implementation Plan

_Ticket: T014535_

Root-Cause und Render-Pfad-Matrix: `openspec/changes/pvc-backup-escaping-T014535/design.md`.
Der Mounter bricht mit `line 11: syntax error near unexpected token '('`, weil der
Flux-Renderer die `\${VAR}`-Escapes nicht als Runtime-Marker kennt und
`${LABEL}`/`${OUT}`/`${FAILED}` leer substituiert (Beleg im design.md).

## File Structure

```
k3d/pvc-backup-cronjob.yaml            # geändert — Escaping auf Renderer-Konvention
Taskfile.yml                           # geändert — Unwrap deckt $$( ab
tests/spec/backup-pipeline/render-escaping.bats        # neu — RED-Test (liegt im Branch)
openspec/changes/pvc-backup-escaping-T014535/   # neu — proposal, design, delta-spec, tasks
```

## Verify (RED → GREEN)

- [ ] **Task 1 (RED).** Failing BATS-Test liegt im Branch:
      `tests/spec/backup-pipeline/render-escaping.bats`. Er reproduziert die Flux-Render-Logik
      auf `k3d/pvc-backup-cronjob.yaml`, expandiert das MJOB-Heredoc und
      prüft `bash -n` auf dem generierten Mounter-Script, die Abwesenheit
      von `\ `-Substitutionsresten sowie die Push-Pfad-Unwrap-Parität.

```bash
timeout 120 tests/unit/lib/bats-core/bin/bats tests/spec/backup-pipeline/render-escaping.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Task 2 (Escaping-Fix in k3d/pvc-backup-cronjob.yaml).** Alle
      `${VAR}`-/`\${VAR}`-Formen nach den zwei Klassen umstellen:
      - **Klasse B — Mounter-Runtime-Variablen** (Werte setzt der
        Mounter-Pod selbst; expandieren erst zur Pod-Laufzeit):
        `\${VAR}` → `\$${VAR}`, `\$(...)` → `\$$(...)`,
        `\$((...))` → `\$$((...))`, Positionsargumente `\$N` → `$$N`.
        Betrifft die Scripts der Container `backup` und `filen-upload`
        im MJOB-Heredoc (STAMP, BACKUP_DIR, SRC, OUT, LABEL, FAILED,
        FILEN_*, RETENTION, UPLOAD_PATH).
      - **Klasse A — Orchestrator-Variablen** (Werte setzt der
        Orchestrator-Pod; expandieren beim Heredoc): `${VAR}` → `$${VAR}`.
        Betrifft die Job-Struktur-Ebene im MJOB-Block (`${MOUNTER}`,
        `${VW_AFFINITY}`, `${VW_CLAIM}` im CLONE- und MJOB-Block) und
        `${STAMP}` im Orchestrator-Rumpf (`MOUNTER="pvc-backup-mounter-${STAMP}"`).
      - `$VAR`-Referenzen ohne Klammern bleiben unangetastet (der
        Renderer-Extraktor sieht nur die `${VAR}`-Form).
      - Verifikation: `grep -n '\\${' k3d/pvc-backup-cronjob.yaml` liefert
        keine Treffer mehr (jede ehemalige `\${`-Form ist jetzt `\$${`),
        und `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone`
        bleibt grün.
      - **S1-Budget:** rein mechanischer Zeichenersatz (≈40 Vorkommen,
        je +1 Zeichen) — keine Strukturänderung, keine neuen Symbole;
        Datei (~370 Zeilen) bleibt weit unter jeder S1-Schwelle.

- [ ] **Task 3 (Push-Pfad-Unwrap in Taskfile.yml).** In der
      `workspace:deploy`-Render-Strecke (Umgebung: `envsubst "$ENVSUBST_VARS"`)
      die Unwrap-Regex auf die breite Form anheben — Parität mit dem
      Flux-Renderer (T012503):

      Vorher: `sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g'`
      Nachher: `sed -E 's/\$\$([a-zA-Z0-9_({!?])/$\1/g'`

      Ohne diese Änderung bleibt `\$$(date ...)` im Push-/Dev-Pfad als
      `$$(date ...)` stehen (PID-Expansion → Syntaxfehler im Pod).

- [ ] **Task 4 (GREEN).** Der BATS-Test aus Task 1 muss jetzt grün sein:

```bash
timeout 120 tests/unit/lib/bats-core/bin/bats tests/spec/backup-pipeline/render-escaping.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
