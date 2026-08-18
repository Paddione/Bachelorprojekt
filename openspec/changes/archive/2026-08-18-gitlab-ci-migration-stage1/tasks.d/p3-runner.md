# p3 — Runner-Registrierung und Betriebs-Runbook

**Zieldateien:** `scripts/gitlab-runner-setup.sh` (neu), `docs/runbooks/gitlab-runner.md` (neu)

## Aufgabe 1: Registrierungs-Skript

Ein Bash-Skript, das den self-hosted Runner nicht-interaktiv mit dem Docker-Executor
registriert.

**Anforderungen an die Umsetzung:**

- `set -euo pipefail`, Usage-Block, wie die übrigen Skripte unter `scripts/`.
- Registrierung über **Authentication-Token** (`--token "$GITLAB_RUNNER_TOKEN"`, Präfix
  `glrt-`). Der ältere `--registration-token`-Fluss ist seit GitLab 16 veraltet und aus
  aktuellen Versionen entfernt — ein darauf gebautes Skript scheitert genau dann, wenn es
  zum ersten Mal gebraucht wird.
- Feste Registrierungsparameter: `--non-interactive`, `--executor docker`,
  `--tag-list bachelorprojekt-local`, eine sprechende `--description`, sowie
  `--url` aus einer Variablen mit Vorgabe `https://gitlab.com`.
- `--run-untagged=false`: Der Runner soll ausschließlich Jobs annehmen, die ihn über seinen
  Tag adressieren. Andernfalls zöge er auch Jobs an, die eigentlich in die Cloud ausweichen
  sollen, und der Fallback wäre wirkungslos.

**`--dry-run`-Modus (tragende Anforderung):**

Mit `--dry-run` gibt das Skript den vollständigen `gitlab-runner register`-Aufruf auf stdout
aus, kontaktiert GitLab nicht, schreibt keine Runner-Konfiguration und endet mit Exit-Code 0 —
auch dann, wenn weder ein Token gesetzt noch `gitlab-runner` installiert ist. Genau das macht
den Guard in p4 zu einer Verhaltensprüfung statt zu einer Textsuche im Quelltext
(Repo-Konvention T002448-M4, „Output- statt Source-Verifikation"). Im Dry-Run darf kein
echter Token-Wert ausgegeben werden — an seiner Stelle steht ein Platzhalter.

**Fehlerverhalten im Echtlauf:**

- Fehlende Token-Variable → Exit ≠ 0, Meldung **benennt die Variable**.
- Fehlendes `gitlab-runner`-Binary → Exit ≠ 0 mit Installationshinweis. Nicht still überspringen:
  Ein Setup-Skript, das ohne Wirkung grün endet, ist schlechter als eines, das abbricht.

**Prüfung nach der Umsetzung:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats
```

## Aufgabe 2: Runbook

`docs/runbooks/gitlab-runner.md`, im Stil der bestehenden Runbooks unter `docs/runbooks/`.

**Inhalt:**

1. **Ersteinrichtung:** Runner in GitLab anlegen, `glrt-`-Token beziehen, Skript aufrufen.
   Zuerst der Dry-Run zum Gegenlesen, dann der Echtlauf.
2. **Fallback-Umschaltung — der eigentliche Zweck des Runbooks.** Als nummerierte Schritte:
   Projekt-Variable `CI_RUNNER_TAG` von `bachelorprojekt-local` auf `saas-linux-small-amd64`
   setzen, Pipeline erneut starten, und — ausdrücklich — **zurückstellen, sobald der
   self-hosted Runner wieder läuft**. Der Rückweg gehört mit ins Runbook, sonst bleibt die
   Last dauerhaft in der Cloud, ohne dass es jemandem auffällt.
3. **Diagnose:** Woran man erkennt, dass der Runner die Ursache ist — Jobs bleiben `pending`
   statt zu scheitern. Ein hängender Job sieht nicht aus wie ein Fehler, deshalb steht das
   hier und nicht nur im Kopf des Betreibers.
4. **Warum die Umschaltung manuell ist:** Ein automatisches Ausweichen würde den Ausfall
   verbergen, und ein Ausfall, den niemand bemerkt, wird nicht behoben (Design D2).
5. **Abgrenzung:** Diese Etappe betreibt nur den lokalen Docker-Executor. Der
   Kubernetes-Executor auf fleet folgt in Etappe 2.

## Abgrenzung

Dieses Partial registriert **keinen** echten Runner und legt **keine** Kubernetes-Manifeste an.
Die reale Registrierung ist ein manueller Abnahmeschritt im Hauptplan.
