# Resolve non-ready pods (G-OPS01, 4 violations)

**Ziel:** G-OPS01 von 4 auf 0 senken.

## Aktuelle Probleme

| # | Namespace | Pod | Problem | Seit |
|---|-----------|-----|---------|------|
| 1 | workspace | livekit-egress-6c7759c9bb-fc2hp | ContainerCreating | 4d 11h (Jul 19) |
| 2 | workspace | oauth2-proxy-brett-5585d5dc6d-d9kgx | CrashLoopBackOff (234×) | 19h |
| 3 | workspace-korczewski | oauth2-proxy-brett-76f6b697fb-jzzqb | CrashLoopBackOff (251×) | 21h |
| 4 | workspace-korczewski | oauth2-proxy-terminal-6f7cf8c584-mj2vx | CreateContainerConfigError | 21h |

## Lösungsansätze

1. **#4 (einfach):** Fehlendes Secret `POCKET_ID_TERMINAL_SECRET` im namespace `workspace-korczewski` nachtragen
2. **#2/#3 (mittel):** oauth2-proxy-brett exit code 2 — Config-Fehler im neuen ReplicaSet; ggf. das crash-looping Pod löschen oder Rollback
3. **#1 (komplex):** livekit-egress ContainerCreating — PVC-Status, Node-Health, Events prüfen
