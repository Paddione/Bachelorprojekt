# Runbook: PK-Tablet als Inferenz-Endpoint (Ubuntu minimal per PXE)

PK-Tablet (Intel-Iris-iGPU, 16 GB RAM) wird per PXE mit Ubuntu Server minimal
neu installiert und betreibt danach nur noch llama.cpp (Vulkan) für
**Embedding und Reranking** (bge-m3 auf `:8081`, bge-reranker-v2-m3 auf
`:8080`). Welche Modelle laufen, steht in
[`devmesh/pk-tablet/loadouts.json`](../../devmesh/pk-tablet/loadouts.json) und
wird vom Dev-Rechner aus eingespielt — ohne Neuinstallation.

> **Windows, LM Studio und LM Link auf dem Tablet werden dabei überschrieben.**
> Der Rückweg ist eine Windows-Neuinstallation.

Boot läuft über den USB-Ethernet-Adapter `84:3a:5b:cb:12:89`. Die MAC gehört
dem Adapter, nicht dem Tablet: steckt er an einem anderen Gerät, gilt der
PXE-Filter für jenes. Den PXE-Server stellt `gpu-metal` im LAN (Port 67 ist dort
frei, anders als unter WSL); das Tablet ist nur Client.

## Die Platte: Intel Optane H10

Die eingebaute „SSD" ist eine Optane Memory H10 (`HBRPEKNX0202`) — zwei Geräte
auf einem Modul: 27 GB Optane und 477 GB QLC-NAND. Ubuntu kommt auf den
**27-GB-Optane-Teil**; deshalb trägt das Tablet nur die kleinen bge-Modelle.
Der QLC-Teil bleibt ungenutzt.

Unter Windows hängen beide Teile am Intel-RST-Controller (`BusType RAID`). Der
Ubuntu-Installer sieht sie erst, wenn im Firmware-Setup der Storage-Modus von
**RST/RAID (bzw. VMD) auf AHCI** steht. Danach startet Windows nicht mehr — das
ist der Punkt ohne Rückweg.

---

## 0. Zielplatte bestimmen (Probe-Boot, nichts wird geschrieben)

Unter Linux heißen die beiden Teile `nvme0n1`/`nvme1n1` in nicht vorhersagbarer
Reihenfolge. Deshalb einmal mit absichtlich ungültigem `--disk` booten:

```bash
ssh gpu-metal 'cd ~/pxe-src && sudo bash scripts/pxe/setup-pxe.sh --profile inference --only-mac 84:3a:5b:cb:12:89 --disk /dev/disk-probe --ssh-key ~/pxe-src/tablet.pub --node-map ~/pxe-src/scripts/iso/node-map'
```

Der Installer bricht vor dem Partitionieren mit „Failed to find matching
device" ab und bietet eine Root-Shell an. Dort:

```bash
cat /sys/firmware/efi/fw_platform_size   # muss 64 sein
lsblk -d -o NAME,SIZE,MODEL              # ~27 GB, Modell endet auf ...AHO -> TABLET_DISK
cat /proc/mdstat                         # steht dort ein imsm-Container: --wipe-disks noetig
```

Steht in `/proc/mdstat` ein Container aus der RST-Zeit, hält er die Geräte
fest und curtin scheitert mit `EBUSY`. Dann beim echten Lauf `--wipe-disks`
mitgeben — das löscht **beide** Teile der H10.

## 1. Hostnamen eintragen

In die lokale `scripts/iso/node-map` (nicht im Git):

```
84:3a:5b:cb:12:89  pk-tablet
```

## 2. PXE-Server starten und installieren

Auf `gpu-metal` (Quellen in `~/pxe-src`, Stand `origin/main`) den Probe-Lauf
mit `--stop` beenden und mit der echten Platte neu starten:

```bash
ssh gpu-metal 'cd ~/pxe-src && sudo bash scripts/pxe/setup-pxe.sh --profile inference --only-mac 84:3a:5b:cb:12:89 --disk /dev/<platte-aus-schritt-0> --ssh-key ~/pxe-src/tablet.pub --node-map ~/pxe-src/scripts/iso/node-map'
```

Von einem Linux-Host mit Repo-Checkout geht dasselbe mit
`task iso:pxe:tablet TABLET_DISK=/dev/<platte>`.

Am Tablet im Firmware-Bootmenü den USB-Adapter als Netzwerk-Boot wählen. Die
Installation läuft unbeaufsichtigt und endet mit **Poweroff**. Danach
Boot-Reihenfolge auf die interne Platte stellen und einschalten. Server
beenden mit `task iso:pxe:stop`.

Stolperstellen (Port 67 unter WSL, ufw, GRUB-Prompt):
[`workstation-cluster-pxe.md`](workstation-cluster-pxe.md).

## 3. Netz einrichten (einmalig)

`~/.ssh/config` auf dem Dev-Rechner:

```
Host pk-tablet
  HostName <lan-ip-des-tablets>
  User clusteradmin
```

WireGuard-Config erzeugen (nie committen), dann bootstrappen:

```bash
bash scripts/hetzner/generate-wg-conf.sh --env mentolder --node-name pk-tablet --private-key <PRIV> > /tmp/pk-tablet.conf
task llm:tablet:bootstrap WG_CONF=/tmp/pk-tablet.conf
```

`tailscale up` gibt eine Login-URL aus. Im Tailnet den Gerätenamen
`pk-tablet` prüfen. Danach den `HostName` in `~/.ssh/config` auf `pk-tablet`
(Tailnet) umstellen.

## 4. Loadout einspielen

```bash
task llm:tablet:apply -- --dry-run   # zeigt, was passieren würde
task llm:tablet:apply
```

`apply` installiert den gepinnten llama.cpp-Build, lädt fehlende Modelle
(sha256-geprüft), löscht Modelle, die kein aktives Loadout mehr braucht,
schaltet `llama-server@<slug>.service` ein bzw. aus, öffnet die Ports nur auf
`tailscale0` und `wg0` und wartet auf `/health`.

Prüfen:

```bash
curl -fsS http://pk-tablet:8081/health
curl -fsS http://pk-tablet:8081/v1/embeddings -H 'Content-Type: application/json' -d '{"input":"test"}' | head -c 200
```

## 5. Loadout tauschen

In `devmesh/pk-tablet/loadouts.json` Einträge per `enabled` an- oder
abschalten oder neue hinzufügen (Schema wie `scripts/llm/loadouts.json`). Für
jedes neue Modell gehört ein Eintrag mit `url` und `sha256` nach
`devmesh/pk-tablet/models.json`. Dann:

```bash
task llm:loadouts:check
task llm:tablet:apply
```

Ubuntu liegt auf dem 27-GB-Optane-Teil. Das Gesamtgewicht aller aktiven
Modelle muss unter 20 GiB bleiben (der Test `test_models_list_hat_sha_und_url`
prüft das); `apply` prüft zusätzlich vor dem Download den freien Platz.

## Was wo liegt (auf dem Gerät)

| Pfad | Inhalt |
|---|---|
| `/opt/llama/<build>/` | llama.cpp-Vulkan-Build |
| `/opt/llama/current` | Symlink auf den aktiven Build |
| `/etc/llama/<slug>.argv` | Startparameter, eine Zeile je Argument |
| `/var/lib/llama/models/` | GGUF-Dateien |
| `journalctl -u llama-server@<slug>` | Log je Loadout |
