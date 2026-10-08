# p1 — Spike: Gateway-Stand und Adapter-Scope festlegen

Ziel: D3 wasserdicht machen und `design.md` schreiben. Nur lesen, nichts installieren.

## Tasks

- [ ] Gateway-Stand erheben (read-only, schlägt fehl wenn der Host offline ist):
  ```bash
  task openclaw:status
  scripts/openclaw-ask.sh --timeout 60 "Welche Pods laufen nicht?"
  ```
- [ ] Adapter-Scope entscheiden und begründen: User-Scope lesen/validieren plus
  `openclaw mcp doctor --probe`; kein Schreiben unter `~/.openclaw` in CI.
  Ergebnis als Abschnitt in `design.md` festhalten.
- [ ] LLM-Task-Capability aus der Registry wählen (Kandidat für D2) und in
  `design.md` benennen; Rollen-Ergänzung (`openclaw-ops`) vormerken für p2.
- [ ] `design.md` schreiben: Gateway-Befund, Adapter-Vertrag, Rollen- und
  Werkzeugsatz-Entscheidung (D1–D3), Nicht-Ziele (D4).

## Verify

- [ ] `design.md` existiert und nennt Adapter-Vertrag plus gewählte LLM-Capability.
