# terminal-sidekick

## Purpose

Die terminal-sidekick-Capability stellt einen SSO-gegateten Live-Terminal-Zugang zu den auf
Patricks WSL-Host laufenden Agenten (opencode, hermes, claude code, agy) bereit. ttyd vor einer
persistenten tmux-Session wird über den fleet-WireGuard-Overlay erreicht; der einzige öffentliche
Einstieg ist Traefik mit einem oauth2-proxy-Gate (Pocket-ID-Gruppe `terminal-admins`) davor. Der
PTY ist niemals ungegatet erreichbar. Architektur-Präzedenz ist der RustDesk-Web-Client
(selector-loser Service → Endpoints auf der wg-Overlay-IP).

## ADDED Requirements

### Requirement: Terminal-Bridge Selector-less Service

The system SHALL expose the host-side ttyd endpoint through a Kubernetes `Service` named
`terminal-bridge` that has no pod selector, backed by a manually declared `Endpoints` object
whose single address is the wg-fleet overlay IP `${TERMINAL_OVERLAY_IP}` on port `7681`. The
manifest SHALL NOT contain any hardcoded brand-domain literal — only `${…}` placeholders.

#### Scenario: Bridge zeigt auf die Overlay-IP

- **GIVEN** das Manifest `k3d/terminal-sidekick.yaml` wird gerendert
- **WHEN** der `terminal-bridge`-Service und die zugehörigen `Endpoints` betrachtet werden
- **THEN** hat der Service keinen `selector` und Port `7681`
- **AND** das `Endpoints`-Objekt trägt die Adresse `${TERMINAL_OVERLAY_IP}` mit Port `7681`

---

### Requirement: SSO-Gate mit Pocket-ID-Gruppe

The system SHALL front the `terminal-bridge` upstream with an `oauth2-proxy-terminal` deployment
that authenticates via the Pocket-ID client `terminal-sidekick` and SHALL restrict access to
members of the `terminal-admins` group by passing `--allowed-group=terminal-admins` together with
`--oidc-groups-claim=groups`. In production the proxy SHALL set `--cookie-secure=true` and
`--cookie-samesite=none` so the terminal iframe embeds cross-origin, and SHALL read the client
secret `POCKET_ID_TERMINAL_SECRET` from `workspace-secrets`.

#### Scenario: Nur Gruppenmitglieder erhalten Zugriff

- **GIVEN** ein authentifizierter Pocket-ID-Nutzer ohne Mitgliedschaft in `terminal-admins`
- **WHEN** er `https://${PROD_DOMAIN}`-Terminal-Host aufruft
- **THEN** verweigert `oauth2-proxy-terminal` den Zugriff (403), obwohl die OIDC-Session gültig ist

#### Scenario: Proxy-Args enthalten die Gruppen-Flags

- **GIVEN** das Manifest `k3d/oauth2-proxy-terminal.yaml`
- **WHEN** die Container-Args betrachtet werden
- **THEN** enthalten sie `--client-id=terminal-sidekick`, `--allowed-group=terminal-admins` und `--oidc-groups-claim=groups`
- **AND** der Upstream ist `http://terminal-bridge:7681`

---

### Requirement: Pocket-ID-Client-Seed-Row für terminal-sidekick

The system SHALL register the OIDC client `terminal-sidekick` through the seed job
`k3d/pocket-id-client-seed.yaml` with callback URL `${SCHEME}://terminal.${SUFFIX}/oauth2/callback`,
writing a freshly generated secret back into `workspace-secrets` under key
`POCKET_ID_TERMINAL_SECRET` on first creation. Because the seed job does not configure OIDC
scopes/claims, enabling the `groups` claim on the client SHALL be a documented one-time manual step.

#### Scenario: Seed-Row vorhanden

- **GIVEN** die ROWS-Liste im Seed-Job
- **WHEN** sie geparst wird
- **THEN** existiert die Zeile `terminal-sidekick|SECRET_terminal|POCKET_ID_TERMINAL_SECRET|${SCHEME}://terminal.${SUFFIX}/oauth2/callback`
- **AND** die `SECRET_terminal`-Env-Injektion referenziert `POCKET_ID_TERMINAL_SECRET` mit `optional: true`

---

### Requirement: WireGuard Fleet-Mesh-Peer für den WSL-Host

The system SHALL declare the WSL host as a peer in the `fleet` block of
`wireguard/wg-mesh-nodes.yaml` with wg overlay IP `10.20.0.10`, matching the fleet mesh subnet
`10.20.0.0/24`, so the selector-less bridge can reach ttyd over the overlay. The env var
`TERMINAL_OVERLAY_IP` SHALL be registered in `environments/schema.yaml` and resolve to
`10.20.0.10` for the mentolder environments.

#### Scenario: Fleet-Peer im Mesh registriert

- **GIVEN** der `fleet:`-Block in `wireguard/wg-mesh-nodes.yaml`
- **WHEN** die Peer-Liste betrachtet wird
- **THEN** existiert ein Host-Eintrag mit `wg_ip: "10.20.0.10"` innerhalb des `10.20.0.0/24`-Subnetzes

#### Scenario: Overlay-IP-Var registriert

- **GIVEN** `environments/schema.yaml`
- **WHEN** die Variablenliste geladen wird
- **THEN** ist `TERMINAL_OVERLAY_IP` als Eintrag mit `validate: "^[0-9.]+$"` vorhanden

---

### Requirement: ttyd Host-Setup-Skript

The system SHALL provide an idempotent host setup script `scripts/terminal-sidekick-host.sh`
that installs ttyd if missing, creates a persistent tmux session `sidekick` with four agent
windows (opencode, hermes, claude, agy) that open shells in the repo cwd without auto-starting
the agents, and installs plus enables a systemd user unit `terminal-sidekick.service` running
`ttyd --interface <wg-fleet-IP> --writable` in front of `tmux attach -t sidekick`. Re-running the
script SHALL NOT create duplicate tmux sessions or fail on an already-installed unit.

#### Scenario: Idempotentes Re-Run

- **GIVEN** die tmux-Session `sidekick` und die systemd-Unit existieren bereits
- **WHEN** `scripts/terminal-sidekick-host.sh` erneut ausgeführt wird
- **THEN** endet das Skript mit Exit-Code 0 ohne eine zweite `sidekick`-Session anzulegen
- **AND** die vier Fenster opencode, hermes, claude, agy sind vorhanden

#### Scenario: ttyd bindet nur die Overlay-IP mit Schreibzugriff

- **GIVEN** das erzeugte systemd-User-Unit `terminal-sidekick.service`
- **WHEN** die `ExecStart`-Zeile betrachtet wird
- **THEN** enthält sie `--writable` und bindet ttyd via `--interface` an die wg-fleet-IP (nicht an `0.0.0.0`)
