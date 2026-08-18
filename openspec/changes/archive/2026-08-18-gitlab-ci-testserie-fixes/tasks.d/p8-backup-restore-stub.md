# p8 — backup-restore: kubectl-Stub kennt create, bricht laut ab (T011906)

## Ziel

Der subtilste Fall der Serie: T002063 (Commit 2b67d1656, PR #3086) hat
`cmd_recovery_verify` (in `scripts/backup-restore-lib.sh`, per Source in
`scripts/backup-restore-recovery.sh` eingebunden) einen ZWEITEN kubectl-Aufruf
hinzugefügt — eine Erfolgs-ConfigMap, gespeist aus `kubectl create configmap …
--dry-run=client -o yaml | kubectl apply …` (G-DB11-Mess-Anker).

Der Test-Stub in `tests/unit/backup-restore-recovery.bats` (Zeile 15-32)
behandelt nur apply/delete/wait/logs. Der Default-Case endet still mit `exit 0`
ohne Ausgabe; der zweite apply bekommt dadurch einen leeren Stream und
überschreibt das zuvor aufgenommene Job-Manifest in $CAPTURE. Der Test sieht am
Ende `website.dump.enc` nicht mehr.

Fix im TEST-STUB (scripts/ verhält sich korrekt), kombiniert aus den beiden
Ticket-Wegen plus der Lehre:

1. `create` im Stub durchreichen — der Case liefert gültiges YAML (Realismus).
2. Nur den ERSTEN apply capturen — der ConfigMap-Stream aus dem Pipe kann das
   Job-Manifest in $CAPTURE nicht mehr überschreiben.
3. Default-Case bricht bei unbekanntem Subkommando LAUT ab (Meldung + Exit 1) —
   die Lehre: ein stiller Default-Case verschluckt jeden künftigen Aufruf, den
   das Produktskript bekommt (hätte diesen Fehler bei T002063 sofort sichtbar
   gemacht statt Monate später).

## Steps

1. **RED.** Testlauf auf dem aktuellen Stand:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/backup-restore-recovery.bats
# expected: FAIL ("verify renders a Job..." — $CAPTURE wurde vom leeren
# create-Stream überschrieben, Job-Assertions schlagen fehl)
```

2. **GREEN.** In `tests/unit/backup-restore-recovery.bats` den Stub-Kubectl
   (setup-Funktion, Zeile 15-32) umbauen:

   - Neuer Case vor dem apply-Case, der `create configmap` mit Dry-Run
     beantwortet (gueltiges YAML, damit der Pipe-Stream nicht leer ist):

```bash
*"create configmap"*)
  cat <<'YAML'
apiVersion: v1
kind: ConfigMap
metadata:
  name: recovery-verify-status
YAML
  exit 0 ;;
```

   - apply-Case: nur den ersten apply aufnehmen, spaetere (aus Pipes) verwerfen:

```bash
*"apply"*)
  if [[ ! -s "${CAPTURE}" ]]; then cat > "${CAPTURE}"; else cat > /dev/null; fi
  exit 0 ;;
```

   - Default-Case laut statt still:

```bash
*) echo "kubectl stub: unsupported invocation: $args" >&2; exit 1 ;;
```

3. **Verifikation.** Die komplette Datei muss gruen sein (alle anderen Tests
   nutzen denselben Stub — stage/restore-file/restore-table/unstage):

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/backup-restore-recovery.bats
```

## Acceptance

- "verify renders a Job..." sieht das Job-Manifest in $CAPTURE (website.dump.enc,
  createdb, information_schema.tables, dropdb).
- Alle übrigen Tests der Datei bleiben grün (erster-apply-Capture ist für ihre
  Einzel-apply-Pfade äquivalent).
- Der Stub bricht bei unbekannten Subkommandos laut ab — die Lehre ist eingebaut.
- Kein Produktcode geändert.
