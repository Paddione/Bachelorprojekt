---
title: "massage-tenant — Konfigurations- und Verhaltenstests"
ticket_id: T901440
domains: [infra, website, database, flux]
status: active
---

# massage-tenant — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/py/spec/massage-tenant/test_render_topology.py` | 0 | 800 |
| `tests/py/spec/massage-tenant/test_flux_freeze.py` | 0 | 800 |
| `tests/py/spec/massage-tenant/test_shared_db_roles.py` | 0 | 800 |
| `tests/py/spec/massage-tenant/test_brand_migration.py` | 0 | 800 |
| `tests/py/spec/massage-tenant/test_db_network_policy.py` | 0 | 800 |
| `tests/local/SA-22.sh` | 36 | 764 |
| `tests/py/unit/ported/test_shared_db_initdb_selfheal.py` | 62 | 738 |

`tests/local/SA-22.sh`: Ist 36, nicht gebaselined, `.sh`-Limit 800, wirksames Budget 764.
`tests/py/unit/ported/test_shared_db_initdb_selfheal.py`: Ist 62, nicht gebaselined,
`.py`-Limit 800, wirksames Budget 738.
Neue Dateien: keine Baseline-Einträge; `.py`-Limit aus
`docs/code-quality/gates.yaml` = 800. Je Modul höchstens circa 250 Zeilen planen,
damit echte Wachstumsreserve bleibt. Generiertes Inventar
`components/website/src/data/test-inventory.json` durch den vorhandenen Generator
aktualisieren; keine Baseline-/Ignore-Ausnahme hinzufügen.

## Task 1: Testvorbilder übernehmen und rote Regressionen belegen

Vor dem Schreiben vorhandene Abdeckung lesen:
`tests/py/conftest.py` liefert `repo_root`, `run_cmd`, `yaml_load` und `tmp_path`;
`tests/py/spec/test_flux_render_and_security.py` führt den echten Renderer mit
synthetischen SMTP-/Digest-Werten in einem temporären Ausgabeordner aus;
`tests/py/spec/native_ported/spec/test_pocket_id_migration.py` zeigt echte
Kustomize-Aufrufe mit `--load-restrictor=LoadRestrictionsNone`;
`tests/py/unit/ported/test_shared_db_initdb_selfheal.py` enthält die bisherige
Rollen-/Loop-Abdeckung. Deren veralteten exakten Loop-String nicht in neue Tests
kopieren. `tests/py/spec/remaining_domain_specs/test_database_migrations_runner.py`
prüft den tatsächlichen Node-Runner mit einem Pool-Double.

Vorab neue Regressionen auf dem unveränderten Implementierungsstand ausführen,
bevor p1–p3 implementiert werden; der Executor muss diese Reihenfolge herstellen.
Nicht den fehlenden Testordner als rote Evidenz verwenden. Erwartete
Assertion-Fehler: fehlende neue Rollen, alter Brand/DB-Name, fehlendes Auth-Overlay
und suspendierte Website. Falls Implementierung bereits vorliegt, im temporären
Checkout des vorigen Stands mit den neu geschriebenen Tests dieselbe rote
Evidenz erzeugen, ohne den aktuellen Worktree zurückzusetzen.

```bash
bash scripts/pytest-run.sh tests/py/spec/massage-tenant -q
# expected: FAIL — Assertions über die bislang fehlende Massage-Topologie,
# keine Collection-/Import-Fehler und kein ausschließlich übersprungener Lauf.
```

## Task 2: Tatsächliche Render-Ergebnisse und Flux-Topologie prüfen

