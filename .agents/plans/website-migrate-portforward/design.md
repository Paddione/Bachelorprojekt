---
ticket_id: T901789
plan_ref: .agents/plans/website-migrate-portforward/tasks.md
status: active
date: 2026-10-11
---

# website-migrate-portforward — Design-Spec (T901789)

Ticket: T901789 (fix, hoch, major). Run 38070460176, post-merge-Job
„Imperative post-steps (TRANSITIONAL)", `task website:migrate ENV=mentolder`.
Vorgänger: T901750 / PR #6504 (Fail-Closed-Härtung, seitdem Dauer-Rot).

## 1. Symptom — Fakt, mit Log-Evidenz

Aus `gh run view 38070460176 --log-failed` (verifiziert am 2026-10-10):

- `Migrate target: context=fleet namespace=workspace` — Zielauflösung ok.
- `deployment "shared-db" successfully rolled out` — kubectl, Context, RBAC
  für rollout/get-secret reichen aus.
- `Port-forwarding shared-db on an ephemeral local port...` um 17:09:36.827,
  dann 11 ms später `ERROR: port-forward exited unexpectedly:` mit LEEREM
  `tail -n 20 "$PF_LOG"` — keine einzige Log-Zeile.
- Task-Exit 1 (Runner meldet Prozess-Exit 201 — Task-Wrapper-Mapping).

Symptom in einem Satz: `kubectl port-forward svc/shared-db :5432` stirbt im
Runner sofort und lautlos; der Fail-Closed-Guard meldet nur den Tod, nicht
die Ursache.

## 2. Hypothesen — getrennt vom Symptom (T002448-M5)

- H1 RBAC (`pods/portforward` fehlt der Fleet-Identität): plausibel, weil
  rollout/get andere Rechte brauchen als portforward. Dagegen: ein
  `Forbidden` schreibt kubectl nach stderr — das PF-Log wäre NICHT leer.
  Verifizierbar: `kubectl auth can-i create pods/portforward --context fleet`.
- H2 `:5432`-Syntax vs. Runner-kubectl-Version: die ephemere Form stammt aus
  #6504, exakt seitdem ist Rot. Dagegen: auch ein Syntaxfehler landet auf
  stderr. Verifizierbar: `kubectl version --client` im Runner loggen,
  Syntax gegen diese Version prüfen.
- H3 Service-Port: `svc/shared-db` ohne Port 5432 würde ebenfalls eine
  stderr-Meldung erzeugen. Verifizierbar: `kubectl get svc shared-db`.
- H4 Prozess-Artefakt (Redirect, PID-Race, Signal): erklärt als einzige
  Klasse leeres Log + Instant-Exit; ist aber ohne Exit-Code und ohne
  stderr-Evidenz nicht entscheidbar.

Fazit: Keine Hypothese ist aus dem Repo allein beweisbar. Ein Blind-Fix
(„einfach anderen Port nehmen") würde raten und die T901750-Garantien
riskieren. Deshalb zuerst Diagnose-Härtung, dann Befund-gestützter Fix.

## 3. Fix-Ansatz — vier Stufen

- D Diagnose-Härtung (immer richtig): Exit-Code des Forwards per `wait`
  sichern und drucken (`port-forward exit code: N`), `kubectl version
  --client` drucken, Service-Auflösung drucken, PF-Log mit Markern drucken
  (inkl. explizitem Hinweis bei leerem Log). Fail-Closed bleibt.
- R Ursachen-Repro: lokale Repro-Matrix gegen fleet (auth can-i, get svc,
  client/server-Version) + Auswertung der D-Ausgabe; Befund ins Ticket.
- F Forward-Fix abhängig vom Befund (z. B. RBAC-Antrag, expliziter
  Loopback-Bind, Pod-statt-Service-Forward, Retry mit Backoff).
- A Alternativpfad-Inventar (Ticket-Frage 2): alle Prod-Migrate-Wege
  inventarisieren, Gap seit #6504 prüfen (schema_migrations-Stand Prod
  vs. Repo), Ergebnis ins Ticket; falls post-merge der einzige Weg ist,
  Eskalationspfad dokumentieren.

Verworfen: fester Port 5432 (Revert von T901750 — Squatter-Risiko),
`sleep`-Warten ohne Verify (T901750), stilles Überspringen bei totem
Forward (Fail-Open — das Gegenteil des Gewollten).

## 4. Betroffene Subsysteme

- `taskfiles/Taskfile.web.yml`, Task `website:migrate` (Stufen D + F).
- `.github/workflows/post-merge.yml` (nur Lesekontext; Änderung nur falls
  Stufe R einen Workflow-Canary verlangt).
- `tests/py/spec/website-migrate/test_portforward_runner.py` (neu, RED-Test
  liegt im Branch; Stufe D/F macht ihn grün).

## 5. Edge-Cases

- Zombie/PID-Race: `kill -0` sieht frisch verblichene PIDs noch als lebend;
  `wait` liefert den echten Exit-Code — deshalb D1.
- PF-Log leer vs. fehlend: beide Fälle bekommen eigene Markerzeilen.
- Secrets-Fallback (exec-Pfad) bleibt unberührt; T901750-Verträge
  (ephemerer Port, TCP-Verify, Fail-Closed) bleiben unangetastet.
- S1: `.yml` ist nicht vermessen, `.py`-Limit 800 — neues Testmodul ~120
  Zeilen. S2/S3/CQ02/Vitest: keine `.ts`/Import-/Domain-Änderung.

## 6. Teststrategie

- RED-Test (liegt vor): Stub-Harness spielt den Runner-Vorfall hermetisch
  nach — kubectl-Stub lässt rollout/get-secret gelingen und port-forward
  lautlos sterben; pnpm-Stub beweist Fail-Closed. Diagnose-Test rot,
  Fail-Closed-Guard grün.
- Stufe D/F: Diagnose-Test grün, Guard bleibt grün.
- Verify: Modul grün + `task test:changed` + Freshness-Paar.
