## Zusammenfassung

> **Hinweis:** Dieser PR ist nach dem Review sofort zu mergen (Squash-Merge) und nicht offen zu lassen.
> PRs dienen ausschliesslich der sauberen Git-History -- kein langwieriger Review-Prozess vorgesehen.

<!-- Beschreibe WAS sich geaendert hat und WARUM (nicht wie -- das zeigt der Diff). -->

## Art der Aenderung

- [ ] Feature (`feature/*` Branch)
- [ ] Bugfix (`fix/*` Branch)
- [ ] Refactoring / Wartung (`chore/*` Branch)
- [ ] Dokumentation
- [ ] Infrastruktur / K8s-Manifeste

## Checkliste

### Pflicht fuer alle PRs
- [ ] Branch folgt der Namenskonvention (`feature/`, `fix/`, `chore/`)
- [ ] Aenderungen betreffen nur ein Thema
- [ ] Keine Secrets oder Zugangsdaten committet (Dev-Secrets in `k3d/secrets.yaml` sind OK)

### Bei Aenderungen an Kubernetes-Manifesten (`k3d/`)
- [ ] `kubectl kustomize k3d/` funktioniert lokal
- [ ] Im lokalen k3d-Cluster deployt und verifiziert (`task workspace:deploy`)
- [ ] Resource Requests/Limits fuer neue Container gesetzt
- [ ] Health Probes fuer neue Services konfiguriert
- [ ] Keine hartkodierten Hostnamen -- `configMapKeyRef` aus `domain-config` verwenden

### Bei Aenderungen an Skripten (`scripts/`, `tests/`)
- [ ] `shellcheck` bestanden (Warnungen akzeptabel, Fehler nicht)
- [ ] In sauberer Umgebung getestet

### Bei Aenderungen an Authentifizierung (Keycloak / OIDC)
- [ ] `k3d/realm-workspace-dev.json` aktualisiert falls Clients geaendert
- [ ] SSO-Login fuer alle betroffenen Services getestet


**Anforderungs-ID:** <!-- z.B. FA-09, SA-08, NFA-08 -->

## Testplan



**Anforderungs-JSON Testfall:**
<!-- Testfall-Feld aus dem JSON-Eintrag einfuegen, damit Reviewer die Abdeckung pruefen koennen -->

**Implementierte Tests:**
- [ ] Test-Skript in `tests/local/` (Bash) oder `tests/e2e/specs/` (Playwright) hinzugefuegt/aktualisiert
- [ ] Jeder Testfall (T1, T2, ...) aus dem JSON `Testfall` wird durch eine Assertion abgedeckt
- [ ] Assertions verwenden die korrekte Anforderungs-ID und Test-ID: `assert_* ... "REQ-ID" "T1" "Beschreibung"`
- [ ] `./tests/runner.sh local <REQ-ID>` besteht

## Screenshots / Logs

<!-- Falls zutreffend, Ausgabe oder Screenshots einfuegen -->
