# p5 — Guards

**target_files:** `tests/spec/ci-cd/gitlab-mirror-workflow.bats`,
`tests/spec/ci-cd/gitlab-parallel-non-blocking.bats`, `tests/spec/ci-cd/gitlab-tool-parity.bats`,
`tests/spec/ci-cd/gitlab-job-coverage.bats`, `tests/spec/ci-cd/ci-diff-base.bats`
**depends_on:** p1, p2, p3

## Rot zuerst

Dieser Partial wird **vor** p1–p3 abgenommen gefahren, damit belegt ist, dass die Guards die
Abwesenheit der Aenderung ueberhaupt bemerken. Ein Guard, der auch ohne die Implementierung
gruen ist, misst nichts.

- [ ] Die beiden neuen Dateien anlegen und gegen den **unveraenderten** Repo-Stand laufen:

  ```bash
  ./tests/unit/lib/bats-core/bin/bats \
    tests/spec/ci-cd/ci-diff-base.bats \
    tests/spec/ci-cd/gitlab-job-coverage.bats
  # expected: FAIL — scripts/ci-diff-base.sh existiert noch nicht, und
  # .gitlab-ci.yml hat erst drei der zehn Gegenstuecke
  ```

  Erst wenn dieser Lauf rot ist und die Fehlermeldungen die **fehlende Sache** benennen (nicht
  einen Syntaxfehler im Test), werden p1–p3 umgesetzt.

## Neue Guards

- [ ] **`tests/spec/ci-cd/ci-diff-base.bats`** — je ein Test pro Zeile der Vertragstabelle aus
      `tasks.md`. Geprueft werden Exit-Code **und** stdout, nicht nur der Exit-Code: der Fall
      „liefert 0, aber den falschen SHA" ist der einzige, der im Betrieb still danebengeht.
      Der `main`-Fall wird positiv verankert — leere Ausgabe **und** Exit 3, damit ein Skript,
      das gar nicht startet (Exit 127, ebenfalls leere Ausgabe), nicht als bestanden zaehlt.

- [ ] **`tests/spec/ci-cd/gitlab-job-coverage.bats`** — stellt die Offline-Gate-Jobs aus
      `.github/workflows/ci.yml` denen aus `.gitlab-ci.yml` gegenueber. Die Zuordnung steht
      als Tabelle im Test (GitHub-Name → GitLab-Name), der Aggregator `test-factory` als
      ausdruecklich ausgelassen mit Begruendung im Kommentar. Der Test scheitert, wenn ein
      `ci.yml`-Job weder zugeordnet noch als ausgelassen deklariert ist — damit faellt ein
      **kuenftig neu hinzugefuegter** GitHub-Job auf, statt die Luecke stillschweigend zu
      vergroessern. Beide Seiten werden mit `yaml.safe_load` gelesen, nicht mit `grep` auf
      Job-Namen: ein Name im Kommentartext wuerde sonst als Abdeckung zaehlen.

## Erweiterte Guards

- [ ] **`gitlab-mirror-workflow.bats`** — zwei Zusicherungen ergaenzen: die Trigger-Liste
      enthaelt die drei Arbeits-Praefixe, und der Push-Block behandelt den Loesch-Fall mit
      leerem Quell-Ref. Die bestehende `--mirror`-Zusicherung wird so nachgezogen, dass sie
      **Kommentarzeilen ausschliesst** — der Kopfkommentar der Workflow-Datei erwaehnt
      `--mirror` in seiner Begruendung, und ein naives `grep` wuerde daran scheitern (Befund
      aus p2).

- [ ] **`gitlab-parallel-non-blocking.bats`** — den Szenario-Test „Job-Paritaet allein
      schaltet das Gate nicht um" ergaenzen: `.github/workflows/ci.yml` traegt unveraendert
      seine Offline-Gate-Jobs, und keiner davon hat eine neue `if:`-Bedingung, die ihn
      dauerhaft ueberspringt. Das ist der Guard gegen den versehentlichen Gate-Flip.

- [ ] **`gitlab-tool-parity.bats`** — von einer Version auf eine Werkzeug-Tabelle erweitern
      (gitleaks, Node, pnpm, kubectl, yq, Trivy). Je Werkzeug die Fundstelle auf beiden
      Seiten und ein Vergleich der **Versionswerte**. Wichtig fuer die Aussagekraft: Der Test
      gibt die Anzahl der tatsaechlich verglichenen Werkzeuge aus und scheitert, wenn sie
      null ist — sonst waere eine Tabelle, deren Fundstellen alle ins Leere greifen, gruen.

## Nach Gruen

- [ ] `task test:inventory` laufen lassen und
      `components/website/src/data/test-inventory.json` mitcommitten. Der CI-Inventar-Check
      vergleicht die generierte Datei gegen die committete und scheitert bei Abweichung.

## Abnahme

```bash
./tests/unit/lib/bats-core/bin/bats \
  tests/spec/ci-cd/ci-diff-base.bats \
  tests/spec/ci-cd/gitlab-job-coverage.bats \
  tests/spec/ci-cd/gitlab-mirror-workflow.bats \
  tests/spec/ci-cd/gitlab-parallel-non-blocking.bats \
  tests/spec/ci-cd/gitlab-tool-parity.bats
```

Alle fuenf Dateien gruen, und die Anzahl ausgefuehrter Tests ist groesser als vor der
Aenderung — eine gleich gebliebene Zahl hiesse, dass die neuen Zusicherungen nicht greifen.
