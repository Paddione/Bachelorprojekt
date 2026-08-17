# p4 — Guards (Tests-Partial, RED zuerst)

**Zieldateien (alle neu, je eine Datei pro Vorgang nach T002416):**

```
tests/spec/ci-cd/gitlab-tool-parity.bats
tests/spec/ci-cd/gitlab-runner-tag-routing.bats
tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats
tests/spec/ci-cd/gitlab-mirror-workflow.bats
tests/spec/ci-cd/gitlab-parallel-non-blocking.bats
```

## Aufgabe 0: RED-Lauf zuerst

Die fünf Dateien anlegen und ausführen, **bevor** p1–p3 umgesetzt sind. Sie müssen fehlschlagen,
und zwar mit einer Meldung, welche die fehlende Zieldatei benennt:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/gitlab-*.bats
# expected: FAIL (rot — .gitlab-ci.yml, der Mirror-Workflow und das Setup-Skript fehlen noch)
```

Ein RED-Lauf, der grün ist, ist ein Befund am Test und nicht „schon erfüllt" (T003548). Wird
er grün, prüfen, ob die Zusicherung überhaupt die Größe misst, um die es geht.

## Gemeinsame Konventionen für alle fünf Dateien

Diese Punkte haben im Repo je einen dokumentierten Schadensfall und sind deshalb nicht
verhandelbar:

- **Positiv-Anker bei jedem Negativtest (T002356-M1).** Eine Zusicherung der Form „X darf nicht
  vorkommen" besteht vakuos, wenn die Kandidatenliste leer ist. Deshalb im **selben** Test
  zuerst belegen, dass der gültige Fall überhaupt gefunden wurde — etwa: „es gibt mindestens
  einen Job" —, dann erst die Negativ-Aussage prüfen.
- **Semantik statt Darstellung (T002716).** Nicht das Ausgabeformat eines Werkzeugs
  festschreiben und keine Zeilenanker auf Tabellenspalten. Geprüft wird das Ergebnis
  (Exit-Code, Vorhandensein eines Werts, ankerfreier Substring), nicht die Formulierung. Ein
  Guard, der den Wortlaut festhält, wird rot, sobald jemand eine Meldung umformuliert, und
  meldet dann einen Defekt, den es nicht gibt.
- **`grep` mit Optionsschutz (T003108).** Ein Muster, das mit `-` beginnt (`--token`,
  `--registration-token`), wird sonst als Option geparst; `grep -qF '--token'` endet mit
  Exit **2**, nicht 1 — in einer `if`-Bedingung sind Werkzeugfehler und „nicht gefunden" dann
  nicht mehr unterscheidbar. Immer `grep -e '--token'` oder `grep -- '--token'` schreiben.
- **Header-Kommentar** in jeder Datei, der den Prüfmodus benennt (Konvention T002448-M4).
- Die Guards laufen **ohne** GitLab-Zugang, ohne Netz und ohne installierten `gitlab-runner`.
  Alles, was eine dieser Voraussetzungen bräuchte, gehört in die manuelle Abnahme im Hauptplan.

## Aufgabe 1: `gitlab-tool-parity.bats`

Vergleicht die gitleaks-Version aus `.github/workflows/ci.yml` mit der aus `.gitlab-ci.yml`.

- Version aus **beiden** Dateien per Regex extrahieren.
- **Positiv-Anker:** zuerst prüfen, dass aus jeder der beiden Dateien überhaupt eine
  nicht-leere Version extrahiert wurde. Ohne diesen Schritt bestünde der Test, wenn eine Datei
  fehlt oder umbenannt wurde — zwei leere Zeichenketten sind gleich.
- Danach die beiden Werte vergleichen. Bei Ungleichheit müssen **beide** Werte in der
  Fehlermeldung stehen, sonst ist der Befund ohne Nachrecherche nicht verwertbar.
- Zusätzlich: Beide Seiten rufen gitleaks mit denselben Argumenten auf
  (`--config .gitleaks.toml`, `--no-git`, `--redact`) — mit Optionsschutz beim `grep`.

## Aufgabe 2: `gitlab-runner-tag-routing.bats`

Prüft, dass kein Job in `.gitlab-ci.yml` einen Runner-Tag als Literal trägt.

- **Positiv-Anker:** zuerst belegen, dass `.gitlab-ci.yml` existiert und mindestens eine
  `tags:`-Deklaration enthält. Ohne Anker ist „kein Literal gefunden" bei einer leeren Datei
  trivial wahr.
- Dann: Jede `tags:`-Deklaration verweist auf die Variable `$CI_RUNNER_TAG`.
- Dann: Der Vorgabewert `bachelorprojekt-local` ist in der globalen `variables:`-Sektion
  gesetzt, damit das Repo den Normalzustand dokumentiert.
- Über die YAML-Struktur prüfen, nicht über Zeilenanker auf eine bestimmte Einrückung —
  Einrückung ist Darstellung.

## Aufgabe 3: `gitlab-runner-setup-dryrun.bats`

Der einzige Guard, der ein Skript **ausführt** statt eine Datei zu lesen.

- `run bash scripts/gitlab-runner-setup.sh --dry-run`
- `$status` ist 0, auch ohne gesetztes Token und ohne installiertes `gitlab-runner`-Binary.
- `$output` enthält `gitlab-runner register` und `--token` (Optionsschutz beachten).
- `$output` enthält **nicht** `--registration-token`. Der Positiv-Anker dafür ist die
  `--token`-Prüfung eine Zeile darüber: Findet der Test `--token`, ist belegt, dass die Ausgabe
  überhaupt einen Registrierungsbefehl enthält — die Negativ-Aussage ist dann nicht mehr
  vakuos.
- `$output` enthält den Tag `bachelorprojekt-local` und `--run-untagged=false`.
- Zusätzlich das Fehlerverhalten: Aufruf **ohne** `--dry-run` und ohne Token endet mit
  `$status` ≠ 0, und `$output` nennt den Namen der fehlenden Variable.

> Achtung bei der Zusicherung gegen `$output`: Niemals unqualifiziert
> `[[ "$output" == *"<begriff>"* ]]` über die volle Ausgabe prüfen, wenn das Skript `$0` in
> seinem Usage-Text ausgibt — der Verzeichnisname des Worktrees (hier
> `gitlab-ci-migration-stage1`) kann den Treffer erzeugen, obwohl das geprüfte Merkmal fehlt.
> Auf die relevante Ausgabezeile eingrenzen. Genau diese Falle ist im Repo dokumentiert und
> wäre bei einem Worktree dieses Namens besonders leicht auszulösen.

## Aufgabe 4: `gitlab-mirror-workflow.bats`

- **Positiv-Anker:** `.github/workflows/mirror-to-gitlab.yml` existiert und ist nicht leer.
- Trigger enthält `push` auf `main`.
- Der Workflow führt einen Mirror-Push aus (`push` mit `--mirror`).
- `fetch-depth: 0` ist gesetzt — ein flacher Klon lässt `--mirror` scheitern.
- Beide Secrets (`GITLAB_MIRROR_TOKEN`, `GITLAB_MIRROR_URL`) werden referenziert, und es gibt
  einen Schritt, der ihr Fehlen abfängt.

## Aufgabe 5: `gitlab-parallel-non-blocking.bats`

Sichert die Zusicherung „GitHub bleibt SSOT" gegen spätere Unachtsamkeit ab.

- **Positiv-Anker:** `.github/workflows/ci.yml` existiert und enthält weiterhin die Kern-Jobs
  `test-bats`, `test-manifests` und `security-scan`.
- Keiner dieser drei Jobs ist entfernt oder durch eine neue Bedingung dauerhaft
  kurzgeschlossen.
- `.gitlab-ci.yml` trägt an keinem Job `allow_failure: true` — der Spiegel soll Fehlschläge
  zeigen; dass er nicht blockiert, ergibt sich aus der fehlenden Required-Check-Eintragung,
  nicht aus weich gestellten Jobs.

## Aufgabe 6: GREEN-Lauf und Inventar

Nach p1–p3 müssen alle fünf Guards grün sein:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/gitlab-*.bats
# expected: PASS
```

Anschließend das Testinventar regenerieren — fünf neue `.bats`-Dateien verändern
`components/website/src/data/test-inventory.json`, und der CI-Check vergleicht die committete
Fassung gegen die neu erzeugte:

```bash
task freshness:regenerate
```

Beide Prüfformen lokal erfassen (T002696): Es existieren im Repo sowohl die Sammeldatei
`tests/spec/ci-cd.bats` als auch das Verzeichnis `tests/spec/ci-cd/`. Eine Suche nach nur einer
der beiden Formen findet die Hälfte:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd*
```
