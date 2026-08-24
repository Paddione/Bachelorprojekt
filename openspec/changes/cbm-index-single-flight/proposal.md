# Proposal: cbm-index-single-flight

## Why

Am 2026-08-24 (15:10–15:45) brachten 8–10 parallele opencode-Sessions die
4-Kern-Box fast zum Erliegen (Load 54.5, avail RAM zeitweise 84 Mi): Jede
codebase-memory-mcp-Instanz löste bei Repo-Drift einen eigenen
`index_repository`-Volljob aus — bis zu 8 simultane Index-Worker (~23 % CPU,
~330 MB RSS) für denselben Repo-Pfad. Getötete Worker respawnen durch den
Parent; solange kein Einzeljob fertig wird, bleibt jeder Store stale und
triggert neu — eine Verhungerschleife. Folge-Schäden: `task
freshness:regenerate/check` hingen >240 s, pre-push-Gates flakten [T016447].

Der MCP-Server selbst ist ein externes Binary
(`/home/patrick/.local/bin/codebase-memory-mcp`, v0.9.0) und hier nicht
patchbar; `auto_index=false` steht bereits — die Stampede geht von
agenten-initiierten Reindex-Aufrufen aus. Repo-seitig sind deshalb Wrapper,
Runbook und Aufruf-Konvention die richtigen Hebel.

## What

1. **Single-Flight-Wrapper** `scripts/mcp/cbm-single-flight.sh`: flock auf
   einer Lockdatei im gemeinsamen `~/.cache/codebase-memory-mcp/` um
   `codebase-memory-mcp cli index_repository …`; weitere Aufrufer warten
   (nicht verhungern). Für skriptgesteuerte/automatisierte Indexierung.
2. **Runbook** `docs/runbooks/cbm-index-stampede.md`: Akut-Mitigation
   (STOP/TERM-Zyklen dokumentiert, Load-Beobachtung), Prävention
   (`index_status`/`detect_changes` vor manuellem Reindex; nur EINE Session
   indiziert; graph-Lese-Tools sind stale-tolerant), Betriebliche Grenze
   (parallele Sessions auf 4-Kern-Box).
3. **Konvention statt AGENTS.md:** Der Verweis „vor manuellem Reindex:
   erst Status prüfen, Wrapper nutzen“ lebt im Runbook + Agent-Guide;
   `AGENTS.md` bleibt bewusst unberührt (fremde Stufe unter Lock SID
   860181, Konfliktprävention).
4. **Explizit nicht:** Shared-Store/Daemon-Umbau (Vorschlag 2 im Ticket)
   als Follow-up-Ticket, nicht in diesem Change.

_Ticket: T016447_
