---
title: "p1-pxe-profile — Inferenz-Profil für setup-pxe.sh"
domains: [infra]
status: draft
---

# pxe-inference-tablet — Implementation Plan

Partial p1. Kontext: `../design.md` (D1, D4, D5). Ziel-Dateien:
`scripts/pxe/setup-pxe.sh`, `scripts/pxe/autoinstall/user-data-inference.tmpl`,
`taskfiles/Taskfile.iso.yml`, `docs/runbooks/workstation-cluster-pxe.md`,
`docs/runbooks/pk-tablet-inference.md`.

S1: `scripts/pxe/setup-pxe.sh` Ist 617 · nicht gebaselined · Limit 800 →
Budget 183. Zielwachstum ≤ 90 Zeilen. Die Profil-Logik als Funktionen
(`render_user_data`, Profil-Validierung) schneiden, keine Duplikation des
envsubst-Aufrufs.

## Task 1 — Flags und Validierung

In `setup-pxe.sh`:

- Defaults: `PROFILE="cluster"`, `ONLY_MAC=""`.
- Neue Flags im `while`-Parser und in `usage()`:
  - `--profile <cluster|inference>`
  - `--only-mac <aa:bb:cc:dd:ee:ff>` (wird zu Kleinbuchstaben normalisiert)
  - `--print-user-data` → `ACTION="print-user-data"`
- Validierung (vor dem Werkzeug-Check, fail-closed, `die` mit Flag-Namen in
  der Meldung):
  - `PROFILE` nicht in `cluster|inference` → `die "--profile: cluster oder inference"`.
  - `ONLY_MAC` gesetzt, aber nicht `^([0-9a-f]{2}:){5}[0-9a-f]{2}$` → `die "--only-mac ..."`.
  - `PROFILE=inference` ohne `ONLY_MAC` → `die "--profile inference braucht --only-mac: sonst installiert sich jede netzbootende Maschine im LAN als Inferenz-Geraet"`.
  - `PROFILE=inference` ohne `DISK_PATH` → `die "--profile inference braucht --disk ..."`.

Akzeptanz: `bash scripts/pxe/setup-pxe.sh --ssh-key <pub> --profile inference --disk /dev/sda`
endet mit Exit ≠ 0 und nennt `only-mac`.

## Task 2 — dnsmasq-Filter (D4)

`render_dnsmasq_conf()` um einen MAC-Filter erweitern, aktiv sobald
`ONLY_MAC` gesetzt ist (unabhängig vom Profil):

```
dhcp-mac=set:target,${ONLY_MAC}
dhcp-boot=tag:efi-x86_64,tag:target,bootx64.efi,,${SERVER_IP}
pxe-service=tag:efi-x86_64,tag:target,X86-64_EFI,"Inference UEFI",bootx64.efi
```

(analog für `efi-bc`). Ohne `ONLY_MAC` bleibt die Ausgabe byte-identisch zum
heutigen Stand. `--print-dnsmasq-conf` akzeptiert `--only-mac`. Kommentar im
Block: warum der Filter (Proxy-DHCP antwortet sonst jedem PXE-Client im LAN).

## Task 3 — Vorlage `user-data-inference.tmpl`

Neue Datei `scripts/pxe/autoinstall/user-data-inference.tmpl`, gleiche
envsubst-Variablen wie `user-data-net.tmpl` (keine neuen Variablen nötig).
Inhalt:

- `source: {id: ubuntu-server-minimal}`
- identity/ssh wie die Cluster-Vorlage, `realname: "Inference Node Admin"`
- `storage.layout: direct` mit `${PXE_DISK_MATCH}`, `swap: {size: 0}`
- `packages`: `mesa-vulkan-drivers`, `vulkan-tools`, `wireguard`, `ufw`,
  `curl`, `jq`, `unzip`, `ca-certificates`, `chrony`
- `late-commands`:
  - `assign-identity.sh` + `node-map` holen und ausführen (wie Cluster-Vorlage)
  - `useradd --system --home /var/lib/llama --shell /usr/sbin/nologin --groups render,video llama`
  - `install -d -o llama -g llama /var/lib/llama/models`; `install -d /opt/llama /etc/llama`
  - `/etc/systemd/logind.conf.d/10-inference.conf` mit
    `HandleLidSwitch=ignore`, `HandleLidSwitchExternalPower=ignore`, `IdleAction=ignore`
  - `systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`
  - `ufw default deny incoming`, `ufw allow 22/tcp`, `ufw --force enable`
  - `systemctl enable chrony`