In `test_render_topology.py` Kustomize wirklich ausführen und YAML-Dokumente
strukturiert nach `(kind, namespace, metadata.name)` indexieren. Alle Resultate
mit Exit-Code, stdout und stderr prüfen. Zusätzlich den produktiven
`bash scripts/flux-render-artifact.sh --out <tmp_path>` ausführen, damit
Defaults, Env-Substitution, Runtime-Dollar-Unwrapping und der neue Auth-Artefaktpfad
abgedeckt sind. Nur synthetische Secrets und gültige synthetische Image-Digests
verwenden; keine privaten Secret-Dateien lesen. Kustomize/Renderer sind für diese
lokalen Tests erforderlich: fehlende Werkzeuge klar als Vorbedingungsfehler
melden, keine grünen Skip-Suiten.

Website korczewski: existierender Deployment-/Service-Anker, Namespace
`website-korczewski`, effektive `BRAND` und `BRAND_ID` beide `massage`, DB-Name/-User
`website_massage`, Host `shared-db.workspace.svc` (bestehender FQDN-Suffix ist zulässig),
TLS-Verbindung und Secret-Key-Verweis auf das neue Passwort. Website mentolder:
Deployment-Anker, `BRAND` und `BRAND_ID` bleiben beim bestehenden Brand `mentolder`;
DB-Name/-User bleiben `website`/`website`,
DB-Host unverändert. Für alle übrigen mentolder-Deployment-Env-Werte strukturelle
Parität zum Render des Ausgangsstands verlangen, mit ausdrücklich dokumentierten
neuen gemeinsamen DB-Defaults als einziger zulässiger Änderung.

Auth: positiv Pocket-ID-Deployment, Service, Client-Seed-Job und Wildcard-Certificate
finden; Namespace `workspace-korczewski`; zentrale DB `pocket_id_korczewski`, eigener
Secret-Key; Frontend-/Callback-URLs aus der korczewski-Konfiguration. TLS-Sync-CronJob-Ziel ausschließlich `website-korczewski` prüfen (keine
Office-/coturn-Ziele). Client-Seed-Role/Binding in beiden Namespaces samt
ServiceAccount-Subject prüfen; Pocket-ID-DSN `sslmode=require`, Initcontainer
mit zentralem Host und kein `pocket-id-db-init` im Auth-Render. Keine Deployments/Jobs für Nextcloud, Brett,
Collabora, eigene shared-db oder eingefrorene Workspace-Jobs im Auth-Artefakt.

In `test_flux_freeze.py` die gebaute Fleet-Flux-Kustomization parsen und je Ressource
positive Existenz verlangen: `flux-korczewski` und `flux-jobs-korczewski` ausdrücklich
`suspend: true`; `flux-website-korczewski` und `flux-korczewski-auth` aktiv (false oder
nicht gesetztes Feld gemäß Flux-Default), richtige Pfade, Secret-Abhängigkeiten
und Registrierung im Fleet-Root. Auth-Kustomization: `wait: false`,
Deployment-Healthcheck sowie Abhängigkeiten auf Plattform, Secrets und zentrale
mentolder-DB. Website-Apex-Ingress und Redirect-Middleware ohne alten
Webspace-/CrossNamespace-Service-Anker prüfen. Eine Suche nach nicht vorkommenden Namen allein
ist keine Freeze-Prüfung.

## Task 3: Beide Init-Skripte mit leerem Passwort tatsächlich ausführen

In `test_shared_db_roles.py` den ConfigMap-Key `init-databases.sh` und den
Deployment-`lifecycle.postStart.exec.command` aus dem tatsächlichen Render
extrahieren. Dadurch den produktiven Dollarzeichen-Pfad mitprüfen; keine
selbstgeschriebene Kopie der neuen Guard-Logik testen. Bash-Syntax zuerst prüfen.
Dann beide Skripte als reale Bash-Prozesse mit beschränktem Timeout ausführen.
In `tmp_path/bin` Doubles für `psql`, `pg_isready` und erforderliche Wartebefehle
anlegen: `psql` protokolliert argv UND stdin, gibt für Existenzabfragen gezielt
"fehlt" oder "vorhanden" zurück und verändert niemals eine reale DB.

