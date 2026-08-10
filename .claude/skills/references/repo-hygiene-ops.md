# Repo-Hygiene-Mechanik (SSOT)

Die operative Housekeeping-Mechanik — geteilt von `repo-hygiene` und `ticket-ops` (Phase 4).
Beide Skills verlinken hierher; Änderungen NUR in dieser Datei.

DB-Zugriff (MCP-first, `psql()`-Fallback, `ticket_plans`-Warnung): siehe
[`mcp-tool-guide.md`](mcp-tool-guide.md).

## 0. Arbeitsbaum & Stashes

Vor jeder Worktree- oder Branch-Aufräumaktion den Arbeitsbaum des Hauptcheckouts und die
Stashes ansehen — sie sind die Quelle von Arbeit, die nirgendwo sonst auftaucht.

1. **Befund im Hauptcheckout.** `git status --porcelain` im Hauptcheckout — nicht leer ist ein
   Befund, kein Rauschen. Pro Änderung entscheiden: gehört sie zu einem laufenden Ticket
   (→ in dessen Worktree ziehen), oder ist es ein funktionaler Patch ohne Ticket
   (→ Ticket anlegen und Worktree, **nicht** verwerfen)? Realer Auslöser: der ungetickte Patch
   an `scripts/bge-mcp/server.mjs` vom 2026-08-08.

2. **Stash-Inventar.** `git stash list` — ohne Datum ist das Alter nicht sichtbar. Die
   Relevanzprüfung aus Falle 2 ist nötig, weil ein Stash nichts über seinen eigenen Zustand
   erzählt.

