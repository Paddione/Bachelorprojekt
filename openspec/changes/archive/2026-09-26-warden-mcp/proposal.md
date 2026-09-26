# Proposal: warden-mcp

## Why

Claude Code braucht in Sessions regelmäßig Zugangsdaten aus der eigenen Vaultwarden-Instanz
(`vault.<PROD_DOMAIN>`) und soll neu erzeugte bzw. rotierte Secrets direkt dort ablegen können.
Heute geht das nur per Copy-Paste durch den Nutzer — Secrets landen dabei im Chat-Transkript.
Der MCP-Server [`icoretech/warden-mcp`](https://github.com/icoretech/warden-mcp) kapselt die
offizielle Bitwarden-CLI (`bw`), hält Secrets standardmäßig redacted (`reveal: true` pro Aufruf
nötig) und passt damit zur bestehenden MCP-Registry (T002300).

## What

- Launcher `scripts/warden-mcp/launch.mjs`: liest `~/.config/warden-mcp/server.env`
  (`BW_HOST`, `BW_CLIENTID`, `BW_CLIENTSECRET`, `BW_PASSWORD`), bricht fail-closed ab, wenn Datei
  oder Key fehlt, und startet `@icoretech/warden-mcp@0.2.44 --stdio` mit genau dieser Umgebung.
- Registry-Eintrag `warden` in `docs/agent-guide/registry/mcp.yaml`, **nur** `harness.claude_code`;
  `task mcp:sync` erzeugt daraus den `.mcp.json`-Eintrag (nur Launcher-Aufruf, keine Werte).
- Schreib-Gate: `permissions.ask` in `.claude/settings.json` für alle 25 mutierenden Tools des
  gepinnten Release (`mutatingToolAnnotations`/`destructiveToolAnnotations`).
- Neue SSOT-Spec `warden-mcp` plus BATS-Guards unter `tests/spec/warden-mcp/`.

## Non-Goals

- Kein HTTP-/Cluster-Deployment (warden-mcp hat keine eigene Auth; Master-Passwort bleibt lokal).
- Keine Anbindung für opencode, agy, qwen oder llama.cpp.
- Keine Änderung an Vaultwarden (`SSO_ONLY`), Pocket ID oder Sealed Secrets.
- Kein dediziertes Agent-Konto — der Nutzer hat bewusst sein persönliches Konto mit
  Vollzugriff gewählt; das Risiko wird über das `ask`-Gate begrenzt.

_Ticket: T900404_
