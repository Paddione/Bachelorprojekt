# Proposal: t002187-pocket-id-seed-fix

## Why

Der `pocket-id-client-seed`-Job schlägt auf dem Fleet-Cluster in **beiden** Namespaces
reproduzierbar fehl und blockiert die Flux-Kustomization `flux-korczewski`. Die Ticket-Annahme
("scheitert am Health-Check") ist **falsch** — die Live-Diagnose am 2026-07-26 ergab eine Kette aus
vier unabhängigen Defekten.

**RC-1 — Flux scheitert am Apply/Dry-Run, nicht an einem Health-Check.**
`flux-korczewski` stand auf `Ready=False` mit:

```
Job/workspace-korczewski/pocket-id-client-seed dry-run failed (Invalid):
Job.batch "pocket-id-client-seed" is invalid: spec.template: Invalid value: {…}: field is immutable
```

Der Job existiert bereits im Cluster (aus einem früheren push-basierten Deploy) mit einem anderen
Pod-Template. `Job.spec.template` ist immutable → der Apply wird abgelehnt → die **gesamte**
Kustomization (alle korczewski-Workloads) kommt nicht mehr durch. Das ist ein Apply-Fehler, kein
`healthChecks`-Fehler.

**RC-2 — Kubernetes-`$$`-Escaping zerstört den DO-Block im db-init.**
`k3d/pocket-id.yaml` legt Rolle und Passwort für `pocket_id` in einem PL/pgSQL-DO-Block an.
Kubernetes expandiert `command`/`args` und interpretiert `$$` als escaptes `$`. Live-Log (in
**beiden** Namespaces identisch):

```
ERROR:  syntax error at or near "$"
LINE 1: DO $ BEGIN
ERROR:  syntax error at or near "EXCEPTION"
ERROR:  syntax error at or near "$"
LINE 1: END $;
```

Rolle/Passwort werden also **nie** gesetzt. Folge in `workspace-korczewski`: pocket-id crasht in
einer Endlosschleife mit
`FATAL: password authentication failed for user "pocket_id" (SQLSTATE 28P01)`, die Startup-Probe
auf `/.well-known/openid-configuration` scheitert (`connection refused`), der Init-Container
`wait-for-pocket-id` des Seed-Jobs läuft 600 s ins Timeout, `backoffLimit: 2` →
`BackoffLimitExceeded`.

Zweiter Defekt im selben Block: `PASSWORD :'pocket_id_pw'` referenziert eine **nie definierte**
psql-Variable (kein `-v pocket_id_pw=…`), und psql interpoliert ohnehin nicht innerhalb
dollar-quoted Bodies. Selbst mit korrektem `$$` käme das Passwort also nicht aus
`workspace-secrets`. Zudem fehlt ein konvergierendes `ALTER ROLE … PASSWORD` — ein einmal
rotiertes Secret erreicht die DB nie.

**RC-3 — Stiller Fehlschlag maskiert alles.**
Das db-init läuft mit `-v ON_ERROR_STOP=0` und gibt am Ende bedingungslos
`✓ Pocket-ID admin bootstrap complete` aus, Exit 0. Beide `pocket-id-db-init-*`-Pods stehen
deshalb auf `Completed`, obwohl drei SQL-Syntaxfehler und eine FK-Verletzung im Log stehen. Genau
deshalb blieb der Defekt unentdeckt.

**RC-4 — Admin-/API-Key-Bootstrap (T001853) kann nicht funktionieren.**
Der Bootstrap hardcodiert die User-ID `a0000000-0000-4000-8000-000000000001`. Die realen
Admin-Rows in `pocket_id.users` haben andere UUIDs (verifiziert in `workspace`: `41847e5a-…`,
`cb6915ba-…`); der `users`-INSERT ist wegen `ON CONFLICT (username) DO NOTHING` ein No-op
(`INSERT 0 0`), der `api_keys`-INSERT scheitert danach an
`violates foreign key constraint "api_keys_user_id_fkey"`.

**Zusatz-Drift.** In `workspace` existiert eine `CronJob/pocket-id-client-seed` (`0 3 * * *`),
die **kein Manifest in `k3d/` hat** (Annotation `kubectl.kubernetes.io/last-applied-configuration`
→ von Hand appliziert). Sie erzeugt nächtlich einen weiteren fehlschlagenden Job
(`…-29747580`, `…-29749020`, `…-29750460` — alle `Failed`).

## What

1. Den Seed-Job Flux-tauglich machen, damit ein immutables `spec.template` die Kustomization nicht
   mehr blockiert (`kustomize.toolkit.fluxcd.io/force: "enabled"` — Flux löscht+erstellt statt zu
   patchen).
2. Das db-init-SQL aus dem Shell-/Kubernetes-Escaping herausnehmen (ConfigMap-`.sql` + `psql -f`),
   die Rolle konvergent anlegen **und** das Passwort per `ALTER ROLE` aus `workspace-secrets`
   nachziehen.
3. Fehler laut machen: `ON_ERROR_STOP=1` für den Rollen-/DB-Block; Erfolgsmeldung nur bei echtem
   Erfolg.
4. Den API-Key-Bootstrap gegen den **tatsächlichen** Admin-User auflösen statt gegen eine
   hardcodierte UUID.
5. Die untracked CronJob in `workspace` bereinigen (als Manifest nach `k3d/` aufnehmen oder
   entfernen).
6. BATS-Regressionstests in `tests/spec/auth-sso.bats`, die die Manifest-Invarianten festnageln
   (kein nacktes `$$` in `command`-Blöcken, `ON_ERROR_STOP=1`, force-Annotation vorhanden).

### Non-Goals / Abgrenzung zu T002207

- **T002207** behandelt das *generische* Flux-Verhalten: ein kaputter Workload friert die ganze
  Kustomization ein und erzeugt stillen Deploy-Drift. Dorthin gehören Änderungen an
  Kustomization-`healthChecks`/`wait`/`timeout`-Policy, Drift-Alerting und die generische
  Guard-Logik.
- **T002187** (dieser Change) behandelt ausschliesslich den *konkreten* Workload: db-init-SQL,
  Seed-Job-Immutability, stiller Erfolg, CronJob-Drift. Es wird **keine** globale
  Flux-Kustomization-Policy angefasst.
- Kein Secret-Rotationsverfahren, kein Redesign der OIDC-Client-Liste, keine Änderung an der
  Admin-API-Nutzung des Seed-Skripts (T001355/T001435/T001995 bleiben unberührt).

### Offener Diagnosepunkt (Task 1)

Der Job in `workspace` (mentolder) scheiterte am 2026-07-26 (14:35:53 → 14:41:25), obwohl pocket-id
dort `1/1 Running` ist; die Pods sind bereits GC'd. Vor dem Fix ist die konkrete Ursache dort
nachzuweisen (Verdacht: T001995-API-Key-Guard — `pocket_id.api_keys` enthält genau **eine** Row,
deren Hash gegen das aktuelle `POCKET_ID_API_KEY` nicht verifiziert ist).

_Ticket: T002187_
