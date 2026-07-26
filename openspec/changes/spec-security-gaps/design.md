---
title: Vier verifizierte Lücken aus den roten Spec-Tests schließen
ticket_id: T002180
domains: [infra, security]
status: planning
plan_ref: openspec/changes/spec-security-gaps/tasks.md
---

# Design — spec-security-gaps

## Purpose

Von den 48 roten `tests/spec/`-Tests auf `main` gehören 13 zu Cluster 3 („Test hat recht, Code ist
die Lücke"). Die im Ticket vorgeschriebene Einzelprüfung am Code hat davon **neun entwarnt** und
**vier bestätigt**. Dieser Change schließt die vier bestätigten Lücken. Die neun entwarnten sind
nach T002181 verschoben.

Der Wert dieses Changes liegt weniger im Umfang als in der Trennschärfe: `main` trägt seit langem
48 rote Tests, die niemand mehr liest, weil sie in keinem Required Check laufen (T002182). Erst die
Einzelprüfung macht sichtbar, welche davon Befunde und welche Rauschen sind.

## Root-Cause je Position

### 1. `POCKET_ID_TERMINAL_SECRET` fehlt auf beiden korczewski-Envs

`k3d/oauth2-proxy-terminal.yaml` liest den Key aus `workspace-secrets`. Die SealedSecrets werden aus
`environments/.secrets/<env>.yaml` erzeugt. Ein Abgleich über die Key-Namen (Werte wurden nicht
gelesen):

| Env | `POCKET_ID_TERMINAL_SECRET` |
|---|---|
| `mentolder` | vorhanden |
| `fleet-mentolder` | vorhanden |
| `korczewski` | **fehlt** |
| `fleet-korczewski` | **fehlt** |

`environments/schema.yaml` führt den Key. Es ist also keine Schema-Lücke, sondern eine
Brand-Asymmetrie: beim Aufbau der korczewski-Envs wurde der Key nicht mitgezogen. Folge: der
oauth2-proxy vor dem Terminal-Dienst startet auf korczewski ohne Client-Secret. Die Richtung des
Fehlers ist *Dienst funktioniert nicht*, nicht *Dienst ist offen* — der Proxy verweigert, statt
durchzulassen.

**Offene Frage, die vor der Umsetzung geklärt sein muss:** Woher kommt der Wert? Ein
OIDC-Client-Secret muss mit dem übereinstimmen, was Pocket ID für diesen Client hinterlegt hat.
Laut `CLAUDE.md` schreibt der `pocket-id-client-seed`-Job Client-Secrets nach `workspace-secrets`
zurück — dann wäre der `.secrets/`-Eintrag entweder redundant oder er ist die Quelle, aus der der
Seed-Job den Client anlegt. Bei `mentolder` steht er in `.secrets/`, was für Letzteres spricht.
Zwei mögliche Auflösungen:

- **A** — Wert aus dem laufenden Pocket ID auf fleet auslesen (`pocket_id.oidc_clients` für den
  Terminal-Client) und in beide korczewski-Secret-Dateien übernehmen.
- **B** — neues Secret erzeugen, in `.secrets/` eintragen, Seed-Job den Client damit
  aktualisieren lassen.

A ist richtig, wenn der Client bereits existiert; B, wenn er auf korczewski nie angelegt wurde. Das
ist per Query gegen `pocket_id.oidc_clients` auf dem korczewski-Namespace entscheidbar und der erste
Schritt der Umsetzung.

### 2. `livekit-egress` nutzt RollingUpdate auf einem RWO-Volume

`k3d/livekit-egress.yaml:11` steht auf `strategy.type: RollingUpdate`. Das Deployment mountet
`livekit-recordings-pvc`, ein **ReadWriteOnce**-Volume. Bei RollingUpdate startet der neue Pod, bevor
der alte terminiert; landet er auf einem anderen Node, kann er das RWO-Volume nicht mounten und
bleibt in `ContainerCreating` hängen, während der alte Pod weiterläuft. Auf einem Single-Node-Cluster
fällt das nicht auf — auf `fleet` mit sechs Nodes ist es ein Rollout, der stillsteht.

`Recreate` löst das strukturell: der alte Pod wird zuerst beendet, das Volume freigegeben, dann
startet der neue. Der Preis ist eine kurze Downtime des Egress-Dienstes beim Rollout, was für einen
Recording-Worker vertretbar ist.

### 3. `brace-expansion` DoS-Advisory (GHSA-mh99-v99m-4gvg)

`pnpm audit` meldet 1 × high: `brace-expansion` ≤ 5.0.7, unbounded expansion → OOM. 44 Pfade, alle
transitiv über `eslint` (`eslint > minimatch > brace-expansion` und
`eslint > @eslint/config-array > minimatch > brace-expansion`).

Damit ist es ausschließlich eine **devDependency** — `eslint` läuft im Lint-Schritt, nicht im
Website-Container. Der Angriffsvektor („Angreifer kontrolliert ein Glob-Pattern") existiert im
Produktivpfad nicht. Das rechtfertigt keinen Ausnahmeeintrag: gepatchte Versionen ab 5.0.8 sind
verfügbar, ein `pnpm.overrides`-Eintrag löst es ohne eslint-Major-Bump.

## Was NICHT im Scope ist

- Die neun entwarnten Positionen (case-sensitives Grep in `cors.ts`, vier Pfadfehler auf
  `callback.ts`, `Bearer`-vs-`X-API-KEY` in `identity.ts`) — die liegen in T002181, wo die
  umgekehrte Regel gilt: Test korrigieren, Code unangetastet lassen.
- Das Schließen des CI-Gates selbst (T002182). Dieser Change reduziert nur den Rückstand, der das
  Gate blockiert.
- Der Doku-Drift im Code-Kommentar `callback.ts:55` („Keycloak redirects here") — gehört zu
  T002179/T002181.

## Kernregel

Für alle vier verbliebenen Positionen gilt: **die Test-Assertions werden nicht angepasst.** Sie
beschreiben das gewollte Verhalten korrekt. Rot wird durch eine Änderung am Code, am Manifest oder
an der Secret-Datei — nie durch eine Änderung an der Erwartung.

## Verifikation

Die vier Tests sind der Nachweis. Sie existieren bereits und sind rot — dieser Change hat den
seltenen Vorteil, dass das RED-Netz vor der ersten Zeile Implementierung steht:

```
tests/spec/health-goals.bats      G-OPS01a (korczewski, fleet-korczewski), G-OPS01b
tests/spec/g-dep01-npm-vuln.bats  G-DEP01
```
