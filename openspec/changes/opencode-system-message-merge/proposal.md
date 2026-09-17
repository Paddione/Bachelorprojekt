# Proposal: opencode-system-message-merge

## Why

opencode bricht mit dem lokalen Modell ab: „could not encode request: System
message must be at the beginning." (`opencode.log`, 62 Treffer seit
2026-08-23, betroffen `qwen38-primary` und der Titel-Agent).

- **Symptom (Fakt):** Der Provider `llamacpp-local` zeigt direkt auf FreeToken
  `:1919`. Anfragen mit zwei `system`-Nachrichten scheitern.
- **Ursache (belegt 2026-09-17):** Die Qwen3.6-Vorlage in FreeToken akzeptiert
  genau eine `system`-Nachricht an Position 0. Reproducer per `curl`: eine
  `system`-Nachricht OK, zwei am Anfang Fehler, eine mitten im Verlauf Fehler.
  opencode 1.18.31 sendet `system,system,user` (Probe-Plugin auf dem
  fetch-Pfad). Früher fingen `scripts/llm-proxy/fixups.mjs` (Proxy stillgelegt,
  T900208/T900213) und `freetoken-active.ts` (entfernt, T900203) das ab.
- **Warum kein `experimental.chat.system.transform`:** Der Hook sieht nur einen
  Eintrag. opencode fügt die zweite `system`-Nachricht erst danach hinzu.

## What

Neues opencode-Plugin `.opencode/plugin/system-message-merge.ts`. Es umhüllt
`provider["llamacpp-local"].options.fetch` und fasst alle `system`-Nachrichten
zu einer an Position 0 zusammen. Verteilt wird es wie die übrigen Plugins über
`scripts/opencode-sync-agents.sh`.

## Non-Goals

- Keine Engine-Umschaltung, keine Aliase (bleibt entfernt, T900203).
- Kein Wiederbeleben des llm-proxy.
- Das veraltete `:18235`-Requirement in `llm-local-dev.md` bleibt hier unberührt.

_Ticket: T900220_
