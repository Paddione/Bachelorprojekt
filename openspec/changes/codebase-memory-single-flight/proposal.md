# Proposal: codebase-memory-single-flight

## Why

Am 2026-08-24 (15:10–15:45) brachten 8–10 parallele opencode-Sessions
(Factory-Worker/Planner) eine 4-Kern-Box an ihre Grenzen (Load 54.5, avail RAM
zeitweise 84 MiB): Jede Session betreibt eine eigene `codebase-memory-mcp`-
Instanz, und bei Repo-Drift löste jede Instanz beim nächsten Graph-Tool-Aufruf
einen eigenen `index_repository`-Volljob aus — bis zu 8 simultane Index-Worker
für denselben Repo-Pfad. Folge: `task freshness:regenerate/check` hing >240s,
pre-push-Gates flackten, Worker-Sessions blockierten. Es gibt keine
Selbstheilung: Solange kein Einzeljob unter Last fertig wird, bleibt jeder
Store stale und die nächste Anfrage triggert erneut — Verhungerschleife.

## What

Single-Flight-Lock über Instanzgrenzen (Reparatur-Vorschlag 1 aus dem Ticket):

1. **`scripts/codebase-memory/index-single-flight.sh`** — Lease-Mutex in Bash
   (`acquire`/`release`/`status`) auf einer Lease-Datei unter
   `~/.cache/codebase-memory-mcp/`, atomar via noclobber, pro Projekt. Owner-
   Token schützt vor Fremd-Release; Stale-Takeover nach 20 Min (Default)
   bindet Crashes nicht dauerhaft.
2. **`.opencode/plugin/codebase-memory-singleflight.ts`** — opencode-Plugin
   (Hook `tool.execute.before`/`.after`, Muster: background-agents.ts): gated
   `index_repository` hinter den Mutex; blockierte Calls failen schnell mit
   Handlungshinweis (`index_status`/Graph-Queries nutzen statt Re-Index).
   Fail-open bei kaputter Guard-Infrastruktur.
3. **AGENTS.md** — ein Satz im Code-Discovery-Abschnitt: Index ist
   single-flighted, `index_status` zuerst prüfen.

Bewusst NICHT Teil des Umfangs: Shared-Store/Daemon-Umbau (Vorschlag 2),
Session-Limits (Vorschlag 4, Operator-Entscheid), automatischer
Freshness-Recheck vor Respawn (Vorschlag 3 bleibt Betriebshinweis).

_Ticket: T016447_
