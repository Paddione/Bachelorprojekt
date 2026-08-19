# p4 — Runbook fuer den Branch-Pipeline-Betrieb

**target_files:** `docs/runbooks/gitlab-runner.md`

## Warum

Das Runbook beschreibt heute den Betrieb einer Pipeline, die ausschliesslich auf `main`
laeuft: ein Lauf pro Merge, vorhersagbare Last, und `pending` heisst „Runner weg". Mit
Branch-Spiegelung aendert sich jede dieser drei Annahmen. Wer im Stoerfall nach dem alten
Text handelt, sucht an der falschen Stelle.

## Aufgaben

- [ ] Abschnitt „Branch-Pipelines" ergaenzen: welche Branch-Praefixe gespiegelt werden, dass
      jeder Push eine eigene Pipeline erzeugt, und dass `interruptible: true` ueberholte
      Laeufe abbricht — ein abgebrochener Lauf ist damit ein **Normalzustand**, kein Befund.

- [ ] Diagnose-Eintrag fuer die Diff-Basis. Die haeufigste neue Fehlerklasse ist ein Job, der
      scheitert, weil `origin/main` im flachen Klon fehlt — nicht, weil ein Test rot ist. Der
      Eintrag nennt den Unterschied der Exit-Codes (3 = keine Basis anwendbar, 4 = Umgebung
      kaputt) und den Befehl, der beides lokal reproduziert:

  ```bash
  CI_COMMIT_BRANCH=main bash scripts/ci-diff-base.sh; echo "rc=$?"
  ```

- [ ] Kapazitaets-Hinweis. Sieben zusaetzliche Jobs, davon vier parallele Shards, auf einem
      Runner, dessen `fleet`-CP-Knoten laut Etappe-2-Befund bei 96 % CPU-Requests liegt. Der
      Abschnitt nennt den Umschaltweg auf SaaS (`CI_RUNNER_TAG` in der Projekt-UI, Etappe-1-
      Mechanik) als erste Massnahme bei Stau — nicht das Abschalten von Jobs.

- [ ] Den Satz korrigieren, der GitLab als reine Nachkontrolle auf `main` beschreibt. Er ist
      mit dieser Etappe falsch, und ein falscher Runbook-Satz ist schaedlicher als ein
      fehlender: er wird befolgt.

- [ ] Ausdruecklich festhalten, dass GitLab weiterhin **kein** Merge-Gate ist. Ein Runbook,
      das Branch-Pipelines beschreibt, liest sich sonst wie eine Anleitung zum Umschalten.

## Abnahme

```bash
grep -c 'ci-diff-base' docs/runbooks/gitlab-runner.md    # > 0
grep -c 'CI_RUNNER_TAG' docs/runbooks/gitlab-runner.md   # > 0 (Umschaltweg weiterhin dokumentiert)
```
