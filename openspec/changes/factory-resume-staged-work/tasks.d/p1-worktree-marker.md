# p1 — Fremdbesitz an der Quelle melden

Rolle: `impl`. Keine Vorbedingung. Parallel zu p2 lauffähig.

`target_files`: `scripts/worktree-create.sh` (existiert, 263 Zeilen, S1-Limit `.sh` 500 → Reserve
237 Zeilen).

## Warum hier und nicht in `pipeline.js`

`git worktree add` scheitert bei einem bereits ausgecheckten Branch mit einer Meldung, deren
Wortlaut zwischen git-Versionen wechselt (`is already checked out at …` / `already used by
worktree at …`). Ein Regex darauf in `pipeline.js` wäre still brüchig: bei geändertem Wortlaut
fiele der Fall zurück in den generischen Fehlerpfad und das Ticket würde wieder auf `blocked`
gesetzt — genau das Verhalten, das dieser Change beseitigt.

Das Skript kennt den Zustand dagegen ohne Ratespiel: `git worktree list --porcelain` sagt direkt,
ob der Branch belegt ist. Diese Prüfung läuft **vor** dem `git worktree add`.

## Aufgaben

- [x] **P1.1 — Ist-Stand lesen.** Der bestehende Branch-Existenz-Check (`BRANCH_EXISTS`, ab Zeile
      86) und der `git worktree add`-Block (ab Zeile 99) sind die Umgebung, in die der neue Check
      gehört:

```bash
sed -n '60,110p' scripts/worktree-create.sh
```

- [x] **P1.2 — Belegung prüfen, bevor `git worktree add` läuft.** Nach der Auflösung von `$BRANCH`
      und vor dem Skelett-Schritt: ermitteln, ob `refs/heads/$BRANCH` bereits in einem Worktree
      ausgecheckt ist. `git worktree list --porcelain` liefert Blöcke aus `worktree <pfad>` und
      `branch refs/heads/<name>`; der Abgleich läuft über den vollqualifizierten Refnamen, nicht
      über den Kurznamen (sonst matcht `feature/x` auch auf `feature/x-y`).

- [x] **P1.3 — Markerzeile und Exit-Code.** Bei Belegung eine feste, maschinenlesbare Zeile nach
      stderr schreiben und mit einem eigenen Exit-Code enden. Der Marker enthält den Begriff
      `branch in use` sowie den belegenden Pfad, damit ein Mensch im Log sofort sieht, wer hält:

```
worktree-create: branch in use — feature/foo ist bereits ausgecheckt in <pfad>
```

      Der Exit-Code muss von `0` und von den generischen Fehlerpfaden unterscheidbar sein und ist
      im Skriptkopf zu dokumentieren. Er ist ab jetzt Teil des Kontrakts: p3 verzweigt darauf, p5
      prüft ihn.

- [x] **P1.4 — Der Rollback darf nicht greifen.** Der bestehende Rollback-Trap (ab Zeile 109)
      räumt einen halb angelegten Worktree ab und löscht den Branch, **falls das Skript ihn selbst
      angelegt hat** (`BRANCH_EXISTS` = 0). Der neue Pfad bricht ab, *bevor* irgendetwas angelegt
      wurde. Sicherstellen, dass der frühe Ausstieg weder den Trap auslöst noch einen fremden
      Branch anfasst — ein Löschen des Branches einer lebenden Fremdsession wäre der
      schlimmstmögliche Ausgang dieses Changes.

- [x] **P1.5 — Der Erfolgsfall bleibt wortgleich.** Die Erfolgszeile enthält weiterhin `ready on`.
      `pipeline.js:76` prüft genau auf diese Zeichenkette (`/ready on/.test(s)`); jede Umformulierung
      bricht die Worktree-Erkennung der gesamten Factory:

```bash
grep -n 'ready on' scripts/worktree-create.sh scripts/factory/pipeline.js
```

- [x] **P1.6 — Manuell verifizieren.** Der Branch dieses Changes ist bereits ausgecheckt, also ist
      der Fall ohne Vorbereitung reproduzierbar:

```bash
bash scripts/worktree-create.sh feature/factory-resume-staged-work-T002327 /tmp/wt-dup-probe > /tmp/wt-dup.log 2>&1
echo "exit=$?"
cat /tmp/wt-dup.log
test ! -d /tmp/wt-dup-probe && echo "OK: kein Rest-Worktree angelegt"
rm -rf /tmp/wt-dup-probe /tmp/wt-dup.log
```

- [x] **P1.7 — Gegenprobe mit freiem Branch.** Ein nicht ausgecheckter Branch muss weiterhin
      normal durchlaufen. Danach aufräumen:

```bash
bash scripts/worktree-create.sh chore/p1-probe /tmp/wt-free-probe 2>&1 | tail -2
git worktree remove /tmp/wt-free-probe --force && git branch -D chore/p1-probe
```

## Abnahmekriterien

- Ein bereits anderswo ausgecheckter Branch führt zu der Markerzeile mit `branch in use`, dem
  belegenden Pfad und dem dedizierten Exit-Code.
- In diesem Fall wird kein Worktree-Verzeichnis angelegt und kein Branch gelöscht.
- Ein freier Branch verhält sich unverändert und meldet weiterhin `ready on`.
- Der neue Exit-Code ist im Skriptkopf bei der Usage dokumentiert.
