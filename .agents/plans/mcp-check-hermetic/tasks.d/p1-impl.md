# p1-impl: Token-Env an Check-Aufrufen entkoppeln (T900922)

Scope: genau drei Testdateien, je ein `env -u`-Praefix pro
Check-Aufruf (vier Stellen). Alle Befehle im Worktree-Root auf Branch
`fix/mcp-check-hermetic-T900922`. Keine Skript-Aenderung, keine
Assertion-Aenderung.

## Steps

1. `tests/spec/mcp-tooling.bats` (T002398, zwei Stellen): die
   Anker-Zeile `run env MCP_OUT_DIR="$tmpd" bash
   scripts/mcp-sync.sh check` und die Drift-Zeile (identischer Aufruf
   nach der Drift-Injektion) je erweitern zu
   `run env -u BGE_MCP_TOKEN -u MCP_POSTGRES_TOKEN
   MCP_OUT_DIR="$tmpd" bash scripts/mcp-sync.sh check`.
   Kommentar am Anker ergaenzen (eine Zeile, Stil der Datei):
   Entruempelt das Aufrufer-Env, damit der Renderer
   deterministisch aus `server.env` aufloest (T900922).
2. `tests/spec/mcp-gateway.bats` („check passes"): die Zeile
   `run bash "$REPO/scripts/mcp-sync.sh" check` erweitern zu
   `run env -u BGE_MCP_TOKEN -u MCP_POSTGRES_TOKEN bash
   "$REPO/scripts/mcp-sync.sh" check` plus Ein-Zeilen-Kommentar
   wie in Schritt 1.
3. `tests/spec/mcp-gateway/authenticated-http-headers.bats`
   („stays green"): die Zeile `run bash "$SYNC" check` erweitern
   zu `run env -u BGE_MCP_TOKEN -u MCP_POSTGRES_TOKEN bash "$SYNC"
   check` plus Ein-Zeilen-Kommentar wie in Schritt 1.
4. Gegenpruefen (derselbe Runner wie p2):
   `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats
   -f "erkennt Drift"` muss `ok` melden — in einer Shell MIT
   gesetztem `BGE_MCP_TOKEN` (Fix-Umgebung; falls die eigene Shell
   ihn nicht traegt, mit trotzigem Wert exportieren, z.B.
   `BGE_MCP_TOKEN=poisoned-value-for-t900922` — kein echter
   Credential, nur ein Platzhalter zur Beweis-Fuehrung).
   Ebenso die beiden anderen Filter-Laeufe.
5. Commit mit expliziten Pathspecs, keine Broad-Adds:
   `git add tests/spec/mcp-tooling.bats
   tests/spec/mcp-gateway.bats
   tests/spec/mcp-gateway/authenticated-http-headers.bats &&
   git commit -m "fix(T900922): unset token env for mcp-sync check
   tests [T900922]"` und pushen.

## Acceptance

- Diff enthaelt exakt vier geaenderte Aufrufzeilen plus drei
  Kommentarzeilen; keine Assertion, kein anderer Test angefasst.
- Alle drei Filter-Laeufe gruen — auch mit gesetztem
  `BGE_MCP_TOKEN` in der Shell.
- Kein Credential-Wert in Diff, Kommentar oder Commit-Message.
