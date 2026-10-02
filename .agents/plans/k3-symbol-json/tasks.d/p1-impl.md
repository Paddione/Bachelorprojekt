# p1-impl: search_graph auf 0.10.8 heben (T900907)

Scope: genau eine Datei. Alle Befehle im Worktree-Root auf Branch
`fix/k3-symbol-json-T900907`. Datei:
`dotfiles/nvim/lua/config/repo-knowledge.lua`.

## Steps

1. `M.k3_symbol`: Payload von
   `{ project = name, query = symbol, limit = 50 }` auf
   `{ project = name, query = symbol, limit = 50, format = 'json' }`
   erweitern. `format` NUR hier setzen, nicht global in `k3_call`
   (verboten: `cli --json`-Flag — MCP-Huelle, siehe `design.md` E1).
2. Treffer-Mapping auf das `cols`/`rows`-Schema umstellen:
   Spaltenpositionen aus `doc.cols` aufloesen (qn, file, lines —
   nicht hartcodieren), dann je Zeile
   `filename = join_root(cwd, file)`,
   `lnum = tonumber(lines:match('^(%d+)')) or 1`,
   `text = shortname .. ' — ' .. qn` mit shortname = Segment nach
   dem letzten Punkt in qn. Iteration ueber `doc.rows or {}`.
3. Zero-Hits-Check anpassen: `(doc.total or 0) == 0 or not doc.rows
   or #doc.rows == 0` → `zero hits`-Notice wie bisher.
4. `k3_call` haerten: vor `vim.json.decode` stdout ab der ersten
   oeffnenden geschweiften Klammer schneiden
   (`stdout:find('{', 1, true)`; fehlt sie, bleibt es beim
   bisherigen `non-JSON output`-Fehler). Gueltiges JSON (Klammer an
   Position 1) bleibt unveraendert.
5. Kopf-Kommentar (0.9.0-Vertrag, Zeilen um 19–36) auf 0.10.8 heben:
   `search_graph` braucht `format=json` und antwortet
   `{total, cols, rows}`; `tree` ist Default-Text; `level=info`
   bleibt stderr. Andere Tools unveraendert dokumentieren.
6. Headless gegenpruefen (derselbe Runner wie p2):
   `tests/unit/lib/bats-core/bin/bats
   tests/spec/neovim-dashboard.bats -f "k3-symbol"` muss beide Tests
   mit `ok` melden; `... -f "k3-status names"` muss `ok` bleiben.
7. Commit mit explizitem force-add Pathspec (dotfiles/ ist
   gitignored): `git add -f
   dotfiles/nvim/lua/config/repo-knowledge.lua && git commit -m
   "fix(T900907): speak search_graph format=json with rows mapping
   [T900907]"` und pushen.

## Acceptance

- Diff betrifft nur `k3_call` (Haertung), `M.k3_symbol`
  (Payload + Mapping + Zero-Hits) und den Kopf-Kommentar;
  `k3_status`, `k3_trace`, `send_to_quickfix` und alle anderen
  Actions sind byte-identisch.
- Beide `k3-symbol`-Tests gruen, k3-status gruen.
