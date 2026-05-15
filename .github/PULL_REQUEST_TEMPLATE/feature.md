## Feature: <!-- Kurztitel -->

> **Hinweis:** Dieser PR ist nach dem Review sofort zu mergen (Squash-Merge) und nicht offen zu lassen.
> PRs dienen ausschliesslich der sauberen Git-History -- kein langwieriger Review-Prozess vorgesehen.

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

### Manuelles Testen

- [ ] Im k3d-Cluster deployt (`task workspace:deploy`)
- [ ] Service ueber `*.localhost` erreichbar verifiziert
- [ ] SSO-Flow End-to-End funktioniert (falls Auth-bezogen)
- [ ] Relevante Testsuite ausgefuehrt (`tests/runner.sh`)

### Rollback-Plan

<!-- Wie wird zurueckgesetzt, falls etwas kaputtgeht? In der Regel: PR revertieren. -->
