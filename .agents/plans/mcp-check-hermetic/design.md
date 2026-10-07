# Design: mcp-check-hermetic (T900922)

Brainstorming-Ergebnis (inline, ohne Lavish-Board: Ursache per
Laengen-/Match-Vergleich und Gegenprobe belegt;
`superpowers:brainstorming` steht in dieser Umgebung nicht zur
Verfuegung).

## E1: Root-Cause

`render_agy_json`/`render_qwen_json`/`render_claude_user_json` loesen
`${BGE_MCP_TOKEN}` (und `${MCP_POSTGRES_TOKEN}`) zu echten Werten auf
(T002704/T004272). Quelle: `process.env` gewinnt ueber `server.env`
(`scripts/mcp-sync.sh`, dokumentiert seit T002704). `cmd_check`
vergleicht Repo-Targets unter `MCP_OUT_DIR`, User-Targets aber immer
live unter `$HOME` (Kommentar Zeile 36–38: Tests isolieren ueber HOME).

Messkette (2026-10-02, `main@523212643`):

- Dateien vs. frischem Fake-HOME-Render: bis auf `Authorization`
  byte-identisch → kein struktureller Drift.
- `BGE_MCP_TOKEN`: `env_len=64 file_len=48 match=false`;
  `MCP_POSTGRES_TOKEN`: `match=true`. (Nie Werte gelesen, nur
  Laengen/Match.)
- Gegenprobe: `env -u BGE_MCP_TOKEN -u MCP_POSTGRES_TOKEN ...
  mcp-sync.sh check` → alle sechs Targets OK, Exit 0.

Die drei roten Tests rufen `check` ohne Env-Bereinigung und ohne
HOME-Sandbox — ihr Ausgang haengt vom Aufrufer-Env ab. In CI (kein
Token-Env, keine HOME-Targets → SKIP-Zweige) sind sie gruen; lokal mit
abweichendem Env rot.

Prior art (T002829): `grep -rn -e 'mcp-tooling' -e 'mcp:check'
docs/adr/` ohne Treffer. Guards: `mcp-gateway.bats`,
`authenticated-http-headers.bats`, die No-Secret-Leak-Tests (T002941,
T900839 — bereits hermetisch via Fake-HOME + Fixture-Registry),
T002779-Guard (Knock-on-Opfer). Keine verworfene Richtung dokumentiert.

## E2: Edge-Cases

- Absichtlich per Env-Override gerenderte Disk-Dateien wuerden nach
  dem Fix als Drift gelten (Soll kommt aus `server.env`). Akzeptiert:
  sanktionierter Fluss rendert ohne Env-Override; CI hat kein Env.
- `MCP_POSTGRES_TOKEN` matcht derzeit, wird trotzdem mit-entkoppelt
  (gleiche Gefahrenklasse, null Kosten).
- Keine Credential-Werte in Plan, Tests, Logs oder Ticket-Kommentaren
  — nur Existenz/Laenge/Match-aussagen.

## E3: Betroffene Subsysteme

- `tests/spec/mcp-tooling.bats` (T002398, Zeilen um 132 und 143).
- `tests/spec/mcp-gateway.bats` („check passes", Zeile um 46).
- `tests/spec/mcp-gateway/authenticated-http-headers.bats`
  („stays green", Zeile um 81).
- Gelesen, nicht geaendert: `scripts/mcp-sync.sh`,
  `docs/agent-guide/registry/mcp.yaml`,
  `tests/spec/ci-cd/spec-tracked-file-guard.bats`.

## E4: RED-Nachweis (Fix-Pfad Schritt 3)

Kein neuer Test: Die drei existierenden Tests sind die
reproduzierenden Tests. Belegt auf Branch
`fix/mcp-check-hermetic-T900922` ( Shell MIT abweichendem
`BGE_MCP_TOKEN`):

```text
not ok 1 T002398: mcp:check erkennt Drift in der llama.cpp-Config
not ok 1 mcp-sync.sh check passes (registry matches generated configs)
not ok 1 mcp-sync.sh check stays green — headers are generated, not hand-edited
```

Runner: `tests/unit/lib/bats-core/bin/bats <datei> -f "<filter>"`.

## E5: Verifikation (gruen)

1. Alle drei Filter-Laeufe `ok` — in derselben Token-Env-Shell.
2. Drift-Pfad intakt: T002398-Zweithaelfte (injizierter
   `drift-probe`) meldet weiter DRIFT (ist Teil desselben Tests).
3. Volle Dateien gruen: `mcp-tooling.bats`, `mcp-gateway.bats`,
   `authenticated-http-headers.bats` komplett.
4. T002779-Guard (`spec-tracked-file-guard.bats -f "unberuehrt"`)
   wieder gruen.
5. Finales Gate-Trio im Verify-Task (siehe `tasks.md`).
