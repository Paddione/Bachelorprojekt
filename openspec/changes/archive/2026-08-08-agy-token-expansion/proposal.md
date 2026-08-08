# Proposal: agy-token-expansion

## Why

agy erreicht `bge-mcp` nicht. Ein agy-Lauf am 2026-08-08 zählt sieben MCP-Server auf, sobald der
Token stimmt — und sechs, solange er es nicht tut; `bge-mcp` ist der einzige, der fehlt.

Ursache ist der Header, den `scripts/mcp-sync.sh` nach `~/.gemini/config/mcp_config.json`
schreibt: `Authorization: "Bearer ${BGE_MCP_TOKEN}"`, wörtlich aus der Registry übernommen. agy
löst den Platzhalter nicht auf und sendet den Literal-String; der Shim antwortet mit `401` und
agy verwirft den Server. Gemessen: POST mit literalem Platzhalter → `401`, mit echtem Token →
`200`, mit expandiertem Wert in der Config erscheint der Server sofort in agys Aufzählung.

`bge-mcp` ist der einzige Eintrag der agy-Config mit einem `headers`-Feld — deshalb trifft es
genau ihn und keinen der übrigen sechs, die bei identischer `serverUrl`-Form funktionieren.

Für opencode ist dieselbe Fehlerklasse seit T002488 gelöst (Übersetzung nach `{env:VAR}`), Claude
Code expandiert selbst. Nur für agy fehlt eine Entsprechung.

## What

`render_agy_json` löst `${VAR}` in Header-Werten zum tatsächlichen Wert auf — für alle Clients,
nicht nur für `bge-mcp`. Die Quelle ist die Umgebung des Aufrufers, ersatzweise
`~/.config/bge-mcp/server.env`, dieselbe Datei, die die systemd-Unit liest. Damit hängt das
Ergebnis nicht mehr davon ab, aus welcher Shell `task mcp:sync` gestartet wurde — genau diese
Abhängigkeit hat den Fehler erzeugt, denn gepflegt war der Token die ganze Zeit.

Ist ein Wert nirgends zu finden, bleibt der Platzhalter stehen und `render` warnt auf stderr. Das
entspricht dem heutigen Zustand, nur nicht mehr stillschweigend; ein Abbruch würde jeden Sync von
der Token-Verfügbarkeit abhängig machen, auch beim Ändern eines ganz anderen Servers.

**Die anderen beiden Renderer bleiben unverändert** und bekommen dafür einen ausdrücklichen Test:
`.mcp.json` und `.opencode/opencode.jsonc` liegen im Repo, ein expandierter Token wäre dort ein
committetes Geheimnis. Nur die agy-Config liegt in `$HOME` und ausserhalb der Versionierung — die
Begründung der Registry für die Platzhalter-Schreibweise gilt für die zwei getrackten Dateien,
nicht für die dritte.

Abwägungen und verworfene Alternativen (Schema-Feld `env_file:` pro Client, fail-closed bei
fehlendem Token): `design.md`.

_Ticket: T002704_
