# langfuse-harness-setup — Design (T900690)

Nach-Merge-Befund zu T900688 in `scripts/langfuse/setup-harnesses.sh`.

## Symptom und Ursache

| # | Symptom (Fakt) | Ursache | Beleg |
|---|---|---|---|
| S1 | codex-Tracing-Plugin enabled, aber `hooks = true` fehlt in `~/.codex/config.toml` | Skript hängt `[features]\nhooks = true` nur an, wenn `[features]` fehlt. Eine bestehende Sektion (`prevent_idle_sleep = true`) bleibt ohne `hooks`. | `grep -n -A3 '^\[features\]' ~/.codex/config.toml`; RED-Test T900690 #1 |
| S2 | Nach dem Setup-Lauf meldete `pi list` „No packages installed“ | Hypothese, nicht belegt: `pi install` scheiterte still oder landete in anderem Scope. Das Skript leitet die Ausgabe nach `/dev/null` und prüft den Erfolg nicht. | `pi list` vor/nach manuellem `pi install` (2026-09-27: nachträglich rc=0, Paket gelistet); RED-Test T900690 #2 |

Geprüft, kein Bug: opencode v2 nutzt `plugins` (Plural, wie `.opencode/opencode.jsonc`); das Plugin
liegt in `~/.cache/opencode/npm/@langfuse/opencode-observability-plugin@0.5.1`.

## Fix-Ansatz

- D1 codex: Existiert `[features]` ohne `hooks`-Zeile, `hooks = true` direkt unter dem Header
  einfügen. Steht `hooks = false` dort, auf `true` setzen. Fehlt die Sektion, bleibt das bisherige
  Anhängen. Idempotent: zweiter Lauf ändert nichts.
- D2 pi: Nach `pi install` per `pi list` prüfen, dass `@langfuse/pi-observability-plugin` gelistet
  ist. Sonst Meldung `pi: @langfuse/pi-observability-plugin missing after pi install` auf stderr
  und Exit 1. Die Ausgabe von `pi install` nicht mehr verwerfen.

Nicht im Scope: devmesh-Ingress/DNS (Hosts lösen auf fleet-IPs auf) und das nicht ausgestellte
`devmesh-wildcard-tls` (ipv64-Key 401). Eigenes Ticket.
