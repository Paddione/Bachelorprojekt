# p2 — GitLab-Pipeline mit drei Kern-Jobs

**Zieldatei:** `.gitlab-ci.yml` (neu, Repo-Wurzel)

## Aufgabe 1: Pipeline-Gerüst mit Tag-Routing

Ein `.gitlab-ci.yml` mit drei Stages und einem gemeinsamen Routing-Mechanismus.

**Anforderungen an die Umsetzung:**

- Globale `variables:`-Sektion setzt `CI_RUNNER_TAG: bachelorprojekt-local` als Vorgabewert.
  Der Wert ist damit im Repo sichtbar und wird im Störfall über die Projekt-Variable in der
  GitLab-Oberfläche übersteuert (Projekt-Variablen haben Vorrang vor Datei-Variablen).
- **Jeder** Job deklariert `tags: [$CI_RUNNER_TAG]`. Kein Job trägt einen Tag als Literal —
  ein hartkodierter Tag macht genau den Job unerreichbar, den der Fallback retten soll.
  Am sparsamsten über ein `default:`- oder Anker-Konstrukt, das alle drei Jobs erben.
- Kein Job darf `allow_failure: true` tragen: Der Spiegel soll Fehlschläge zeigen. Dass er
  den Merge nicht blockiert, ergibt sich daraus, dass GitLab nirgends als Required Check
  hinterlegt ist — nicht daraus, dass die Jobs weich gestellt sind.

## Aufgabe 2: Job `bats-unit`

Spiegelt den GitHub-Job `test-bats`.

- Image mit Bash und Git; `git` wird für die Tests benötigt.
- Kommando läuft über den **vendored** Runner `tests/unit/lib/bats-core/bin/bats` — nicht über
  ein global installiertes `bats` (Repo-Konvention: CI und lokal führen dasselbe Binary aus).
- Läuft die **volle** Unit-Menge (`-r tests/unit/`), nicht die Diff-Auswahl. Begründung in
  Design D4: Der Mirror pusht `main`, eine Diff-Auswahl gegen `main` selektiert nichts, und die
  Pipeline wäre grün, ohne einen Test ausgeführt zu haben.
- Vor dem Testlauf `bash scripts/ci-dummy-secrets.sh` ausführen — der GitHub-Job tut dasselbe,
  und ohne die Dummy-Secrets schlagen Tests aus einem Grund fehl, der nichts mit dem Code zu
  tun hat.
- **Leerer Lauf gilt als Fehlschlag.** Die Zahl der ausgeführten Tests prüfen und bei null mit
  Exit ≠ 0 abbrechen. Diese Zusicherung steht ausdrücklich in der Delta-Spec, weil ein leerer,
  grüner Lauf die gefährlichste Ausprägung dieser Pipeline wäre.

## Aufgabe 3: Job `manifests`

Spiegelt den GitHub-Job `test-manifests`.

- kubectl in der Version **v1.31.0** beziehen — identisch zum GitHub-Job.
- Fährt `tests/unit/manifests.bats` und `tests/unit/dead-node-affinity.bats`.
- `tests/unit/changed-manifests.bats` wird bewusst **weggelassen**: Der Test ist diff-basiert
  und hat auf einem `main`-Mirror-Push keinen Bezugspunkt (Design D4).

## Aufgabe 4: Job `gitleaks`

Spiegelt den GitHub-Job `security-scan`.

- Version **exakt 8.18.2**, identisch zu `.github/workflows/ci.yml:501/506`. Der
  Paritäts-Guard aus p4 vergleicht beide Dateien und schlägt bei Abweichung fehl.
- Aufruf mit denselben Argumenten: `--config .gitleaks.toml --no-git --redact`.
- Fail-closed: Ein Fund beendet den Job mit Exit ≠ 0.
- Die Version so schreiben, dass sie maschinell auffindbar ist (eine `GITLEAKS_VERSION`-
  Variable statt der Zeichenkette an drei verstreuten Stellen) — der Paritäts-Guard liest sie
  aus, und eine einzige Fundstelle macht den späteren Versions-Bump eindeutig.

## Prüfung nach der Umsetzung

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-runner-tag-routing.bats \
                                  tests/spec/ci-cd/gitlab-tool-parity.bats
```

## Abgrenzung

Keine weiteren Jobs in dieser Etappe — keine Builds, kein E2E, kein Deploy, kein Vitest.
Die Pipeline soll die Mechanik belegen, nicht die GitHub-Seite ersetzen.
