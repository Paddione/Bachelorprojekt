# SSH-Zugang: fleet-Cluster und Dev-Node

Wie man die fleet-Hosts per SSH erreicht und welcher Alias auf welchen Node zeigt.
Enthaelt **keine** Credentials — die Keys liegen git-crypt-verschluesselt unter
`environments/.secrets/.ssh/`.

## Grundsatz: kein Passwort, nur Keys

Alle Hetzner-Nodes akzeptieren ausschliesslich **Public-Key-Auth**. Ein Passwort
gibt es nicht; Cloud-Init legt den Key beim Provisioning ab
(`scripts/hetzner/render-cloud-init.sh --ssh-key`).

Regulaerer Zugang ist der persoenliche Account **`patrick`** mit
`~/.ssh/patrick_ed25519` (im Repo als
`environments/.secrets/.ssh/patrick_ed25519` hinterlegt). Node-Operationen —
k3s-Dienst, WireGuard, UFW — laufen darueber mit `sudo`.

> Aeltere Runbooks (`cluster-dev-node-umbau.md`) zeigen `ssh root@<ip>`. Das war
> der Provisioning-Zugang; fuer den Alltag ist `patrick` + `sudo` der Weg.

## SSOT fuer Aliase: die Repo-Config

Die Alias-Definitionen leben **nicht** in `~/.ssh/config`, sondern in der
git-crypt-verschluesselten Repo-Config:

```
environments/.secrets/.ssh/config
```

`scripts/provision-dev-vm.sh` nutzt sie ueber `ssh -F "$SSH_CONFIG"` (Default
`$REPO_ROOT/environments/.secrets/.ssh/config`) — dort sind bereits `dev` und
`dev-vm` definiert. Neue Aliase gehoeren in dieselbe Datei, damit Skripte und
Mensch denselben Namen benutzen.

Aufruf mit der Repo-Config:

```bash
ssh -F environments/.secrets/.ssh/config fleet-dev
```

Wer den Alias auch ohne `-F` will, uebernimmt den Block zusaetzlich in
`~/.ssh/config` auf der eigenen Workstation.

## Alias `fleet-dev`

Zielt auf **gekko-hetzner-2** (`178.104.169.206`) — die Dev-Node.

```
Host fleet-dev
  HostName 178.104.169.206
  User patrick
  IdentityFile ~/.ssh/patrick_ed25519
  IdentitiesOnly yes
```

`IdentitiesOnly yes` ist kein Beiwerk: ohne die Option bietet der Agent alle
geladenen Keys der Reihe nach an und laeuft bei mehreren Keys in
`Too many authentication failures`, bevor der richtige an der Reihe ist.

**Zu den Key-Namen:** im Repo liegen mehrere. `patrick_ed25519` ist der
persoenliche Zugang und hier der richtige. `gekko_ed25519` traegt den Namen des
Hosts, `scripts/llm-pull-models.sh` faellt auf `~/.ssh/id_ed25519_hetzner`
zurueck (`SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"`) und
`.claude/settings.json` nennt `~/.ssh/gekko_id_ed25519`. Wer einen davon
verwendet, weiss warum — Default ist `patrick_ed25519`.

## Control-Plane-Nodes

```
Host fleet-4
  HostName 204.168.244.104
  User patrick
  IdentityFile ~/.ssh/patrick_ed25519
  IdentitiesOnly yes

Host fleet-6
  HostName 37.27.251.38
  User patrick
  IdentityFile ~/.ssh/patrick_ed25519
  IdentitiesOnly yes

Host fleet-8
  HostName 62.238.23.79
  User patrick
  IdentityFile ~/.ssh/patrick_ed25519
  IdentitiesOnly yes
```

## Verbindung pruefen, ohne etwas zu aendern

```bash
ssh -o BatchMode=yes fleet-dev 'hostname; uptime'
```

`BatchMode=yes` laesst den Versuch sofort scheitern, statt nach einem Passwort zu
fragen — nur so ist das Ergebnis ein eindeutiges Ja/Nein zur Key-Auth.

Schlaegt es mit `Permissions 0644 ... are too open` fehl:

```bash
chmod 600 ~/.ssh/patrick_ed25519
```

Siehe `docs/superpowers/references/gotchas-footguns.md` — aus Windows-Mounts
kopierte Keys kommen regelmaessig mit `644` an.

## Wann SSH gar nicht noetig ist

Der Dev-Stack ist **kein eigener Cluster**, sondern der Namespace
`workspace-dev` auf `fleet` (siehe `environments/dev-cluster.yaml`). Fuer
Status, Logs und Rollouts reicht:

```bash
kubectl --context fleet -n workspace-dev get pods
```

SSH braucht es nur fuer Node-Ebene: k3s-Dienst, WireGuard (`wg-fleet`), UFW,
Disk.

## Aus einer Remote-/Web-Session heraus

Claude-Code-Remote-Container haben **keinen** Zugang: ausgehend ist nur HTTPS
ueber den Agent-Proxy erlaubt, rohes TCP auf `22` und `6443` ist blockiert
(gemessen am 2026-08-29 gegen alle drei CP-Nodes). Node-Zugriff ist damit
Workstation-Arbeit, nicht Session-Arbeit.

```bash
# So laesst sich das nachstellen — 'kein Durchkommen' ist das erwartete Ergebnis:
for ip in 37.27.251.38 62.238.23.79 204.168.244.104; do
  timeout 6 bash -c "cat < /dev/null > /dev/tcp/$ip/22" \
    && echo "$ip:22 OFFEN" || echo "$ip:22 kein Durchkommen"
done
```
