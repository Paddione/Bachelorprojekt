---
title: "restore-verify-regextype — Implementation Plan"
ticket_id: T901104
domains: [infra, database, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# restore-verify-regextype — Implementation Plan

`db-restore-verify` sucht die neueste Backup-Generation mit
`find /backups … -regex '.*/[0-9]\{8\}-[0-9]\{6\}'`. GNU find nutzt per Default `regextype emacs`, dort
gibt es keine Intervalle `\{n\}`, der Ausdruck matcht nie. Folge: Der Job endet auf Prod und Staging
immer mit `FATAL: no backup generation found under /backups`. Auf Prod hat er seit seiner Einführung
(T014544) nie erfolgreich geprüft, ob die DB-Backups wiederherstellbar sind.

_Ticket: T901104_

## Befund (Symptom vs. Ursache)

- Symptom: Prod-CronJob ohne `lastSuccessfulTime`, Jobs 29831130, 29841210, 29851290 Failed. Staging-Lauf `db-restore-verify-t900806` Failed, obwohl `/backups/20261007-202706` mit drei `*.dump.enc` auf dem PVC liegt.
- Ursache, im Job-Image `pgvector/pgvector:0.8.5-pg16` (GNU findutils 4.9.0) gemessen: derselbe Ausdruck liefert 0 Treffer, mit `-regextype posix-basic` 1 Treffer (Befehl im Ticket T901104).

## Entscheidung

`-regextype posix-basic` vor `-regex` setzen. Der Ausdruck selbst bleibt, er ist gültiges POSIX-BRE.
Verworfen: Glob plus Längenprüfung (mehr Shell-Code für dasselbe Ergebnis).

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `k3d/backup-restore-verify-cronjob.yaml` | 182 | n/a (S1-ungated) |
| `tests/spec/db-restore-verification/generation-lookup.bats` | 0 (neu) | n/a (S1-ungated) |

`.yaml` und `.bats` haben kein S1-Limit (`yq '.s1.limits' docs/code-quality/gates.yaml`), keine Datei
ist gebaselined. Kein neues Manifest oder Skript, kein S4-Risiko.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Task 1: Roter Test

Der Test zieht den `LATEST=$(find …)`-Ausdruck aus dem Manifest und führt ihn gegen ein
Testverzeichnis aus (Verhaltensprüfung). Er ist mit dem Plan committet:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-restore-verification/generation-lookup.bats
# expected: FAIL — beide Tests, "gefunden: ''"
```

## Task 2: regextype setzen

In `k3d/backup-restore-verify-cronjob.yaml`. Ist:

```bash
                  LATEST=$(find /backups -maxdepth 1 -mindepth 1 -type d \
                    -regex '.*/[0-9]\{8\}-[0-9]\{6\}' | sort | tail -n 1)
```

Soll:

```bash
                  # -regextype posix-basic: im Default (emacs) kennt GNU find keine
                  # Intervalle \{n\}, der Ausdruck matchte nie [T901104].
                  LATEST=$(find /backups -maxdepth 1 -mindepth 1 -type d \
                    -regextype posix-basic -regex '.*/[0-9]\{8\}-[0-9]\{6\}' | sort | tail -n 1)
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-restore-verification/   # alle ok
```

## Task 3: Live nach dem Merge

Wenn Flux den CronJob aktualisiert hat
(`kubectl --context fleet -n <ns> get cronjob db-restore-verify -o json | jq -r '.spec.jobTemplate.spec.template.spec.containers[0].args[0]' | grep -c regextype` → 1),
zuerst Staging, dann Prod einmal anstoßen:

```bash
for ns in workspace-staging workspace; do
  kubectl --context fleet -n $ns create job --from=cronjob/db-restore-verify db-restore-verify-t901104
  kubectl --context fleet -n $ns wait --for=condition=complete job/db-restore-verify-t901104 --timeout=1800s
  kubectl --context fleet -n $ns logs job/db-restore-verify-t901104 | tail -5
done
```

Erwartet: `Verifying backup generation: <stamp>` und Exit 0. Schlägt die Wiederherstellung selbst fehl,
ist das ein neuer, eigener Befund (die Restore-Logik lief nie) und wird als Ticket erfasst.

## Task 4: Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-restore-verification/
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
