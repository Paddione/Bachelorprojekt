# Proposal: k3-symbol-json (T900907)

## Problem

`neovim-dashboard.bats` T75 ist rot: `k3-symbol` mit Nonsense-Begriff
meldet `repo-knowledge: k3 search_graph returned non-JSON output` statt
`zero hits`. Aufgefallen auf Binary 0.10.8 (`~/.local/bin`).

## Symptom vs. Ursache (T002448-M5)

- Symptom (Fakt): T75 faellt (`grep 'zero hits'` auf dem Marker
  scheitert); `k3_call()` in `config/repo-knowledge.lua` liefert
  `non-JSON output`.
- Ticket-Hypothese (widerlegt): `level=info`-Zeilen auf stdout vor dem
  JSON. Tatsaechlich gehen die Log-Zeilen nach stderr (harmlos — Lua
  liest nur stdout), und stdout ist gar kein JSON.
- Ursache (verifiziert 2026-10-02, Binary 0.10.8): `cli search_graph`
  antwortet per Default im `tree`-Textformat (`total: 0\nsearch_mode:
  ...`), nicht JSON. `vim.json.decode` scheitert daher immer. Betroffen
  ist nur der `search_graph`-Pfad (`k3_symbol`): `index_status`,
  `list_projects` und `trace_path` liefern weiter reines JSON
  (k3-status-Test gruen, Roh-Calls belegt, siehe `design.md`).

## Optionen

1. `format=json` im Payload + Schema-Mapping (gewaehlt):
   `search_graph` mit stdin `{"project","query","limit","format":"json"}`
   antwortet `{"total","cols","rows"}` (Zeilen sind Arrays
   `[qn,label,file,"start-end",rank]`); Lua mappt `rows` auf
   Quickfix-Items und loest Spaltenpositionen aus `cols` auf statt sie
   zu hartcodieren.
2. `cli --json`-Flag: verworfen — liefert eine MCP-Huelle
   (`{"content":[{"text":"total: 0\n..."}]}`), der Text bleibt Baeume;
   `doc.total` waere immer nil und jede Suche meldete faelschlich
   `zero hits`.
3. Nur defensiv ab erstem `{` parsen: verworfen als alleiniger Fix —
   der Text enthaelt gar kein `{`; als zusaetzliche Haertung in
   `k3_call` trotzdem sinnvoll (Absicherung gegen kuenftige
   Log-Prefix-Drift).

## Fix-Ansatz

In `dotfiles/nvim/lua/config/repo-knowledge.lua`: `k3_symbol`-Payload um
`format = 'json'` erweitern, Treffer-Mapping von `doc.results[]`
(Objekte mit `file_path`/`start_line`) auf `doc.rows[]` (Arrays,
Spalten aus `cols`) umstellen, Zero-Hits-Check auf `rows`
anpassen, `k3_call` um First-`{`-Strip haerten, Kopf-Kommentar
(0.9.0-Vertrag) auf 0.10.8 aktualisieren. Andere
`k3_call`-Werkzeuge bleiben unangetastet (JSON-ok).

## Akzeptanz

- T75 gruen; neuer Treffer-Test (diese Branch, s. `design.md` E4) gruen;
  k3-status bleibt gruen.
- Kein `non-JSON output`-Marker mehr im Hit- und Zero-Hit-Pfad.
- `task test:inventory` nachgezogen, `test-inventory.json` mitcommittet.

## Nicht-Ziele

- Kein Binary-Pinning, keine Doku ausserhalb des Lua-Kopfkommentars.
- `trace_path`-Leer-stdout bei unbekannter Funktion bleibt wie es ist
  (Warnung, kein Crash; dokumentiert in `design.md` E2).
