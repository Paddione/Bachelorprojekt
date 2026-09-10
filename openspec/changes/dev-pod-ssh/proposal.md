# Proposal: dev-pod-ssh

## Why

`ssh dev-pod` und `ssh dev-pod/gekko` scheitern mit
`kex_exchange_identification: Connection closed by remote host`. Die SSH-Config beider Nutzer baut
den Tunnel über `kubectl --context fleet -n workspace-dev exec -i deploy/dev-pod -- nc 127.0.0.1 22`
— das mit T900107 eingeführte Deployment `dev-pod` trägt aber nur `mcp-node`, `mcp-kubernetes` und
`repo-sync`. Kein Container startet einen sshd, auf Port 22 lauscht niemand, und keine der 14
ReplicaSet-Revisionen hatte je einen SSH-Container. Die Config beschreibt einen Zustand, den das
Deployment nie hergestellt hat.

Belege (2026-09-10, `origin/main` 953c23b4b):

```bash
kubectl --context fleet -n workspace-dev exec deploy/dev-pod -c mcp-node -- netstat -ltn
# nur 3001-3006, 8080, 18235
kubectl --context fleet -n workspace-dev exec deploy/dev-pod -c mcp-node -- cat /proc/sys/net/ipv4/ip_unprivileged_port_start
# 0
```

## What

Ein vierter Container `dev-shell` im `dev-pod`: ein vollwertiger Entwicklungs-Container
(git, git-crypt, node/pnpm, task, kubectl, gh, Claude Code), in dem ein sshd auf
`127.0.0.1:22` läuft.

- **Kein neuer Netzweg.** sshd bindet nur Loopback; erreichbar ist er ausschließlich über den
  bestehenden kubectl-exec-ProxyCommand. Kein Service-Port, kein Ingress, kein NodePort.
- **Gemeinsames Konto, zwei Login-Namen.** `patrick` und `gekko` sind zwei passwd-Einträge auf
  uid 1000 mit gemeinsamem Home `/home/dev`. Jeder Name akzeptiert nur seinen eigenen Pubkey.
  `runAsNonRoot` bleibt für den ganzen Pod erhalten.
- **Persistentes Home.** Neues PVC `dev-pod-home` für `/home/dev` (eigener Clone, Shell-History,
  Claude-Config, Host-Key).
- **Checkout bleibt single-writer.** `dev-shell` mountet `dev-pod-repo` read-only.
- **Pubkeys als ConfigMap**, abgeglichen gegen `PATRICK_SSH_PUBLIC_KEY` / `GEKKO_SSH_PUBLIC_KEY`
  in `environments/mentolder.yaml`.

Out of scope: die Work-VM (T900104), RBAC-Erweiterung der ServiceAccount `dev-pod` (bleibt
read-only), automatisches Einspielen von git-crypt-Key oder GitHub-Token.

_Ticket: T900108_