Parametrisierung pro Init-Pfad: beide neuen Passwortvariablen nicht gesetzt,
leer, einzeln gesetzt, beide gesetzt; bestehende Passwörter immer mit
synthetischen nichtleeren Werten befüllen. Bei unset/leer gibt es weder in argv
noch stdin eine Passwortänderung für die betreffende neue Rolle, insbesondere
kein `PASSWORD ''`; vorhandene Rollen behalten ihre bisherigen Befehle. Mit
nichtleerem Wert muss die passende Rolle genau diesen Testwert erhalten.
Positiv-Anker: Log ist nicht leer, beide neuen Rollen werden idempotent angelegt,
beide neuen DBs mit korrektem Owner erstellt bzw. im "vorhanden"-Fall nicht erneut
angelegt. Zweiten Durchlauf prüfen. Exit-Code und Fehlermeldungen dürfen nicht
verschluckt werden. Kein bloßes Regex-Vorkommen von `if` als Guard-Beweis.

## Task 4: Auditierten Migration-Scope und echten PostgreSQL-Lauf prüfen

In `test_brand_migration.py` die von p1 abgeschlossene Schreibpfad-Audit-Liste
als explizite erwartete Tabellen-/Constraint-Menge aufnehmen. Mindestanker:
`free_time_windows`, `legal_pages`, `homepage_block_documents`,
`homepage_block_versions` und `site_settings` (Homepage ContentStore und Rechnungssettings).
Root-Migration `migrations/20261008-massage-brand-checks.sql` und Website-Mirror
`components/website/src/db/migrations/20261008_massage_brand_checks.sql` fachlich
identisch prüfen; optionale Legacy-Tabellen durch `to_regclass` absichern. Neue Migration
und tatsächliche Schema-/Migrations-ConfigMaps parsen; prüfen, dass genau diese
CHECKs `massage` erlauben und kein mentolder-only `billing_*`-CHECK geändert wird.
Unbekannter Brand bleibt verboten. Test des realen Migration-Runners mit Pool-Double
belegt Registrierung/Ausführungsreihenfolge und idempotenten zweiten Lauf auch offline.

Optionaler Integrationstest nur mit ausdrücklich gesetzter Test-DB-Verbindung
`MASSAGE_TEST_DATABASE_URL`: keine automatische Cluster-/Produktions-DB-Erkennung.
Fehlt die Variable, `psql` oder die Erreichbarkeit, nur diesen Integrationstest mit
präzisem Grund überspringen. Nach erfolgreicher Verbindungsprüfung sind Schema-,
Migrations- und Assertion-Fehler echte Fehler, keine Skips. Verbindung niemals
protokollieren. In einer eigenen temporären Datenbank anhand der tatsächlichen
Schema-Initialisierung (`ensure-meetings` mit Test-DB-Zieloverride) und des
Website-Migration-Runners einen frischen Start
reproduzieren; nicht die historische Root-Factory-Migrationskette blind auf eine
leere DB anwenden. Katalogselektierte Ownership aller benötigten Tabellen,
Sequenzen und Schemas zu `website_massage` prüfen, ausschließlich in der neuen DB.
PostgreSQL-Katalog `pg_constraint` als positiven Anker auswerten.
Je auditierter Tabelle ein gültiges minimales Massage-Fixture schreiben und
unbekannten Brand unter Savepoint mit CHECK-Verletzung erwarten. Bestehende
mentolder-Daten und billing-Constraints vor/nach Migration vergleichen. Runner
zweimal ausführen, Versionsbuchhaltung und unveränderte Daten prüfen. Temporäre
DB zuverlässig im `finally` entfernen; nie anwendungsweite Tabellen leeren.

## Task 5: NetworkPolicy-Peers und bestehende Isolationsprüfung absichern

