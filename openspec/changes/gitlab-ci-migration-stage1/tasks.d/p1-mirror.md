# p1 — Push-Mirror GitHub → GitLab

**Zieldatei:** `.github/workflows/mirror-to-gitlab.yml` (neu)

## Aufgabe 1: Mirror-Workflow anlegen

Ein GitHub-Actions-Workflow, der bei jedem Push auf `main` den vollständigen Repo-Stand
per `git push --mirror` zur GitLab-Instanz spiegelt.

**Anforderungen an die Umsetzung:**

- Trigger ausschließlich `push` auf `main` sowie `workflow_dispatch` für manuelles Nachziehen.
  Kein `pull_request`-Trigger — PR-Stände gehören nicht in den Spiegel.
- `actions/checkout` mit `fetch-depth: 0`. Ein flacher Klon lässt `--mirror` scheitern, weil
  ihm die Historie fehlt. Das ist der häufigste Fehler bei diesem Workflow-Typ.
- Authentifizierung über die Secrets `GITLAB_MIRROR_TOKEN` und `GITLAB_MIRROR_URL`.
- **Fail-fast bei fehlendem Secret:** Vor dem Push prüfen, ob beide Secrets gesetzt sind, und
  andernfalls mit einer Meldung abbrechen, die die fehlende Variable **beim Namen nennt**.
  Ohne diesen Schritt endet der Workflow grün, ohne gespiegelt zu haben — genau der stille
  Fehlschlag, den die Delta-Spec ausschließt.
- Das Token darf nicht ins Log geraten: Remote-URL nicht per `echo` ausgeben; das Token über
  eine Umgebungsvariable in die URL einsetzen, nicht als Literal in eine `run`-Zeile schreiben.
- `concurrency` auf eine feste Gruppe setzen, damit zwei schnell aufeinanderfolgende Merges
  sich nicht überholen und der Spiegel nicht auf einem älteren Stand stehen bleibt.

**Prüfung nach der Umsetzung:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-mirror-workflow.bats
```

## Aufgabe 2: Workflow-Selbstlistung beachten

Der Repo-Guard `tests/spec/ci-cd/workflow-self-trigger.bats` verlangt, dass ein Workflow mit
`push.paths`-Filter sich selbst in diesen Pfaden listet. Dieser Workflow verwendet **keinen**
`paths`-Filter (er soll bei jedem `main`-Push laufen), fällt also nicht darunter. Vor dem
Commit dennoch gegenprüfen, dass der Guard grün bleibt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/workflow-self-trigger.bats
```

## Abgrenzung

Dieses Partial legt **kein** GitLab-Projekt an und hinterlegt **keine** Secrets — das sind
manuelle Abnahmeschritte im Hauptplan. Es ändert **keine** bestehende Workflow-Datei.
