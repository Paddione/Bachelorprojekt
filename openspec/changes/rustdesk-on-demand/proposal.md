# Proposal: rustdesk-on-demand

## Why

Der RustDesk-Relay-Stack (hbbs/hbbr, ns `rustdesk`) ist eine GitOps-Waise: Live laufen
53 Tage alte Root-Pods (`managedFields: kubectl-client-side-apply`), die gehärteten
Manifeste aus T014553 (uid 65534, emptyDir workdir, seccomp) wurden nie ausgerollt,
und der Stack liegt in keinem Kustomize-Root — `task workspace:deploy` und das
Flux-Artifact kennen ihn nicht.

Gleichzeitig laufen die öffentlichen Ports 21115–21119 auf `${TURN_NODE}` rund um die
Uhr, obwohl Remote-Zugriff nur sporadisch gebraucht wird (Zielgeräte sind selbst nur
gelegentlich online). Der Stack soll deshalb on-demand hoch- und runtergefahren werden
können — vom Handy über Tailscale/SSH mit einem Befehl.

## What

Phase 1 des On-Demand-Konzepts (Geräte-Wake ist explizit Phase 2/out of scope):

1. **Task-Verwaltung:** Neues `taskfiles/Taskfile.rustdesk.yml` (Include-Pattern wie
   die 12 bestehenden taskfiles) mit `rustdesk:deploy`, `rustdesk:wake`,
   `rustdesk:sleep`, `rustdesk:status`. Der Stack bleibt bewusst außerhalb Flux —
   GitOps-Reconcile würde jedes imperative Scale-to-0 zurücknudeln (Präzedenz:
   coturn/janus werden ebenfalls separat betrieben).
2. **Härtungsrollout:** `deploy`/`wake` applyen die gehärteten T014553-Manifeste aus
   `k3d/rustdesk-stack/` und ersetzen die Root-Pods.
3. **Wake:** `kubectl scale --replicas=1` für hbbs+hbbr; Clients re-registrieren per
   Heartbeat (Device-IDs sind client-seitig aus Keypairs abgeleitet, Server-Keypair
   liegt im Secret `rustdesk-secrets` — REQ-RUSTDESK-RELAY-002 bleibt unberührt).
4. **Sleep:** One-shot-Sleeper-Job (SA + Role + RoleBinding + Job in
   `k3d/rustdesk-stack/on-demand.yaml`, nur vom wake-Task angewendet, nie Teil eines
   Kustomize-Builds), der nach TTL (30 min Default) beide Deployments auf
   `replicas=0` skaliert. Laufende Sessions überleben den Wind-down (Rendezvous nur
   beim Verbindungsaufbau nötig); Re-Wake ist ein Befehl.

_Verworfene Alternativen:_ Flux-Integration mit replicas-Default (Reconcile-Drift bei
imperativem Scaling); PVC für hbbs.db (nur Verzeichnis, kein Persistenzbedarf);
Idle-Detection via Connection-Count (v2, erstmal fester TTL).

_Ticket: T015170_
