# p1 — Branch nachziehen, Staging-Secrets zusammenführen und neu versiegeln

Target files: `environments/.secrets/staging.yaml`, `environments/sealed-secrets/staging.yaml`.
Design: `design.md` RC1, D1. Keine anderen Dateien inhaltlich ändern.

Voraussetzung: `git-crypt` ist im Worktree entsperrt (`head -c 10 environments/.secrets/staging.yaml`
zeigt Klartext, kein Binärheader).

### Task 1: origin/main mergen

```bash
git fetch origin main
git merge origin/main
```

Erwartet: Konflikt ausschließlich in `environments/.secrets/staging.yaml` und
`environments/sealed-secrets/staging.yaml`. Konflikte in anderen Dateien: abbrechen
(`git merge --abort`) und an den Orchestrator melden.

### Task 2: Klartext-Konflikt auflösen

Die Branch-Seite (97 Keys aus `f970659911`) ist die Basis. Einzige Änderung von `main` an dieser
Datei ist `8ce2d57d6` (T900728): Key `FACTORY_OTLP_TOKEN` wurde in `OTEL_AUTH_TOKEN` umbenannt.

Die Branch-Seite ist bei `git merge origin/main` die Seite `--ours`:

```bash
git checkout --ours environments/.secrets/staging.yaml
```

Dann in dieser Datei den Key `FACTORY_OTLP_TOKEN` in `OTEL_AUTH_TOKEN` umbenennen, Wert
unverändert lassen. Prüfen, dass kein Wert in eine Ausgabe gelangt:

```bash
python3 -I -c 'import yaml,sys
d=yaml.safe_load(open("environments/.secrets/staging.yaml"))
flat={}
def w(o):
    for k,v in o.items():
        w(v) if isinstance(v,dict) else flat.__setitem__(k,v)
w(d)
print(len(flat), "OTEL_AUTH_TOKEN" in flat, "FACTORY_OTLP_TOKEN" in flat)'
# erwartet: 97 True False
```

### Task 3: Validieren und versiegeln

```bash
task env:validate ENV=staging
task env:fetch-cert ENV=staging
task env:seal ENV=staging
```

`env:seal` rotiert laut Beschreibung nur `workspace-secrets`. Nach dem Seal prüfen, dass der
`website-secrets`-Block in `environments/sealed-secrets/staging.yaml` `POCKET_ID_WEBSITE_SECRET`
enthält und neu verschlüsselt wurde (`git diff --stat` zeigt Änderungen in beiden Blöcken). Fehlt
die Neuversiegelung von `website-secrets`, den Abschnitt „co-rotate website-secrets" in der
Task-Definition (`grep -n -A40 'env:seal:' taskfiles/*.yml Taskfile.yml`) befolgen.

### Task 4: Merge abschließen

```bash
git add environments/.secrets/staging.yaml environments/sealed-secrets/staging.yaml
git commit --no-edit
```

### Prüfung

```bash
tests/unit/lib/bats-core/bin/bats -f 'Pflicht-Keys' tests/spec/staging-stack-repair.bats   # ok
git diff origin/main --stat -- environments/   # nur die zwei Staging-Dateien
```
