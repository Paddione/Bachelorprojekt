# Repo-Hygiene-Mechanik (SSOT)

Die operative Housekeeping-Mechanik — geteilt von `repo-hygiene` und `ticket-ops` (Phase 4).
Beide Skills verlinken hierher; Änderungen NUR in dieser Datei.

DB-Zugriff (MCP-first, `psql()`-Fallback, `ticket_plans`-Warnung): siehe
[`mcp-tool-guide.md`](mcp-tool-guide.md).

## 1. Stale Git Worktrees

```bash
git worktree list
git log main..<branch> --oneline   # leer = vollständig gemergt
git worktree remove <path> --force
```

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
>       merged=$(gh pr list --head "$b" --state merged --json number -q '.[0].number')
>       if [ -n "$merged" ]; then
>         git branch -D "$b"   # safe: PR #$merged merged, remote gone
>       else
>         echo "SKIP $b — upstream gone but no merged PR found; inspect manually"
>       fi
>     done
> ```
> Nur `-D` (force) funktioniert hier — git sieht die Squash-History nicht.

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
  > gh pr view <number> --json mergedAt -q '.mergedAt'   # leer = offen; Timestamp = gemergt
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
