# p2 — Branch- und Delete-Spiegelung

**target_files:** `.github/workflows/mirror-to-gitlab.yml`

## Warum

Der Workflow pusht heute ausschliesslich `HEAD:refs/heads/main`. Damit sieht GitLab jeden
Stand erst, nachdem die Merge-Entscheidung gefallen ist. Eine Pipeline, die nur `main` kennt,
kann eine Merge-Entscheidung nicht informieren — das ist die Lueckenklasse, nicht ein
Einstellungsdetail.

## Aufgaben

- [ ] Trigger erweitern: `push.branches` um `feature/**`, `fix/**`, `chore/**` ergaenzen.
      Bot-Branches (`renovate/**`, `release-please--**`) und Factory-Batch-Branches bleiben
      draussen — jeder gespiegelte Branch erzeugt eine volle Pipeline auf einem Runner, der
      laut Etappe-2-Messung schon der Engpass ist.

- [ ] Zusaetzlichen Trigger fuer Branch-Loeschung. In GitHub-Actions ist das dasselbe
      `push`-Event mit `github.event.deleted == true`; der Job unterscheidet die beiden Faelle
      im Step, nicht durch einen zweiten Workflow.

- [ ] Push-Logik nach Fall verzweigen. Der `main`-Pfad bleibt **unveraendert** (er ist in
      Betrieb und in `openspec/specs/ci-cd.md` zugesichert):

  ```bash
  branch="${GITHUB_REF_NAME}"
  if [ "${DELETED}" = "true" ]; then
    # Leerer Quell-Ref = Loeschung auf der Gegenseite. Kein --force noetig,
    # und bewusst kein --mirror: das wuerde zusaetzlich fremde Refs anfassen.
    git push gitlab-mirror ":refs/heads/${branch}"
  elif [ "$branch" = "main" ]; then
    git push --force gitlab-mirror HEAD:refs/heads/main
    git push --force --tags gitlab-mirror
  else
    git push --force gitlab-mirror "HEAD:refs/heads/${branch}"
  fi
  ```

- [ ] `concurrency.group` anpassen. Er lautet heute `mirror-to-gitlab` fuer alle Laeufe — mit
      Branch-Spiegelung wuerde ein Push auf einen Feature-Branch den `main`-Spiegel-Lauf
      abwarten oder verdraengen. Der Gruppenname bekommt den Ref angehaengt, damit sich nur
      Laeufe desselben Branches serialisieren. `cancel-in-progress` bleibt `false`: ein
      abgebrochener Mirror-Lauf hinterlaesst auf GitLab einen aelteren Stand als auf GitHub,
      ohne dass irgendetwas rot wird.

- [ ] Token-Guard unveraendert lassen. Der Step „Verify mirror secrets are configured" bricht
      bei fehlendem Secret sichtbar ab; diese Zusicherung steht im Spec und ist von der
      Branch-Erweiterung nicht betroffen.

- [ ] Der Kopfkommentar der Datei begruendet heute ausdruecklich, dass **kein**
      `pull_request`-Trigger existiert und PR-Staende nicht in den Spiegel gehoeren. Diese
      Begruendung ist mit dieser Etappe ueberholt und wird ersetzt — nicht danebengeschrieben.
      Der neue Text nennt den Grund fuer die Aenderung (Vor-Merge-Verifikation) und behaelt
      die weiterhin gueltige Begruendung gegen `git push --mirror`.

## Abnahme

```bash
python3 -c "import yaml; w=yaml.safe_load(open('.github/workflows/mirror-to-gitlab.yml')); \
  b=w[True]['push']['branches']; print('Trigger:', b); \
  assert 'main' in b and any('feature' in x for x in b), b"

# Der Mirror darf weiterhin kein --mirror verwenden — die Zusicherung aus Etappe 1
grep -c -- '--mirror' .github/workflows/mirror-to-gitlab.yml   # erwartet: 0 Treffer im Befehl
```

Der zweite Befehl braucht Vorsicht bei der Auswertung: `--mirror` kommt im **Kommentartext**
der Datei vor (die Begruendung, warum es nicht verwendet wird). Die Pruefung gehoert deshalb
in den BATS-Guard aus p5, der Kommentarzeilen ausschliesst, statt in ein `grep -c` hier.
