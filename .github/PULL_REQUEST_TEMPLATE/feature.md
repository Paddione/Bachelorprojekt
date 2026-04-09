## Feature: <!-- Kurztitel -->

### Problem / Motivation

<!-- Welche Luecke schliesst dieses Feature? Link zu Issue falls vorhanden. -->

### Loesung

<!-- Ueberblick ueber den gewaehlten Ansatz. -->

### Aenderungen

- [ ] Wichtigste geaenderte Dateien/Komponenten auflisten

### CI/CD-Verifikation

> **Dieser PR muss alle CI-Checks bestehen.** Folgendes wird automatisch geprueft:
> - Kubernetes-Manifest-Validierung (kustomize build + dry-run)
> - YAML-Linting
> - Shell-Skript-Linting
> - Security-Scan auf hartcodierte Secrets

### Anforderungs-Nachverfolgbarkeit

> Jedes Feature muss durch einen Anforderungseintrag in der Tracking-Datenbank abgesichert sein.
> Verwende `task tracking:psql` zum Abfragen/Hinzufuegen von Anforderungen oder schaue auf `tracking.localhost`.

1. **Pruefen**, ob ein Anforderungseintrag fuer dieses Feature existiert:
   ```sql
   SELECT id, name, category FROM bachelorprojekt.requirements WHERE id = 'FA-XX';
   ```

2. **Falls kein Eintrag existiert**, einen erstellen:
   ```sql
   INSERT INTO bachelorprojekt.requirements (id, category, name, description, acceptance_criteria, test_cases)
   VALUES ('FA-XX', 'Funktionale Anforderung', 'Kurztitel', 'Beschreibung', '1) Erstes Kriterium\n2) Zweites', 'T1: Erster Test\nT2: Zweiter Test');
   ```

3. **Tests schreiben**, die der `test_cases`-Spalte entsprechen:
   - Bash: `tests/local/<REQ-ID>.sh` oder `tests/prod/<REQ-ID>.sh`
   - Playwright: `tests/e2e/specs/<req-id>-<name>.spec.ts`
   - Jede Assertion muss die korrekte `REQ-ID` und `Tn` referenzieren

- [ ] Anforderungseintrag existiert in der Tracking-DB (oder wurde in diesem PR erstellt)
- [ ] `acceptance_criteria` sind spezifisch und verifizierbar
- [ ] `test_cases`-Eintraege (T1, T2, ...) decken alle Abnahmekriterien ab
- [ ] Test-Skript implementiert alle Testfaelle
- [ ] `./tests/runner.sh local <REQ-ID>` besteht

**Anforderungs-ID:** <!-- z.B. FA-09 -->

### Manuelles Testen

- [ ] Im k3d-Cluster deployt (`task workspace:deploy`)
- [ ] Service ueber `*.localhost` erreichbar verifiziert
- [ ] SSO-Flow End-to-End funktioniert (falls Auth-bezogen)
- [ ] Relevante Testsuite ausgefuehrt (`tests/runner.sh`)

### Rollback-Plan

<!-- Wie wird zurueckgesetzt, falls etwas kaputtgeht? In der Regel: PR revertieren. -->
