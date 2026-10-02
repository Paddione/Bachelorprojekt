# Design: k3-symbol-json (T900907)

Brainstorming-Ergebnis (inline, ohne Lavish-Board: Ursache per
Roh-Calls verifiziert; `superpowers:brainstorming` steht in dieser
Umgebung nicht zur Verfuegung).

## E1: Root-Cause (Tool-Matrix 0.10.8, verifiziert 2026-10-02)

| Tool | Default-stdout | JSON? | Lua-Pfad |
|---|---|---|---|
| `index_status` | ein JSON-Dokument | ja | ok (k3-status gruen) |
| `list_projects` | `{"projects":[]}` | ja | ok |
| `trace_path` | JSON (`status`/`suggestions`/...) | ja | ok |
| `search_graph` | `tree`-Text (`total: 0\n...`) | NEIN | ROT (T75) |

`search_graph` mit `"format":"json"` im stdin-Payload antwortet
`{"total":N,"search_mode":"bm25","cols":["qn","label","file","lines",
"rank"],"rows":[[qn,label,file,"start-end",rank],...],"has_more":...}`.
Verifiziert mit Treffern (`query=function` → 1991 Treffer, erste Zeile
bats-core `tracing.bash`) und ohne (`query=xkcd-9371-qwerty` →
`total:0`, `rows:[]`).

Fallen, die der Fix meidet (alle per Roh-Call belegt):

- `level=info` steht auf stderr, nicht stdout — der
  First-`{`-Strip ist reine Haertung, nicht der Fix.
- `cli --json search_graph` liefert die MCP-Huelle mit Text innen —
  darf NICHT verwendet werden (wuerde jede Suche als `zero hits`
  melden).
- `search_graph --format json` als CLI-Flag zusammen mit stdin-JSON
  bricht mit `missing required argument: project` (Exit 1) —
  `format` gehoert in den stdin-Payload.
- `format` darf NICHT global in `k3_call` fuer alle Tools gesetzt
  werden (unbekannte Args an `index_status`/`trace_path` riskieren
  Fehler) — nur in den `search_graph`-Payload von `k3_symbol`.

Mapping-Vorgabe: Spaltenpositionen aus `doc.cols` aufloesen (nicht
hartcodieren): `filename = join_root(cwd, file)`,
`lnum = tonumber(lines:match('^(%d+)')) or 1`,
`text = shortname(qn) .. ' — ' .. qn` mit shortname = Segment nach dem
letzten Punkt. Zero-Hits: `(doc.total or 0) == 0 or not doc.rows or
#doc.rows == 0`.

Prior art (T002829): `grep -rn -e 'repo-knowledge' -e
'codebase-memory-mcp' docs/adr/` ohne Treffer; `grep -rln
'repo-knowledge' tests/spec/` trifft nur
`tests/spec/neovim-dashboard.bats`. Keine verworfene Richtung
dokumentiert.

## E2: Edge-Cases

- `trace_path` mit unbekannter Funktion gab in einer Probe leeren
  stdout bei Exit 0 (stderr nicht geprueft): `k3_call` meldet dann
  `non-JSON output` als Warnung — kein Crash, Verhalten bleibt.
- BM25-Fuzziness: Treffer-Test nutzt `function` (1991 Treffer, stabil
  ungleich null); Assertions sind rangfolge-unabhaengig
  (`qflen>0`, Markertexte).
- CI kennt weder `nvim` noch `codebase-memory-mcp`
  (`grep -rn` in `.github/workflows/` leer): neuer Test wie T75 mit
  Skip-Guard, laeuft lokal und skipt in CI.

## E3: Betroffene Subsysteme

- `dotfiles/nvim/lua/config/repo-knowledge.lua` (`k3_call`,
  `M.k3_symbol`, Kopf-Kommentar ab Zeile 19).
- `tests/spec/neovim-dashboard.bats` (neuer Treffer-Test, bereits in
  dieser Branch als RED-Test enthalten).
- `components/website/src/data/test-inventory.json` (nur falls
  `task test:inventory` es aendert).
- Gelesen, nicht geaendert: K3-Binary 0.10.8, `config/gitroot.lua`.

## E4: RED-Nachweis (Fix-Pfad Schritt 3)

Neuer Test in dieser Branch (hinter T75):
`neovim-dashboard: repo-knowledge k3-symbol hitting term fills quickfix
from rows (T900907)` — belegt auf Branch
`fix/k3-symbol-json-T900907`:

```text
not ok 1 neovim-dashboard: repo-knowledge k3-symbol hitting term fills quickfix from rows (T900907)
```

(Abbruch an der `non-JSON output`-Abwesenheitspruefung: Marker
enthaelt pre-Fix den Fehler.) T75 bleibt parallel rot bis zum Fix.

Runner: `tests/unit/lib/bats-core/bin/bats
tests/spec/neovim-dashboard.bats -f "k3-symbol"`.

## E5: Verifikation (gruen)

1. BATS wie in E4: beide `k3-symbol`-Tests `ok`.
2. `... -f "k3-status names"` bleibt `ok` (kein Seiteneffekt auf
   `index_status`).
3. `task test:inventory` + Diff von `test-inventory.json` pruefen.
4. Finales Gate-Trio im Verify-Task (siehe `tasks.md`).
