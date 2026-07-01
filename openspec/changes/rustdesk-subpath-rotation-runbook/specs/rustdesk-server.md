## ADDED Requirements

### Requirement: REQ-RUSTDESK-RELAY-006 — Secret-Rotation-Runbook für hbbs subPath-Mount
Das System SHALL dokumentieren, dass eine Rotation des `rustdesk-secrets`-Keypairs
(`id_ed25519`/`id_ed25519.pub`) einen manuellen `kubectl rollout restart` des
`hbbs`-Deployments erfordert, weil das Keypair per `subPath` gemountet ist und `subPath`-
Mounts von kubelet NICHT live in einem bereits laufenden Pod aktualisiert werden, wenn sich
das zugrunde liegende Secret ändert.

#### Scenario: Secret-Rotation erfordert manuellen Rollout-Restart
- **GIVEN** das `rustdesk-secrets`-Secret wurde rotiert (z. B. via `task env:seal` und
  erneutem Apply)
- **WHEN** der `hbbs`-Pod bereits läuft und NICHT neu gestartet wird
- **THEN** verwendet `hbbs` weiterhin das alte Keypair, weil die `subPath`-gemounteten
  Dateien `/root/id_ed25519` und `/root/id_ed25519.pub` nicht live aktualisiert werden

#### Scenario: Manueller Rollout-Restart lädt das neue Keypair korrekt
- **GIVEN** das `rustdesk-secrets`-Secret wurde rotiert
- **WHEN** `kubectl --context fleet -n rustdesk rollout restart deployment/hbbs` ausgeführt
  wird
- **THEN** wird der `hbbs`-Pod neu erstellt (Deployment-Strategie `Recreate`) und die
  `subPath`-Mounts werden beim neuen Pod-Start aus dem aktuellen Secret-Inhalt aufgebaut,
  sodass `hbbs` das neu rotierte Keypair verwendet