- Kein k3s-join, kein iscsi, keine Secrets (Kopfkommentar verweist auf D5:
  WireGuard/Tailscale via `task llm:tablet:bootstrap`).
- `shutdown: ${PXE_SHUTDOWN_MODE}`

## Task 4 — Rendering als Funktion + `--print-user-data`

- Den heutigen Block „PXE_EARLY_COMMANDS / PXE_DISK_MATCH / envsubst" in eine
  Funktion `render_user_data` ziehen, die nach stdout schreibt; Vorlage nach
  Profil: `cluster` → `user-data-net.tmpl`, `inference` → `user-data-inference.tmpl`.
- Der Start-Pfad schreibt `render_user_data > "${HTTP_DIR}/nocloud/user-data"`.
- `ACTION=print-user-data`: braucht `--ssh-key` (Validierung aus Task 1 läuft
  vorher), kein root, kein ISO, kein Boot-Baum. `PXE_BASE_URL` darf hier ein
  Platzhalter `http://<server-ip>:${HTTP_PORT}` sein, wenn `--server-ip` fehlt;
  der Passwort-Hash entfällt (leer), wenn `--admin-password` fehlt.
- `meta-data`: `instance-id: inference-node` im Profil `inference`.

Akzeptanz: `bash scripts/pxe/setup-pxe.sh --print-user-data --ssh-key <pub> --profile inference --only-mac 84:3a:5b:cb:12:89 --disk /dev/sda`
gibt YAML mit `ubuntu-server-minimal` aus und ohne `k3s-join`;
derselbe Aufruf ohne `--profile` enthält `k3s-join.sh` (Regression).

## Task 5 — Taskfile und Runbooks

- `taskfiles/Taskfile.iso.yml`: Task `pxe:tablet` (desc mit
  `TABLET_DISK=` Pflicht, braucht sudo):
  `sudo bash scripts/pxe/setup-pxe.sh --ssh-key "{{.ISO_SSH_KEY}}" --profile inference --only-mac "{{.TABLET_MAC}}" --disk "{{.TABLET_DISK}}" $map_arg`
  mit `vars: TABLET_MAC: '{{.TABLET_MAC | default "84:3a:5b:cb:12:89"}}'`
  und einem `preconditions`-Eintrag, der leeres `TABLET_DISK` mit Hinweis
  ablehnt. `check`-Task bleibt; er prüft `setup-pxe.sh` bereits.
- `docs/runbooks/pk-tablet-inference.md` (neu): Reihenfolge
  1. R5-Vorabmessung: Ubuntu-Live-USB, llama.cpp-Vulkan-Zip, `vulkaninfo --summary`, `llama-bench -m <gguf> -ngl 99`.
  2. R2-Prüfung: `msinfo32` → BIOS-Modus UEFI und 64-Bit (`/sys/firmware/efi/fw_platform_size` = 64 im Live-System).
  3. Zielplatte bestimmen (`lsblk -o NAME,SIZE,TYPE,TRAN` im Live-System) → `TABLET_DISK`.
  4. `node-map`-Zeile `84:3a:5b:cb:12:89  pk-tablet` in die lokale `scripts/iso/node-map`.
  5. `task iso:pxe:tablet TABLET_DISK=/dev/...`, USB-NIC in der Firmware als Netzwerk-Boot wählen.
  6. Nach Poweroff Boot-Reihenfolge auf Platte, `task llm:tablet:bootstrap`, dann `task llm:tablet:apply`.
  7. Loadout tauschen: `devmesh/pk-tablet/loadouts.json` ändern (`enabled`), `task llm:tablet:apply`.
  Hinweis: Windows/LM Studio wird überschrieben (R4).
- `docs/runbooks/workstation-cluster-pxe.md`: kurzer Abschnitt „Profil
  `inference`" mit Verweis auf das neue Runbook und `--only-mac`.

Task-Namen per Oracle gegenprüfen: `bash scripts/vda.sh oracle 'start pxe server for tablet'`.
