# Repo-Hygiene-Mechanik (SSOT)

Die operative Housekeeping-Mechanik — geteilt von `repo-hygiene` und `ticket-ops` (Phase 4).
Beide Skills verlinken hierher; Änderungen NUR in dieser Datei.

DB-Zugriff (MCP-first, `psql()`-Fallback, `ticket_plans`-Warnung): siehe
[`mcp-tool-guide.md`](mcp-tool-guide.md).

## 1. Stale Git Worktrees

Pflicht-Vorcheck vor jedem Remove: **Arbeit muss gesichert sein.** Leerer Commit-Bereich allein reicht nicht — ein Worktree kann ungetrackte Änderungen enthalten, die kein `git log` anzeigt.

```bash
git worktree list
# Für jeden Worktree (außer main, außer aktuell gehaltener):
git status --porcelain   # MUSS leer sein — sonst kein Remove
git log main..<branch> --oneline   # Info: leer = Branch vollständig gemergt
git worktree remove <path>          # ohne --force (Schutz bei ungetrackten Dateien)
```

`--force` nur als bewusste Eskalation verwenden, wenn der Vorcheck sauber ist und
`git worktree remove` trotzdem verweigert (z.B. bei.locked Worktrees).

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

### PR-Branch auf `main` nachziehen

Nötig bei `mergeStateStatus=BEHIND` und bei den Phantom-Konflikten aus `merge=ours`
(generierte Artefakte melden auf GitHub `DIRTY`, obwohl der Merge lokal sauber läuft —
GitHub führt keine Custom-Merge-Driver aus; Details in
[`gotchas-footguns.md`](../../../docs/superpowers/references/gotchas-footguns.md#mergeours-erzeugt-github-only-phantom-konflikte)).

1. **Wenn die `gh`-Version es kann:**
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

3. Danach die generierten Artefakte gegen den neuen Stand neu bauen und committen:
   ```bash
   git fetch origin <branch> && git reset --hard origin/<branch>
   task freshness:regenerate
   ```
   [T002347]

## 4. GitHub-Issue-Intake (selten)

Issues leben in Postgres, nicht auf GitHub. Falls `gh issue list --state open` etwas liefert:

1. **Title-Dedupe-Guard [T001210]:** Vor dem Anlegen nach einem offenen Ticket mit gleichem
   (case-insensitivem, whitespace-normalisiertem) Titel suchen. Existiert eines (z. B. kanonische
   Referenz T001147, Mishap-Bundle T001148): KEIN Duplikat anlegen — `ticket_comments`-Zeile mit
   der Re-Trigger-Quelle ans bestehende Ticket, dann
   `gh issue close <n> --comment "Duplicate of <external_id>."`. (Die 4 Duplikate
   T001196/T001197/T001201/T001202 entstanden 2026-06-27 genau, weil dieser Guard fehlte.)
   Dieselbe Dedupe-Vorbedingung gilt bei der Completeness-Triage vor Auto-Intake-Zeilen.
2. `tickets.tickets`-Zeile aus dem Issue anlegen (`type`, `brand`, `title`, `description`, `status='triage'`).
3. `gh issue close <n> --comment "Tracked internally as <external_id>."`

## 5. Software-Factory-Queue

MCP-first via `factory-mcp` (Health-Guard, Tools, Fallbacks): siehe
[`mcp-tool-guide.md`](mcp-tool-guide.md) §factory-mcp.
