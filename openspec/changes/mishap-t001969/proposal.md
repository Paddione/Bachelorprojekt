# Proposal: mishap-t001969

## Why

Drei reproduzierte Mishaps aus ticket-ops 2026-07-19:

1. **Implementer-Subagent stalled in Monitor-Warteschleifen (T001963).**
   Der Subagent stoppte 8+ Mal mit "I'll wait for the monitor", weil
   Hintergrund-`task test:changed` und CI-Polls via Monitor den Fortschritt
   blockierten. Lehre: Implementer-Prompts müssen Hintergrund-Monitore für
   lange Testläufe explizit verbieten und auf synchrone Calls mit Timeout
   zwingen.
2. **`ghcr-pull-secret` im `workspace`-Namespace abgelaufen** (2026-07-19).
   Brain-Rollout hing in `ImagePullBackOff`. Das Secret ist manuell
   verwaltet (kein SealedSecret, keine OwnerRefs), wird aber von ~10
   `:latest`-Deployments referenziert. Der Ausfall blieb unbemerkt, solange
   Images node-lokal gecacht waren.
3. **`qwen35-iq4` empty subagent output** (2x am 2026-07-19, jetzt 3x
   inkl. dieser ticket-ops session). Delegationen returnen ohne Text. Root
   cause unklar — Timeout (default 15 min), Token-Truncation, oder Model-
   Glitch.

## What

- `.claude/skills/dev-flow-execute/SKILL.md` und das Implementer-Subagent-
  Prompt: explizite Anweisung, dass Hintergrund-Tasks für Test-Runs
  verboten sind; synchrone Calls mit Timeout-Pflicht.
- `k3d/`: `ghcr-pull-secret` als SealedSecret (mit OwnerRefs zu allen
  referenzierenden Deployments) oder eine alternative automatisierte
  Refresh-Pipeline. Ablauf-Monitoring-CronJob.
- `.opencode/plugins/background-agents.ts`: Timeout-Defaults anpassen
  (z. B. von 15 min auf 25 min für Qwen3.6), und Fallback-Modell bei
  Empty-Output konfigurieren (qwen35-hq als Backup).

_Ticket: T001969_
