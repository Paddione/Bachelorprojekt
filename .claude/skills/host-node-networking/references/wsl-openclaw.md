# WSL OpenClaw Gateway Operations

Aus `host-node-networking` Phase 4 extrahiert (Chore T001007). OpenClaw verbindet die
Developer-Workstation (WSL) mit dem GPU-Worker. Diese Schritte sind unabhängig vom
Hetzner/LiveKit-Hauptflow — daher ausgelagert.

## Setup and Startup

```bash
task openclaw:install
task openclaw:configure  # Writes config pointing to Ollama at 10.10.0.3
task openclaw:start      # Starts daemon
```

## Status & Logs

```bash
task openclaw:status     # running / stopped, PID, uptime, connected GPU worker, last heartbeat
task openclaw:logs       # journalctl -u openclaw --since "10 min ago" --no-pager
curl -s http://10.10.0.3:11434/api/tags | head -5   # Ollama erreichbar?
ping -c 2 10.10.0.3                                    # WireGuard-Tunnel aktiv?
```

## Backup, Restore & Reset

| Aktion | Befehl |
|---|---|
| Backup | `task openclaw:backup` (snapshots configuration to `~/.openclaw` archive) |
| Restore | `task openclaw:restore` (restores config from latest backup) |
| Wipe | `task openclaw:wipe CONFIRM=yes` (destructive reset, requires explicit confirmation) |

## Troubleshooting

| Symptom | Ursache | Fix |
|---|---|---|
| `Connection refused` | WireGuard tunnel down | `sudo wg show` — check handshake; `ping 10.10.0.3` — if unreachable, restart WireGuard |
| `503 Service Unavailable` | Ollama not running on GPU host | SSH to GPU worker: `systemctl status ollama`; restart: `sudo systemctl restart ollama` |
| `no route to host` | GPU host offline or mesh IP changed | Check WireGuard mesh config in `wireguard/wg-mesh-nodes.yaml` |
| Daemon won't start | Port conflict or stale PID | `task openclaw:wipe CONFIRM=yes && task openclaw:install && task openclaw:start` |
| Ollama slow / OOM | GPU memory exhausted | `ssh 10.10.0.3 nvidia-smi` — check VRAM; reduce model size or restart Ollama |
