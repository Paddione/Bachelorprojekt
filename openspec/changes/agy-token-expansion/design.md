---
ticket_id: T002704
plan_ref: openspec/changes/agy-token-expansion/tasks.md
status: active
date: 2026-08-08
---

# Design — agy-Config: Header-Platzhalter beim Rendern auflösen

## Symptom vs. Ursache

Getrennt und belegt am 2026-08-08, im Zuge von T002703:

| | Aussage | Beleg |
|---|---|---|
| S1 | agy sieht `bge-mcp` nicht — als einzigen seiner sieben MCP-Server | agy-Lauf, positive Aufzählung |
| S2 | POST mit literalem `Bearer ${BGE_MCP_TOKEN}` → `401`; mit echtem Token → `200` | curl gegen :13005 |
| S3 | Mit expandiertem Wert in `~/.gemini/config/mcp_config.json` erscheint `bge-mcp` sofort | agy-Lauf, sieben statt sechs Server |
| S4 | `bge-mcp` ist der einzige Eintrag der agy-Config mit `headers` | `jq` über die Config |

S4 erklärt die Selektivität: alle anderen Server brauchen keinen Header und funktionieren
deshalb, obwohl sie identisch per `serverUrl` konfiguriert sind.

## Warum es opencode schon trifft und Claude Code nicht

`render_agy_json` in `scripts/mcp-sync.sh` schreibt `headers` **wörtlich aus der Registry**, also
mit `${VAR}`. Für opencode besteht dieses Problem seit T002488 nicht mehr — dort übersetzt der
Renderer nach `{env:VAR}`, opencodes eigener Notation. Claude Code expandiert `${VAR}` selbst und
braucht nichts.

agy tut beides nicht: es kennt keine `{env:}`-Notation und löst `${VAR}` in den Headern nicht auf.

## Entscheidung

Der agy-Renderer **expandiert** `${VAR}` in Header-Werten zum tatsächlichen Wert.

Das ist für agy vertretbar und für die anderen beiden Ziele nicht: `.mcp.json` und
`.opencode/opencode.jsonc` liegen **im Repo** und sind getrackt — dort wäre ein expandierter Token
ein committetes Geheimnis. `~/.gemini/config/mcp_config.json` liegt in `$HOME`, ausserhalb jeder
Versionierung. Die Begründung der Registry (`auth_note` in `mcp.yaml`: „als unexpandierte
${VAR}-Referenz, damit kein Klartext in eine getrackte Datei geraet") gilt also genau für die zwei
Dateien, für die sie geschrieben wurde — nicht für die dritte.

### Woher der Wert kommt

Auflösungsreihenfolge je Variable:

1. die Umgebung des Aufrufers,
2. `~/.config/bge-mcp/server.env` — dieselbe Datei, die die systemd-Unit per `EnvironmentFile=`
   liest und die `mcp.yaml` bereits als kanonische Quelle benennt.

Nur die Umgebung zu lesen wäre die naheliegendere, aber schlechtere Wahl: dann hinge das Ergebnis
von `task mcp:sync` davon ab, aus welcher Shell man es startet. Genau diese Abhängigkeit hat den
Fehler erzeugt — der Token *war* in `server.env` gepflegt, nur nicht in der Umgebung des
Harness-Prozesses.

Die Datei wird als generische Variablenquelle gelesen, nicht als Sonderfall für einen
Variablennamen. Ein Schema-Feld pro Client (`env_file:` in `mcp.yaml`) wäre die allgemeinere
Lösung und wurde verworfen: es kostet Schema für aktuell genau einen Fall.

### Wenn der Wert nirgends steht

Der Platzhalter bleibt stehen und `render` gibt eine Warnung auf stderr aus — kein Abbruch.

Fail-closed wurde erwogen und verworfen: `task mcp:sync` würde dann auch dann scheitern, wenn man
nur einen ganz anderen Server ändern will. Der Zustand „Platzhalter in der Datei" ist ausserdem
exakt der heutige, also keine Verschlechterung — nur künftig mit einem Hinweis statt stillschweigend.

Wichtig für die Drift-Prüfung: `check` rendert frisch und vergleicht gegen die reale Datei. Weil
Auflösung und Warnung in **einer** Funktion liegen, die beide Pfade benutzen, sehen `render` und
`check` immer denselben Wert. Ein „Platzhalter gerendert vs. Token in der Datei"-Fehlalarm kann
nur entstehen, wenn zwischen zwei Läufen die Token-Quelle verschwindet.

## Reichweite

Die Expansion gilt für **alle** `headers` aller Clients im agy-Renderer, nicht nur für
`bge-mcp`/`BGE_MCP_TOKEN`. Ein Renderer, der einen Variablennamen hart kennt, wäre beim nächsten
authentifizierten Server erneut falsch.

## Edge-Cases

- **Werte ohne Platzhalter** dürfen nicht angefasst werden (`X-Static: "no-placeholder-here"`).
  Der T002488-Test führt diesen Positiv-Anker bereits für die anderen Renderer; der neue Test
  zieht ihn für agy nach.
- **Mehrere Platzhalter in einem Wert** müssen alle ersetzt werden.
- **Die anderen beiden Renderer bleiben unberührt.** Das ist die sicherheitsrelevante Aussage des
  Vorgangs und braucht einen eigenen Test: `.mcp.json` behält `${VAR}`, `.opencode/opencode.jsonc`
  behält `{env:VAR}`. Ohne diesen Guard könnte eine spätere Vereinheitlichung den Klartext in eine
  getrackte Datei tragen, ohne dass es auffällt.
- **`server.env`-Parsing:** die Datei ist eine `KEY=VALUE`-Liste für systemd, kein Shell-Skript.
  Sie wird zeilenweise gelesen, nicht `source`-d — ein `source` würde beliebigen Code ausführen
  und Anführungszeichen anders behandeln als systemd.

## Offen (bewusst nicht geklärt)

Ob agy `${VAR}` grundsätzlich nicht auflöst oder nur die Umgebung seines persistenten
`antigravity-ide-server`-Sidecars sieht (dessen `extensionHost`-Prozess hatte den Token gesetzt,
die übrigen nicht), ist für die gewählte Lösung folgenlos: der expandierte Wert funktioniert in
beiden Fällen. Für eine env-basierte Alternative wäre die Unterscheidung entscheidend gewesen.

## Verifikation

Rot vor dem Fix, grün danach — gemessen an der Generator-**Ausgabe** gegen eine Fixture-Registry
in einem tmpdir (`MCP_REGISTRY`/`MCP_OUT_DIR`/`HOME`, Isolationsmechanik aus T002487):

1. Variable in der Umgebung → agy-Config trägt den Wert, kein `${...}` mehr.
2. Variable nur in `$HOME/.config/bge-mcp/server.env` → ebenfalls aufgelöst.
3. Variable nirgends → Platzhalter bleibt, Warnung auf stderr, Exit 0.
4. Wert ohne Platzhalter → unverändert.
5. `.mcp.json` behält `${VAR}`, `.opencode/opencode.jsonc` behält `{env:VAR}`.

Abschliessend der reale Beleg: `task mcp:sync`, dann agy nach seinen MCP-Servern fragen —
`bge-mcp` muss in der Aufzählung erscheinen.
