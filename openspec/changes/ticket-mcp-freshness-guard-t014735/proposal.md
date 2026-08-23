# Proposal: ticket-mcp-freshness-guard-t014735

## Why

T014465 zeigte die Stillstandslage: Das manuell installierte
`/usr/local/bin/ticket-mcp-go` hing 8 Tage hinter dem Repo her (Build 15.08., Fix
23.08.), während der Mishap-Flush fail-closed lief — **ohne dass ein Guard den Zustand
anzeigte**. Der Task `ticket-mcp:build` ist bewusst Best-effort („ist /usr/local/bin
nicht schreibbar, bleibt das bereits installierte Binary in Kraft", Taskfile.yml:5369) —
genau diese Fall-back-Situation ist heute unsichtbar.

## What

1. **Version einbetten:** `make build` kompiliert mit
   `-ldflags "-X main.buildSHA=$(git rev-parse --short HEAD)"`; das Binary bekommt ein
   `--version`-Flag, das den Sha ausgibt (`ticket-mcp-go --version`).
2. **Guard-Task:** Neuer Task `ticket-mcp:freshness` vergleicht den eingebetteten Sha
   des installierten Binaries gegen den letzten Commit, der `scripts/ticket-mcp/go`
   berührt (`git log -1 --format=%h -- scripts/ticket-mcp/go`).
   - Binary fehlt → Skip mit Notiz (CI-Sicherheit: Runner installieren das Binary nicht)
   - Sha ohne eingebettete Version (Alter Build) → als stale melden, Exit 1
   - Sha ≠ HEAD-Sha des Go-Baums → Warnung + Exit 1
   - Gleich → grün
3. **Verkettung:** `freshness:check` ruft den Guard am Ende auf; dort ist er
   warn-only-notierend, damit der CI-Gate-Charakter von freshness:check nicht von der
   lokalen Binär-Lage abhängt. Der harte Fail lebt im eigenen Task.

_Non-Goal:_ Kein Auto-Update/Reinstall aus dem Guard — Reinstall bleibt manueller
`task ticket-mcp:build` (der Guard macht nur sichtbar, nicht kaputt).

_Ticket: T014735_
