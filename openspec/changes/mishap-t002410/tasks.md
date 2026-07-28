---
title: "mishap-t002410 — Implementation Plan"
ticket_id: T002410
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002410 — Implementation Plan

_Ticket: T002410_

Mishap-Bundle: skills/ticket-ops, infra/mcp-postgres, process/repo-hygiene (3 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

### Mishap 1: ticket-ops nennt keinen CLI-Weg fuer Kommentare — 'ticket.sh comment' existiert nicht, der Subcommand heisst add-comment
**Typ:** process | **Komponente:** skills/ticket-ops

`.claude/skills/references/ticket-ops-procedures.md` Step 2.5 nennt als Schreibwege fuer Kommentare nur zwei: den MCP-Wrapper `mcp__ticket-mcp__add_comment` und einen direkten `INSERT INTO tickets.ticket_comments` per psql. Der CLI-Weg fehlt.

Der naheliegende Versuch `bash scripts/ticket.sh comment --id <id> --body <text>` scheitert mit "Unknown command: comment". Der korrekte Subcommand heisst `add-comment` und steht nur in der Usage-Zeile `scripts/ticket.sh:944`.

Konkreter Ablauf am 2026-07-28: eine Bash-Schleife ueber zehn Tickets scheiterte zehnmal hintereinander mit derselben Meldung, bevor auf den MCP-Wrapper umgeschwenkt wurde. Kosten gering (die Schleife war idempotent und schrieb nichts), aber vermeidbar.

Fix-Richtung: in Step 2.5 den CLI-Weg `bash scripts/ticket.sh add-comment --id <id> --body <text>` explizit als dritten Weg nennen. Der psql-INSERT-Block sollte dabei nachrangig werden — er ist der einzige der drei Wege, der die Autor-Zuordnung von Hand setzen muss und dabei falsch gesetzt werden kann.

---

### Mishap 2: mcp-postgres war in der Session nicht registriert, obwohl ticket-ops es als Primaerweg fuer Reads vorschreibt
**Typ:** degraded | **Komponente:** infra/mcp-postgres

`.claude/skills/ticket-ops/SKILL.md` §DB-Zugriff schreibt vor: "Reads MCP-first via `mcp__mcp-postgres__query` (read-only)". In der Claude-Code-Session vom 2026-07-28 war dieses Tool nicht als deferred Tool registriert — `ToolSearch({query: "select:mcp__mcp-postgres__query"})` lieferte "No matching deferred tools found". Die `mcp__ticket-mcp__*`-Tools waren im selben Lauf verfuegbar, der Ausfall betrifft also nur mcp-postgres.

Kein Schaden: der `psql()`-Fallback ueber `kubectl exec` gegen den shared-db-Pod auf fleet funktionierte fuer alle Reads einwandfrei (inkl. der Enriched-Fetch-Query ueber 40 Tickets und der ticket_links-Abfrage). Kosten: ein Umweg und eine zusaetzliche Suchrunde.

Offen und nicht geklaert: ob mcp-postgres in dieser Session gar nicht lief oder nur nicht in die Tool-Registry kam. Relevant, weil der Skill den MCP-Weg als Primaerweg fuehrt — ein Agent, der den psql()-Fallback nicht kennt oder ihn fuer optional haelt, bleibt hier stehen. Der Fallback ist im MCP-Tool-Guide §mcp-postgres dokumentiert, aber ticket-ops verweist nur darauf, statt ihn als gleichrangig zu fuehren.

Pruefweg beim naechsten Auftreten: `task mcp:check` (prueft Drift zwischen `docs/agent-guide/registry/mcp.yaml` und den generierten Harness-Configs) und ob der Server auf localhost:13001 ueberhaupt lauscht.

---

### Mishap 3: Hauptcheckout stand waehrend der Session auf zwei verschiedenen Feature-Branches mit unstaged Aenderungen
**Typ:** suspicious | **Komponente:** process/repo-hygiene

`/home/patrick/Bachelorprojekt` — der Hauptcheckout — stand zu Sessionbeginn am 2026-07-28 auf `feature/mishap-incident-rollup-T002407` mit drei unstaged Dateien (`scripts/vda/ticket/update-status.sh`, `tests/spec/ticket-system.bats`, `website/src/lib/tickets/transition.ts`) und im weiteren Verlauf derselben Session auf `chore/mishap-T002382`. Es arbeitet also eine zweite Session mutierend im Hauptcheckout, waehrend daneben 24 Worktrees offen sind.

Zwei Gruende, warum das mehr ist als Unordnung:

1. `CLAUDE.local.md` verbietet es ausdruecklich ("Mutierende Tasks nie im ~/Bachelorprojekt/-Hauptcheckout ausfuehren"). Der dokumentierte Praezedenzfall ist T001880 — rund 26 unkommitierte OpenSpec-Archivierungen sammelten sich unbemerkt auf main an.

2. Die Software Factory dispatcht aus genau diesem Verzeichnis. Solange der Hauptcheckout nicht auf `main` steht und nicht gepullt ist, laufen gemergte Factory-Fixes dort nicht — eine lokale Messung von `queue.sh` misst dann den Feature-Branch, nicht main.

`scripts/worktree-create.sh` erkennt den Zustand korrekt und meldet ihn ("WARNUNG — Quell-Checkout steht auf Branch 'chore/mishap-T002382', dieser Worktree auf ..."). Der Guard funktioniert, aber er warnt nur und blockiert nicht — und die Warnung erscheint an einer Stelle, an der der Verursacher gar nicht mehr liest.

Nebenbefund aus demselben Lauf, ebenfalls repo-hygiene: fuenf stale agent-locks (T002279, T002352, T002365, T002369, T002405) und 24 offene Worktrees. `agent-lock.sh reap` raeumt tote Locks nicht, solange der zugehoerige Worktree noch steht.

Fix-Richtung offen: entweder der Guard blockiert statt zu warnen, oder ein periodischer Check meldet einen Hauptcheckout, der laenger als N Stunden nicht auf main steht.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
