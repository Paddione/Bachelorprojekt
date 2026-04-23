# Beitragen zum Workspace MVP

## Workflow

Alle Änderungen gehen durch Pull Requests. Direkte Pushes auf `main` sind nicht erlaubt.

```
main
 └── feature/mein-feature   (git checkout -b)
      └── entwickeln + testen
           └── task workspace:validate
                └── git push → gh pr create
                     └── CI-Pipeline
                          └── grün → Squash & Merge → main
```

---

## Branch-Namenskonvention

| Präfix | Zweck |
|--------|-------|
| `feature/*` | Neue Funktionalität |
| `fix/*` | Fehlerbehebungen |
| `chore/*` | Refactoring, Abhängigkeiten, CI/CD |

---

## Lokale Entwicklung

### Erstmaliges Setup

```bash
task cluster:create     # k3d-Cluster erstellen
task workspace:deploy   # alle Services deployen
task workspace:status   # Pod-Gesundheit prüfen
```

Alternativ als Einzeiler:

```bash
task workspace:up   # Cluster + MVP + MCP in einem Schritt
```

### Tägliche Befehle

```bash
task workspace:status                # alles prüfen
task workspace:logs -- keycloak      # Service-Logs ansehen
task workspace:restart -- keycloak   # Service neu starten
task workspace:psql -- website       # psql-Shell zur Datenbank
task workspace:port-forward          # shared-db auf localhost:5432
```

Dev-Services erreichbar unter:

| Service | URL | Zugangsdaten |
|---------|-----|--------------|
| Keycloak (SSO) | `http://auth.localhost` | admin / devadmin |
| Nextcloud | `http://files.localhost` | — |
| Collabora | `http://office.localhost` | — |
| Claude Code (MCP) | (kein Web-UI) | — |
| Vaultwarden | `http://vault.localhost` | — |
| Whiteboard | `http://board.localhost` | — |
| Mailpit | `http://mail.localhost` | — |
| Docs | `http://docs.localhost` | — |
| Website | `http://web.localhost` | — |

---

## Vor dem Commit validieren

```bash
task workspace:validate   # K8s-Manifeste per Dry-Run validieren
shellcheck scripts/*.sh   # Shell-Skripte linten (falls geändert)
```

---

## CI-Pipeline

Die GitHub Actions-Pipeline (`.github/workflows/ci.yml`) läuft bei jedem PR und prüft:

| Prüfung | Werkzeug |
|---------|---------|
| YAML-Linting | `yamllint` (200-Zeichen-Limit) |
| Kubernetes-Manifest-Validierung | `kustomize build` + `kubeconform` (K8s 1.31.0) |
| Shell-Linting | `shellcheck` auf alle Skripte |
| Konfigurations-Validierung | Realm-JSON, PHP-OIDC-Config |
| Security-Scan | Image-Pinning, Secret-Erkennung |

Die CI muss grün sein, bevor ein Merge möglich ist.

---

## Monorepo-Regeln

1. `k3d/k3s` ist der einzige Deployment-Pfad — kein docker-compose.
2. Alle Kubernetes-Manifeste liegen in `k3d/`.
3. Domains sind zentral in `k3d/configmap-domains.yaml` definiert. Keine hartkodierten Hostnamen.
4. Secrets bleiben in `k3d/secrets.yaml` (nur Dev-Werte). Niemals echte Credentials committen.
5. Nach Manifest-Änderungen testen: `./tests/runner.sh local <TEST-ID>`.
6. Vor dem Commit validieren: `task workspace:validate`.

---

## PR erstellen

```bash
# Änderungen stagen und committen
git add k3d/mein-manifest.yaml
git commit -m "fix: kurze Beschreibung der Änderung"

# PR erstellen
gh pr create \
  --title "fix: kurze Beschreibung" \
  --body "## Änderung
- Was wurde geändert
- Warum

## Testen
- [ ] task workspace:validate
- [ ] ./tests/runner.sh local <TEST-ID>"
```

---

## Merge

- Merge-Methode: **Squash-and-Merge** für eine saubere `main`-History
- CI muss grün sein
- Kein Force-Push auf `main`
- Nach dem Merge: Branch löschen

---

## Tests ausführen

```bash
./tests/runner.sh local              # Vollständige Testsuite gegen k3d
./tests/runner.sh local SA-08        # Einzelner Test
./tests/runner.sh local --verbose    # Ausführliche Ausgabe
./tests/runner.sh report             # Markdown-Report generieren
```

Test-IDs: `FA-01`–`FA-26` (funktional), `SA-01`–`SA-10` (Sicherheit), `NFA-01`–`NFA-09` (nicht-funktional), `AK-03`, `AK-04` (Abnahme).

Weitere Details: [Testframework](tests.md)