3. **Falle 1 — pfadgefilterte Inspektion.** `git stash show -p "stash@{N}" -- <pfad>` scheitert:
   `stash show` nimmt genau eine Revision entgegen, die Pfadangabe wird als zweite gelesen
   („Too many revisions specified"). Brauchbar ist eine Zwei-Revisions-Diff-Form:

   ```bash
   git diff "stash@{N}^" "stash@{N}" -- <pfad>
   ```

   Bei Stashes mit ungetrackten Dateien (`git stash push -u`) zeigt diese Zwei-Revisions-Form
   die Untracked-Teilmenge nicht — ein leerer Diff ist dann kein Relevanzurteil.

4. **Falle 2 — Relevanz entscheiden.** Der Stash-Diff gegen den eigenen Basiscommit sieht
   **immer** ungemergt aus — er beantwortet die Frage „ist der Stash noch relevant?" nicht.
   Maßgeblich sind die konkreten Marker aus dem Stash-Diff, gesucht im heutigen `main`
   (vorher `git fetch origin main`, damit die remote-tracking Ref nicht veraltet ist):

   ```bash
   git grep -F <marker> origin/main -- <pfad>
   ```

   Beleg: die drei Stashes vom 2026-08-08 waren über Commit `0a2493ffd` längst in `main`
   angekommen, ihr eigener Diff zeigte das nicht.

5. **Fail-Closed-Regel.** Lässt sich ein Marker nicht bilden oder die Prüfung nicht abschließen
   (leere Antwort, Fehler): Stash **behalten**. Eine leere Antwort ist kein Urteil — Instanz
   der Grundregel, die §3 einleitend für alle Signale dieses Runbooks festhält.

## 1. Stale Git Worktrees

Pflicht-Vorcheck vor jedem Remove: **Arbeit muss gesichert sein.** Leerer Commit-Bereich allein reicht nicht — ein Worktree kann ungetrackte Änderungen enthalten, die kein `git log` anzeigt.

```bash
git worktree list

# Erster Vorcheck: unterbrochene git-Operationen. Ein Rebase, der nach der
# Konfliktlösung nicht --continued wurde, hinterlässt nur gestagete Änderungen
# und ist für den allowlist-gefilterten --porcelain-Vorcheck unsichtbar:
# die Konflikte entstehen fast ausschliesslich an Freshness-Generate unter
# website/src/data/ und docs/code-quality/ — genau den Pfaden, die die
# Generat-Allowlist entfernt. Der Guard meldet diesen Zustand, repariert aber
# nichts (ein Rebase in einem fremden Worktree fortzusetzen kann einen falschen
# Commit auf einem Branch erzeugen, den der Aufrufer nicht besitzt).
bash scripts/worktree-git-op-guard.sh

# Für jeden Worktree (außer main, außer aktuell gehaltener):
git -C <path> status --porcelain   # Abweichungen gegen die Allowlist unten prüfen
git worktree remove <path>
```

> **`git log main..<branch>` taugt hier nicht als Merge-Nachweis.** Dieses Repo mergt via
> squash-and-merge — der Branch-Tip ist danach kein Ancestor von `main`, und die Ausgabe listet
> sämtliche Commits des Branches, auch wenn ihr Inhalt längst in `main` liegt. Real beobachtet an
> `.worktrees/factory-worktree-reaper-T002896`: sieben scheinbar ungemergte Commits, während der
> zugehörige Squash-Commit `e78a30777` bereits in `main` stand. Maßgeblich ist der Blob-Vergleich
> pro Datei aus §2 („Three-dot-Diff-Falle").

### Generat-Abweichungen sind kein Befund

Die frühere Regel „`--porcelain` MUSS leer sein" misst zu grob, um allein zu entscheiden. Jeder
Worktree, in dem ein Plan gestaged oder archiviert wurde, trägt danach ein regeneriertes
`website/src/data/openspec-status.json` und ist damit dauerhaft dirty — ohne dass ein Byte eigener
Arbeit darin steht. Wörtlich genommen landet der Aufräumpfad deshalb im Normalfall im
`--force`-Zweig, und ein Schutz, der bei fast jedem legitimen Aufruf übersprungen werden muss,
macht `--force` zum Standardgriff. Danach fällt echte ungesicherte Arbeit im selben Zweig nicht
mehr auf — der Schutz schützt dann nichts mehr.

Es entscheidet also nicht die Leere der Ausgabe, sondern **welche Pfade** abweichen. Folgenlos
sind Plan-Artefakte und Generate, die auf `main` ohnehin fortgeschrieben werden:

```bash
# Nicht-allowlistete Abweichungen — nur diese blockieren den Remove.
git -C <path> status --porcelain | cut -c4- \
  | grep -Ev '^(openspec/changes/|docs/code-quality/|website/src/data/)' \
  | grep -Ev '^(\.release-please-manifest\.json|website/CHANGELOG\.md|website/package\.json)$'
```

Bleibt die Ausgabe leer, ist der Worktree im Sinne dieses Runbooks sauber. `--force` ist dann
keine Eskalation, sondern der belegte Normalfall — `git worktree remove` verweigert sonst allein
wegen der Generate. Kommt etwas zurück, ist das ein echter Befund: **kein Remove**, erst sichern.

> Die Musterliste ist eine Arbeitskopie, keine zweite Quelle: maßgeblich ist `ALLOWLIST=` in
> [`scripts/branch-reaper.sh`](../../../scripts/branch-reaper.sh), das für Branches dieselbe
> Unterscheidung trifft. Wächst sie dort, gehört der Ausdruck oben nachgezogen.

`--force` bleibt eine bewusste Eskalation, sobald der Vorcheck **nicht** sauber ist — etwa bei
`.locked` Worktrees oder wenn nicht-allowlistete Pfade abweichen und man sich trotzdem entscheidet.

## 2. Stale Branches

```bash
git branch --merged main | grep -v 'main' | xargs git branch -d   # gemergte lokale Branches
git fetch --prune                                                  # gone remote-tracking refs
```

> **`--merged` verfehlt squash-gemergte Branches.** Dieses Repo mergt via squash-and-merge
> (Dev-Regel 3) — der Branch-Tip ist danach KEIN Ancestor von `main`, `git branch -d` verweigert.
> Erkennung: Upstream ist **[gone]** (von `gh pr merge --delete-branch` gelöscht) + PR nachweislich
> gemergt → force-delete:
> ```bash
> git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads \
>   | awk '$2 == "[gone]" {print $1}' \
>   | while read -r b; do
>       # Exit-Code auswerten, NICHT die leere Ausgabe [T002523-M7]: "gh sagt kein
>       # gemergter PR" und "gh konnte nicht antworten" erzeugen beide eine leere
>       # Ausgabe. Der Fehlerfall saehe sonst aus wie ein gueltiger Messwert. Real
>       # beobachtet: mitten in einer Schleife ueber 13 Branches brach gh mit
>       # "error connecting to api.github.com" ab; der betroffene Branch galt als
>       # "kein PR", obwohl sein PR gemergt war.
>       if ! merged=$(gh pr list --head "$b" --state merged --json number -q '.[0].number' 2>&1); then
>         echo "SKIP $b — gh-Abfrage fehlgeschlagen: $(printf '%s' "$merged" | head -1)"
>         continue
>       fi
>       if [ -n "$merged" ]; then
>         git branch -D "$b"   # safe: PR #$merged merged, remote gone
>       else
>         echo "SKIP $b — upstream gone but no merged PR found; inspect manually"
>       fi
>     done
> ```
> Nur `-D` (force) funktioniert hier — git sieht die Squash-History nicht.
>
> **Remote-Löschungen bündeln [T002523-M8]:** Ab etwa einem Dutzend Branches ist die
> Schleifenform mit je einem `git push origin --delete <branch>` nicht mehr praktikabel —
> jeder Push ist eine eigene Netzrunde und triggert die lokalen pre-push-Hooks (u. a.
> `task quality:check`). Bei 20 Branches lief das real nach 12 Löschungen in ein
> Zwei-Minuten-Limit und hinterließ eine halb erledigte Aufgabe. Erst alle Kandidaten
> **prüfen**, dann in **einem** Aufruf löschen:
> ```bash
> git push origin $(for b in $KANDIDATEN; do echo ":$b"; done)
> ```
> Der Prüfteil bleibt pro Branch, nur der Schreibteil wird gebündelt.
>
> **Zeitzonen-Falle bei Nach-Merge-Commits [T002495-M1]:** `gh pr list --json mergedAt` liefert UTC (`Z`-Suffix), `git log --format='%cI'` lokale Offset-Zeit. Vor dem Vergleichen beide auf UTC normalisieren (`TZ=UTC git log -1 --format='%cd' --date=format-local:'%Y-%m-%dT%H:%M:%SZ'`), sonst meldet der Vergleich falsche Nach-Merge-Commits.
>
> **Three-dot-Diff-Falle (`origin/main...<branch>`) [T002495-M2]:** Three-dot zeigt den Diff seit dem Abzweigpunkt (`merge-base`), der sich beim Squash-Merge nicht verschiebt. Um echte ungemergte Änderungen zu prüfen, nur eigene Quelldateien gegen `origin/main` vergleichen:
> ```bash
> mb=$(git merge-base origin/main "$b")
> for f in $(git diff --name-only "$mb" "$b"); do
>   [ "$(git rev-parse "$b:$f")" = "$(git rev-parse "origin/main:$f")" ] || echo "ABWEICHEND: $f"
> done
> ```

### Verwaiste Remote-Branches (ohne PR) [T002520]

`--merged` und `[gone]` erfassen nur Branches, die selbst gemergt wurden. Plan- und
Factory-Branches laufen aber häufig über einen Sammel-PR nach `main` — auf ihrem eigenen Ref
findet nie ein Merge statt, also bleiben sie liegen (am 2026-08-01: 24 von 26 Remote-Branches
ohne jeden PR). Diese Fälle deckt `scripts/branch-reaper.sh` ab; im Post-Merge-Workflow läuft er
automatisch, manuell zum Nachsehen:

```bash
bash scripts/branch-reaper.sh --ticket T00XXXX --dry-run   # zeigt REAP-/KEEP-Zeilen mit Begründung
bash scripts/branch-reaper.sh --ticket T00XXXX             # löscht, nach Archiv-Tag-Push
```

Gelöscht wird nur, wenn kein offener PR existiert, das Ticket `done`/`archived` ist **und** jede
Blob-Abweichung zu `main` in der Allowlist des Skripts liegt (Plan- und Generat-Pfade). Beide
Signale sind nötig: „Blob-Diff leer" allein hätte 1 von 20 realen Leichen erfasst, „Ticket done"
allein hätte auch die einzige Kopie eines nie gemergten Deliverables gelöscht (T002431).

## 3. PR-Triage → verknüpftes Ticket schließen

### Grundregel: ein leeres Signal ist kein Urteil

Alle Fehldiagnosen, die dieser Abschnitt sammelt, sind Instanzen **einer** Fehlerklasse: ein
Signal meldet Gesundheit, ohne das Attestierte geprüft zu haben. Es entsteht immer gleich —
eine Abfrage liefert nichts zurück, und die auswertende Logik liest „nichts" als „nichts
Schlechtes". Deshalb gilt für jede Prüfung in diesem Abschnitt:

> **Eine leere Antwort muss von einer negativen unterscheidbar sein.** Erst prüfen, dass die
> Messung überhaupt stattgefunden hat (Antwort da? Aufruf erfolgreich?), dann auf das
> **positive** Signal prüfen — nie auf die Abwesenheit des negativen. Lässt sich das erste
> nicht belegen, ist das Ergebnis kein Messwert, sondern ein Fehler.

Belegte Fundstellen, jede mit ihrer Gegenprobe unten im Detail:

| Signal | Trügerisch leer, weil … | Gegenprobe |
|--------|-------------------------|------------|
| `mergedAt` [T002498-M5] | `gh` konnte nicht antworten | Rohantwort auf Nichtleere prüfen, dann Feld |
| `statusCheckRollup` / `gh pr checks` [T002821] | GitHub liefert leeres Rollup trotz existierender Runs | `gh run list --branch <b>` |
| leere Checkliste bei CONFLICTING PR [T002822] | Konflikt unterdrückt CI — Symptom identisch mit „noch nicht gestartet" | `mergeStateStatus` + lokaler Probe-Merge |
| Probe-Schleife mit `2>/dev/null` [T002847] | harter Fehler wurde zu stiller Leerzeile | stderr sichtbar lassen, Exit-Code getrennt messen |
| Title-Dedupe-Guard (§4) [T002844] | prüft nur Tickets, nicht den Mishap-Buffer | zweite Quelle abfragen |

```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,isDraft,mergeStateStatus
```

Pro PR zuerst das Ticket rekonstruieren (Soft-Link — Titel-Tag gewinnt, Branch-Name ist Fallback):

```bash
TITLE=$(gh pr view <number> --json title -q '.title')
BRANCH=$(gh pr view <number> --json headRefName -q '.headRefName')
TICKET_ID=$(printf '%s %s' "$TITLE" "$BRANCH" | grep -oiE 'T[0-9]{6}' | head -1 | tr a-z A-Z)
```

* **Merge (mergeable, CI grün, kein Draft):**
  ```bash
  gh pr merge <number> --squash --delete-branch
  ```
  > **Exit 1 nach Squash-Merge ist KEIN Fehler** (`not possible to fast-forward` — der PR ist
  > trotzdem gemergt). **Immer per Timestamp verifizieren, nie per Exit-Code:**
  > ```bash
  > m=$(gh pr view <number> --json mergedAt -q '.mergedAt')  # leer = offen; Timestamp = gemergt
  > [ -n "$m" ] || { echo "FAIL: mergedAt leer (gh API-Ausfall?)"; exit 1; }
  > # Offline-Anker als Alternative — Squash-Commit in origin/main via Ticket-Tag:
  > # SQUASH=$(git log origin/main --grep="<TICKET_ID>" --format='%cI' -1)
  > # [ -n "$SQUASH" ] || { echo "FAIL: kein Squash-Commit gefunden"; exit 1; }
  > ```
  > **Leere Antwort ist KEIN Urteil [T002498-M5]:** Der Timestamp-Verifikation fehlt der
  > Fall „Antwort fehlt ganz". Schlägt der vorangegangene `gh`-Aufruf fehl (z.B.
  > `error connecting to api.github.com`), ist `$m` LEER — und „leer = offen" würde einen
  > Merge-Watch fälschlich als „kein Wissen" statt als Fehler behandeln. Eine Watch-Schleife
  > der Form `grep -q '^merged=nein' || { echo GEMERGT; break; }` wertet dieselbe leere Antwort
  > als Erfolg (beobachtet bei PR #3563: open + DIRTY, gemeldet als gemergt). Gemeinsamer
  > Nenner aller drei Fälle (0 Checks, leeres Log, leere Antwort): **die auswertende Logik muss
  > eine LEERE Antwort von einer NEGATIVEN unterscheiden.** Korrektes Muster — erst die leere
  > Antwort abfangen und explizit NICHT urteilen, dann auf das positive Signal prüfen, nie auf
  > die Abwesenheit des negativen:
  > ```bash
  > raw=$(gh pr view <number> --json mergedAt 2>/dev/null)
  > [ -n "$raw" ] || { echo "API-Fehler — KEIN Urteil, erneut versuchen"; exit 1; }
  > m=$(printf '%s' "$raw" | jq -r '.mergedAt')
  > [ -n "$m" ] && [ "$m" != "null" ] || { echo "FAIL: mergedAt leer"; exit 1; }
  > ```
  Bei noch laufendem CI stattdessen `--auto` — GitHub mergt, sobald die Checks grün sind.

* **Ticket schließen, sobald `mergedAt` gesetzt ist** (nur wenn `$TICKET_ID` gefunden;
  `resolution`: `fixed` für `fix/*`, `shipped` für `feature/*`) — **MCP-first** (`ticket-mcp`;
  die Wrapper schreiben via `ticket.sh`, nicht über das read-only `mcp-postgres`):
  > `mcp__ticket-mcp__transition_status({ id: "$TICKET_ID", status: "done", resolution: "<fixed|shipped>" })`
  > `mcp__ticket-mcp__add_comment({ id: "$TICKET_ID", body: "PR #<number> merged." })`

  Fallback (ticket-mcp nicht erreichbar — direkte Writes über `psql()`):
  ```bash
  psql -c \
    "UPDATE tickets.tickets SET status='done', resolution='fixed', done_at=now()
     WHERE external_id='$TICKET_ID' AND status <> 'done';
     INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
     SELECT id, 'claude-code', 'PR #<number> merged.', 'internal'
     FROM tickets.tickets WHERE external_id='$TICKET_ID';"
  ```
  Kein `T000XXX` rekonstruierbar → PR ist unverknüpft: notieren, kein Ticket anfassen.

* **CI-Failures:** `gh pr checks <number>` diagnostizieren. Rote PRs nie mergen. Bekannter Flake →
  re-run; sonst PR offen lassen und (falls Ticket vorhanden) auf `in_progress` belassen.

  > **„no checks reported" ist kein CI-Zustand [T002821]:** `gh pr checks <n>` antwortete an
  > PR #3916 mit „no checks reported on the branch", `gh pr view --json statusCheckRollup`
  > lieferte ein **leeres Array** — während `gh run list --branch <b>` fünf abgeschlossene
  > Runs zeigte, darunter einen CI-Run mit `conclusion=failure`. Der PR-HEAD war identisch mit
  > dem Remote-Branch-Tip, es lag also kein nachträglicher Push vor. Die Meldung liest sich als
  > „Workflows noch nicht gestartet" und lenkt auf die Actions-Infrastruktur, obwohl der PR
  > schlicht an zwei BATS-Tests scheiterte. Bei leerem Rollup deshalb **immer** gegenprüfen:
  > ```bash
  > gh run list --branch "$BRANCH" --limit 10 \
  >   --json databaseId,name,headSha,status,conclusion
  > ```
  > und die Runs auf den PR-HEAD (`gh pr view <n> --json headRefOid`) filtern.

  > **Leere Checkliste kann auch Konflikt heißen [T002822]:** An PR #3915 existierten **null**
  > Workflow-Runs, weil der PR mit `main` konfligierte — dass ein CONFLICTING PR die CI
  > unterdrückt, steht in
  > [`gotchas-footguns.md`](../../../docs/superpowers/references/gotchas-footguns.md), sein
  > **Symptom** war bisher nirgends notiert: `gh pr checks` liefert exakt dieselbe Meldung wie
  > bei einem nicht gestarteten Lauf, und `mergeStateStatus` stand auf `UNKNOWN`. Reihenfolge
  > bei leerer Checkliste deshalb: erst `mergeStateStatus` lesen, und bei `UNKNOWN` oder
  > `DIRTY` lokal probe-mergen — das trennt „Konflikt" von „noch nicht gestartet" eindeutig:
  > ```bash
  > gh pr view <n> --json mergeStateStatus -q '.mergeStateStatus'
  > git fetch origin main
  > git merge origin/main --no-commit --no-ff   # danach: git merge --abort
  > git diff --name-only --diff-filter=U        # nicht leer = echter Konflikt
  > ```
  > `UNKNOWN` bedeutet dabei nur, dass GitHub die Mergebarkeit noch nicht berechnet hat — auch
  > das ist eine fehlende Messung, kein Befund.

### PR-Branch auf `main` nachziehen

Nötig bei `mergeStateStatus=BEHIND` und bei den Phantom-Konflikten aus `merge=ours`
(generierte Artefakte melden auf GitHub `DIRTY`, obwohl der Merge lokal sauber läuft —
GitHub führt keine Custom-Merge-Driver aus; Details in
[`gotchas-footguns.md`](../../../docs/superpowers/references/gotchas-footguns.md#mergeours-erzeugt-github-only-phantom-konflikte)).

> **Erst den Fall bestimmen — die beiden Fälle haben verschiedene Wege [T002823]:**
> Bei **`BEHIND`** ist `update-branch` (Schritt 1/2) der Weg. Bei einem
> **`merge=ours`-Phantomkonflikt** ist er es **nicht**: er scheitert an genau demselben
> Phantomkonflikt. Real beobachtet an PR #3915: `mergeStateStatus=DIRTY`,
> `gh api --method PUT …/update-branch` antwortete **HTTP 422 „merge conflict between base and
> head"** — während lokal `git merge origin/main` glatt durchlief und
> `git diff --name-only --diff-filter=U` **leer** blieb. Ursache sind die Freshness-Generate
> (`website/src/data/openspec-status.json`, `test-inventory.json`), die in `.gitattributes`
> einen Custom-Merge-Driver tragen, den GitHub nicht ausführt.
>
> Unterscheiden mit dem lokalen Probe-Merge aus §3 („Leere Checkliste kann auch Konflikt
> heißen"): bleibt `--diff-filter=U` leer, ist es der Phantomkonflikt. Dann ist der **lokale
> Merge der einzige Weg** — Schritt 1/2 überspringen und direkt so vorgehen:
> ```bash
> git fetch origin main && git merge origin/main    # läuft lokal konfliktfrei durch
> task freshness:regenerate                          # Generate gegen den neuen Stand neu bauen
> git add -- website/src/data/openspec-status.json website/src/data/test-inventory.json
> git commit --amend --no-edit || git commit -m "chore: regenerate freshness artifacts"
> git push origin HEAD                               # Merge-Commit pushen — danach ist der PR sauber
> ```

1. **Wenn die `gh`-Version es kann** (nur bei `BEHIND`):
   ```bash
   gh pr update-branch <number>
   ```
   > **Nicht jede installierte `gh` kennt das Subkommando** — 2.45.0 (Ubuntu-Paket, Stand
   > 2026-07-27) tut es **nicht** und antwortet stattdessen mit der generischen `gh pr`-Hilfe.
   > Das ist leicht zu übersehen: der Aufruf endet mit Exit 0, ohne irgendetwas zu tun.
   > Prüfen mit `gh pr update-branch --help | head -1` — kommt „Work with GitHub pull
   > requests." statt einer `update-branch`-Beschreibung, ist es nicht vorhanden.

2. **REST-Fallback (funktioniert mit jeder `gh`-Version):**
   ```bash
   OWNER_REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
   HEAD_SHA=$(gh pr view <number> --json headRefOid -q '.headRefOid')
   gh api --method PUT "repos/$OWNER_REPO/pulls/<number>/update-branch" \
     -f expected_head_sha="$HEAD_SHA"
   ```
   `expected_head_sha` ist der Schutz gegen ein Rennen: hat jemand zwischenzeitlich auf den
   Branch gepusht, schlägt der Aufruf mit 422 fehl, statt fremde Arbeit zu überschreiben.
   Den SHA deshalb per `gh pr view` frisch holen und **nicht** aus einem lokalen
   `git rev-parse HEAD` nehmen — lokal kann der Branch veraltet sein.

   > **422 ist nicht immer das Rennen [T002823]:** Lautet der Fehlertext „merge conflict
   > between base and head" (statt eines SHA-Mismatch), ist es der Phantomkonflikt von oben,
   > und ein Retry hilft nie — auf den lokalen Merge wechseln.

3. Danach die generierten Artefakte gegen den neuen Stand neu bauen und committen:
   ```bash
   git fetch origin <branch> && git reset --hard origin/<branch>
   task freshness:regenerate
   ```
   [T002347]

### Probe-Schleifen: stderr nicht unterdrücken [T002847]

Dieselbe Fehlerklasse trifft nicht nur GitHub-Antworten, sondern jede Schleife, die einen
Zustand über mehrere IDs abfragt. Real beobachtet beim Abfragen von acht Ticketstatus:

```bash
# FALSCH — acht leere Zeilen, gelesen als "Tickets existieren nicht"
for t in T00…; do
  s=$(bash scripts/ticket.sh show "$t" 2>/dev/null | grep -iE '^(status|title)')
  echo "$t: $s"
done
```

Tatsächlich kennt `ticket.sh` **kein** Subkommando `show`; es schrieb „Unknown command: show"
nach stderr und beendete mit Exit 1 — beides durch `2>/dev/null` und die Pipe unsichtbar. Der
Fehlerfall war von acht leeren Messwerten nicht zu unterscheiden.

Auch die naheliegende Gegenprobe misst das Falsche:

```bash
bash scripts/ticket.sh show T00… 2>&1 | head -5; echo "exit=$?"   # FALSCH: Exit von head
```

Regeln:

1. In Probe-Schleifen stderr **nicht** unterdrücken.
2. Den Exit-Code **getrennt von der Pipeline** auswerten (Aufruf zuerst in eine Variable oder
   Datei, `$?` direkt danach; alternativ `set -o pipefail` bzw. `${PIPESTATUS[0]}`).
3. Ein leeres Ergebnis ist erst dann ein Messwert, wenn der Aufruf **nachweislich erfolgreich**
   war — sonst gilt die Fail-Closed-Regel aus §0 Punkt 5: kein Urteil.

```bash
for t in T00…; do
  if ! out=$(bash scripts/ticket.sh <subkommando> "$t" 2>&1); then
    echo "$t: FEHLER — $(printf '%s' "$out" | head -1)"; continue
  fi
  echo "$t: $(printf '%s' "$out" | grep -iE '^(status|title)')"
done
```

Für Ticketstatus ist der kanonische Weg ohnehin `mcp__ticket-mcp__get_ticket` /
`mcp__ticket-mcp__list_tickets`, nicht ein geratenes CLI-Subkommando (siehe
[`mcp-tool-guide.md`](mcp-tool-guide.md)).

## 4. GitHub-Issue-Intake (selten)

Issues leben in Postgres, nicht auf GitHub. Falls `gh issue list --state open` etwas liefert:

1. **Title-Dedupe-Guard [T001210]:** Vor dem Anlegen nach einem offenen Ticket mit gleichem
   (case-insensitivem, whitespace-normalisiertem) Titel suchen. Existiert eines (z. B. kanonische
   Referenz T001147, Mishap-Bundle T001148): KEIN Duplikat anlegen — `ticket_comments`-Zeile mit
   der Re-Trigger-Quelle ans bestehende Ticket, dann
   `gh issue close <n> --comment "Duplicate of <external_id>."`. (Die 4 Duplikate
   T001196/T001197/T001201/T001202 entstanden 2026-06-27 genau, weil dieser Guard fehlte.)
   Dieselbe Dedupe-Vorbedingung gilt bei der Completeness-Triage vor Auto-Intake-Zeilen.

   > **Der Guard braucht eine zweite Quelle: den Mishap-Buffer [T002844].** Die Ticket-Suche
   > allein ist dieselbe Signallücke wie in §3 — sie meldet „kein Duplikat", ohne alle Orte
   > geprüft zu haben, an denen ein Befund liegen kann. Am 2026-08-09 wurde derselbe Befund
   > zweimal erfasst: 05:04 UTC als Mishap-Buffer-Eintrag, 05:35 UTC als Ticket T002830. Der
   > Guard war korrekt angewandt und lieferte trotzdem grün, weil der frühere Befund als
   > Eintrag in `.git/mishap-buffer.json` lag (Buffer-Stand 5/10) — **Buffer-Einträge tauchen
   > in keiner Ticket-Query auf**. Zwischen „Befund erfasst" und „Befund als Ticket sichtbar"
   > liegt ein Fenster von bis zu 10 Buffer-Einträgen bzw. 7 Tagen.
   >
   > Vor dem Anlegen deshalb **beide** Quellen prüfen:
   > ```
   > mcp__ticket-mcp__list_tickets({ … })      # offene Tickets, wie gehabt
   > mcp__ticket-mcp__get_mishap_buffer({})    # ungeflushte Befunde
   > ```
   > Fallback ohne MCP: `jq -r '.[].title' .git/mishap-buffer.json` (Datei fehlt = Buffer leer;
   > ein Lesefehler ist **kein** „leer" — dann gilt Fail-Closed, siehe §3-Grundregel).
   >
   > Das bleibt vorerst eine Merkregel, ist aber ein Kandidat fürs Werkzeug: eine Regel, die
   > zwei getrennte Quellen von Hand zusammenführt, ist genau die Form, die hier versagt hat.
   > Der belastbare Zuschnitt wäre ein Dedupe, das beide Quellen in **einem** Aufruf abfragt.
2. `tickets.tickets`-Zeile aus dem Issue anlegen (`type`, `brand`, `title`, `description`, `status='triage'`).
3. `gh issue close <n> --comment "Tracked internally as <external_id>."`

## 5. Software-Factory-Queue

MCP-first via `factory-mcp` (Health-Guard, Tools, Fallbacks): siehe
[`mcp-tool-guide.md`](mcp-tool-guide.md) §factory-mcp.
