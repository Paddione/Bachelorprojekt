# envsubst Variable Management — Referenz

## Problem

Wenn du eine neue `${VARIABLE}`-Referenz zu einem Kubernetes-Manifest hinzufügst,
muss diese Variable in zwei Stellen registriert werden, sonst bleibt der
Platzhalter literal stehen und `kubectl apply` schlägt fehl.

## Registrierungs-Checkliste

### 1. Schema deklarieren

`environments/schema.yaml` — füge die Variable unter dem passenden Abschnitt hinzu:

```yaml
env_vars:
  - name: MEINE_NEUE_VAR
    description: "Was diese Variable tut"
    required: true
    example: "https://example.com"
```

### 2. envsubst in Taskfile.yml registrieren

Jeder Task, der das Manifest `envsubst`-ed, braucht die Variable in seiner
`envsubst`-Liste. Die relevanten Stellen in `Taskfile.yml`:

| Task | Ungefähre Zeile | Variablen-Set |
|------|----------------|---------------|
| `workspace:deploy` (dev) | ~1117 | `PROD_DOMAIN BRAND_NAME CONTACT_EMAIL BRAND_ID` |
| `workspace:deploy` (prod) | ~1145 | Dynamisch via `ENVSUBST_VARS` (hier anhängen) |
| `mcp:deploy` | ~1350 | MCP-spezifisch |
| `workspace:office:deploy` | ~510 | Office-Stack |

**Wichtig:** Die Zeilennummern sind Richtwerte — prüfe mit `grep -n "envsubst" Taskfile.yml`
die aktuellen Positionen.

### 3. Per-Env-Wert setzen

`environments/<env>.yaml` — trage den tatsächlichen Wert für jede Umgebung ein:

```yaml
env_vars:
  MEINE_NEUE_VAR: "der-echte-wert"
```

### 4. Validieren

```bash
task workspace:validate
task env:validate
```

## Häufige Fehler

- **Variable in Manifest hinzugefügt aber nicht in Taskfile registriert** → `${MEINE_VAR}` bleibt literal im YAML stehen
- **Variable in Taskfile aber nicht in schema.yaml** → `env:validate` schlägt fehl
- **$$ Escaping**: Keycloak-Variablen mit `$$` müssen so bleiben (push-deploy sed bei Taskfile 1724/1831 braucht Escaping)