In `test_db_network_policy.py` echte gerenderte NetworkPolicy-Ressourcen in
`workspace` verlangen: `shared-db-endpoint-policy.yaml` ist im Ausgangsstand nur
eine ConfigMap und gilt nicht als Netzwerkregel. Ziel-Podselector `app: shared-db`,
Ingress TCP 5432 und zusätzlich genau die Namespaces `website-korczewski` und
`workspace-korczewski` prüfen, bestehende erlaubte mentolder-Peers behalten.
Alle auf shared-db anwendbaren Policies berücksichtigen, da ihre Erlaubnisse
additiv sind: kein universeller Namespace-Peer, kein unrestricted ingress,
keine zusätzliche pauschale Portfreigabe. Namespace- und Podselector im selben
Peer als UND, verschiedene Peers als ODER behandeln. Positiv-Anker erlaubter
Website-/Pocket-ID-Verkehr; negative Beispiele fremdes Namespace und falscher
Port. ClusterIP, kein NodePort/LoadBalancer/Ingress für 5432, mitprüfen.

Der alte Live-Test `tests/local/SA-22.sh` erwartet korczewski→zentrale DB ausdrücklich
BLOCKED. In diesem Teilplan `tests/local/SA-22.sh` mit dem vereinbarten ADR-012-Ausnahmeumfang
synchronisieren: gelabelte Website-/Pocket-ID-Probe-Pods gemäß den effektiven
Ingress- UND Egress-Podselektoren in den beiden erlaubten Namespaces müssen
5432 erreichen. p1 erweitert die Ingress-Freigabe namespaceweit auf diese beiden Namespaces. Die Probe daher ohne künstlich einschränkende Ingress-Labels ausführen und vorhandene Egress-Selektoren separat beachten. Fremde Namespaces und der eingefrorene eigene
korczewski-DB-Endpunkt bleiben negative Anker. Ein BLOCKED-Ergebnis darf
nur nach erfolgreichem Podstart, DNS-Auflösung und positivem Ziel-Anker gelten;
API-/Image-/DNS-Fehler nicht als Isolationserfolg werten. stderr erhalten und
Probe-Pods zuverlässig entfernen. Tests niemals nur ignorieren. Nach dem
Deploy relevante Live-Verifikation `./tests/runner.sh local SA-22` mit neuen
positiven erlaubten und negativen fremden Namespace-Proben ausführen. Ohne
Clusterzugriff Offline-Policyprüfungen ausführen und Live-Evidenz offen ausweisen.
Bestehende Massage-Playwright-Specs anschließend über `dev-flow-e2e` ausführen;
kein Playwright-Aufruf gegen Produktion während dieses Implementierungsschritts.

## Task 6: Finale Verifikation und Inventar

Nach p1–p4 alle neuen Tests grün; kein stiller Skip für Render, Shell oder Policy.
Ein fehlender optionaler PostgreSQL-Lauf wird separat berichtet. Vorhandene
shared-db-, Flux- und Migration-Runner-Tests zusätzlich ausführen. Die bestehende exakte Loop-Assertion in
`tests/py/unit/ported/test_shared_db_initdb_selfheal.py` hier ausdrücklich ändern:
Shell-Loop-Token strukturiert extrahieren, alle bisherigen Rollen und die zwei
neuen DB-Namen verlangen, statt eine feste alte vollständige Zeile zu erwarten.
Bisherige Existenz-vor-Create- und Collapse-Pipe-Assertions erhalten.

```bash
bash scripts/pytest-run.sh tests/py/spec/massage-tenant -q
bash scripts/pytest-run.sh tests/py/unit/ported/test_shared_db_initdb_selfheal.py tests/py/spec/test_flux_render_and_security.py tests/py/spec/remaining_domain_specs/test_database_migrations_runner.py -q
task test:inventory
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

Generiertes Test-Inventar mit den Implementierungsänderungen committen. Den tatsächlichen Backup-CronJob aus dem Render parsen: beide neuen DBs im
Backup-Loop, Passwort-Keys optional wie in p1 vereinbart; synthetischer
Ausführungstest protokolliert beide `pg_dump`-Ziele ohne reale Verbindung. Keine
produktiven Zugangsdaten, DNS-Änderungen oder Kontenerstellung durch Tests.
