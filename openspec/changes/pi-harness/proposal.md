# Proposal: pi-harness

## Why

Die lokalen Modelle (Glimmer 30B, Qwen 27B auf `127.0.0.1:1919`) leiden unter dem großen
Preamble von opencode: System-Prompt, `AGENTS.md`, Skill-Katalog und MCP-Schemas belegen einen
großen Teil des Fensters, bevor der Plan überhaupt gelesen ist. Pi (`@mariozechner/pi-coding-agent`)
ist ein minimaler Harness mit vier Kerntools, kleinem System-Prompt und ohne MCP. Offen ist, wie
wenig Harness ein lokales Modell braucht, um einen gestagten Plan ohne Probleme abzuarbeiten.
Diese Frage soll messbar und reproduzierbar beantwortet werden.

## What

- Pi wird als weiterer Harness in die zentrale Registry aufgenommen: Rolle `pi` in
  `docs/agent-guide/registry/capabilities.yaml`, gültig in `scripts/toolset/check.mjs` und
  `scripts/toolset-context.sh`. Die Rolle `pi` erbt die Wildcard `all` nicht — Pi bekommt nur,
  was explizit für `pi` freigegeben ist.
- Installation über `taskfiles/Taskfile.pi.yml` (`install`, `status`, `uninstall`), Version
  gepinnt, isoliertes Agent-Verzeichnis per `PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`.
- Trial-Runner `scripts/pi-run.sh` mit Stufenleiter L0..L3. Jede Stufe startet Pi mit allen
  Discovery-Mechanismen abgeschaltet und lädt danach nur explizit Freigegebenes. Der Runner
  erzeugt `models.json` zur Laufzeit aus `GET /v1/models` des lokalen Endpunkts und die
  Skill-Liste aus der Registry, protokolliert jeden Lauf als JSONL und meldet das Ergebnis als
  Ticket-Kommentar.
- Nicht im Umfang: MCP für Pi, Einbindung in `factory-runner`/`plan-runner`, OpenClaw
  (Folgeticket).

_Ticket: T900529_
