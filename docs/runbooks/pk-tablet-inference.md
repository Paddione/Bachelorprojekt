# Runbook: PK-Tablet als Inferenz-Endpoint (Ubuntu minimal per PXE)

PK-Tablet (HP, Intel-Iris-Plus-iGPU, 16 GB RAM) bootet Ubuntu Server minimal
und betreibt darauf nur llama.cpp (Vulkan) für **Reranking und Embedding**
(bge-reranker-v2-m3 auf `:8080`, bge-m3 auf `:8081`). Welche Modelle laufen,
steht in [`devmesh/pk-tablet/loadouts.json`](../../devmesh/pk-tablet/loadouts.json)
und wird vom Dev-Rechner aus eingespielt — ohne Neuinstallation.

| | |
|---|---|
| Tailnet | `pk-tablet-linux`, `100.94.91.65` |
| LAN | WLAN, DHCP (Stand 2026-10-26: `10.10.0.4`) |
| Admin | `clusteradmin`, SSH-Key |
| Im llm-proxy (devmesh) | Service `llm-gateway-tablet`; Rerank primär (Priorität 5), Embedding Rückfall nach dem Cluster (15) |

Windows bleibt als zweites System erhalten (Firmware-Bootmenü, F9 bei HP).

## Hardware-Befunde

**Platte: Intel Optane H10** (`HBRPEKNX0202`) — zwei Geräte auf einem Modul:
27 GB Optane und 477 GB QLC-NAND. Ubuntu liegt auf dem **Optane-Teil**,
Windows auf dem QLC-Teil. Deshalb trägt das Tablet nur kleine Modelle.

**Netz: WLAN statt USB-Adapter.** Der USB-Ethernet-Adapter (RTL8153,
`84:3a:5b:cb:12:89`) hängt hinter dem Hub eines USB-C-Docks. Unter Last
fällt er aus (`r8152 … transmit queue 0 timed out`, danach
`hub_ext_port_status failed (err = -110)`, `Cannot enable. Maybe the USB cable
is bad?`); das Abschalten von TSO/GSO/SG half nicht. Mit eingestecktem Dock
hing außerdem GRUB beim Booten. Der Adapter dient deshalb nur dem PXE-Boot,
der Betrieb läuft über die eingebaute WLAN-Karte (RTL8822CE). Powersave ist
per udev-Regel aus (sonst 100–300 ms Latenz, SSH-Timeouts).

---

## Neuinstallation

### 1. Windows vorbereiten (nur wenn Windows bleiben soll)

Unter Windows hängen beide H10-Teile am Intel-RST-Controller (`BusType
RAID`). Linux sieht sie erst im **AHCI**-Modus. Lag die Windows-EFI-Partition
auf dem Optane-Teil, muss Windows vorher eine eigene auf dem QLC-Teil
bekommen, sonst überschreibt die Installation sie. Alles in einer
**Admin-PowerShell**:

```powershell
manage-bde -status C:            # BitLocker an? Dann Schlüssel sichern bzw. aussetzen
Get-Partition | Sort-Object DiskNumber,PartitionNumber | Format-Table DiskNumber,PartitionNumber,DriveLetter,Type,Size
```

Liegt die `System`-Partition auf dem Optane-Teil (~27 GB), auf dem QLC-Teil
(`<n>`) eine neue anlegen:

```powershell
$dp = "$env:TEMP\esp.txt"
"select disk <n>","select partition <c-partition>","shrink desired=300","create partition efi size=260","format quick fs=fat32 label=System","assign letter=S" | Set-Content -Encoding ASCII $dp
diskpart /s $dp
bcdboot C:\Windows /s S: /f UEFI
bcdedit /set '{bootmgr}' device partition=S:
```

`bcdboot` hängt den Firmware-Eintrag nicht zuverlässig um, deshalb das
`bcdedit /set`. Neu starten, prüfen, dass Windows kommt. Dann auf AHCI
umstellen, ohne dass Windows den Treiber verliert:

```powershell
bcdedit /set '{current}' safeboot minimal
```

Neu starten, im BIOS **RST/RAID → AHCI**, Windows startet abgesichert. Dort:

```powershell
bcdedit /deletevalue '{current}' safeboot
```

> In PowerShell gehören `{current}`/`{bootmgr}` in Anführungszeichen — ohne
> meldet `bcdedit` „Der Parameter ist falsch". In `cmd` ohne.

### 2. PXE-Server auf gpu-metal

Unter WSL hält Hyper-V Port 67; `gpu-metal` hat ihn frei. Quellen dorthin
kopieren (kein Repo-Checkout nötig) und `dnsmasq-base`/`xorriso` installieren:

```bash
git archive origin/main scripts/pxe scripts/iso environments/versions.yaml | ssh gpu-metal 'mkdir -p ~/pxe-src && tar -xf - -C ~/pxe-src'
ssh gpu-metal 'sudo apt-get install -y dnsmasq-base xorriso'
ssh gpu-metal 'printf "84:3a:5b:cb:12:89  pk-tablet\n" > ~/pxe-src/scripts/iso/node-map'
scp ~/.ssh/id_ed25519.pub gpu-metal:pxe-src/tablet.pub
ssh gpu-metal 'for r in "67 udp" "69 udp" "4011 udp" "8099 tcp"; do set -- $r; sudo ufw allow in on enp3s0 to any port $1 proto $2 comment "pxe pk-tablet (temporaer)"; done'
```

`dnsmasq-base` statt `dnsmasq`: nur das Binary, kein Dienst, der auf dem
k3s-Node als zweiter DNS auf Port 53 startet.

### 3. Zielplatte wählen

Die H10-Teile heißen unter Linux `nvme0n1`/`nvme1n1` in nicht vorhersagbarer
Reihenfolge. Zwei Wege:

- **Interaktiv (so gelaufen am 2026-10-26):** Server mit einem Platzhalter
  starten, dann in `/srv/pxe/http/nocloud/user-data` `interactive-sections: []`
  → `[storage]` setzen und den `match`-Block löschen. Der Installer fragt nur
  die Platte ab: „Use an entire disk", **die ~27-GB-Platte**, LVM aus.
  Er legt dabei eine `/swap.img` an — danach entfernen (`swapoff`, Zeile in
  `/etc/fstab`, Datei löschen).
- **Probe-Boot:** mit `--disk /dev/disk-probe` starten; der Installer bricht
  vor dem Partitionieren ab und bietet eine Shell (`lsblk -d -o NAME,SIZE,MODEL`,
  Optane-Modell endet auf `…AHO`). Dann mit dem echten Pfad neu starten.

```bash
ssh gpu-metal 'cd ~/pxe-src && sudo bash scripts/pxe/setup-pxe.sh --profile inference --only-mac 84:3a:5b:cb:12:89 --disk /dev/<platte> --ssh-key ~/pxe-src/tablet.pub --node-map ~/pxe-src/scripts/iso/node-map'
```

**Kein `--wipe-disks`**, solange Windows bleiben soll — es löscht alle
eingebauten Platten.

Am Tablet: USB-Adapter direkt anschließen, im Bootmenü „Network Boot". Nach
dem Poweroff Bootreihenfolge auf „Ubuntu", **Dock beim Booten abziehen**.

Aufräumen auf gpu-metal:

```bash
ssh gpu-metal 'sudo bash ~/pxe-src/scripts/pxe/setup-pxe.sh --stop'
ssh gpu-metal 'while n=$(sudo ufw status numbered | awk -F"[][]" "/pxe pk-tablet/ {print \$2; exit}" | tr -d " "); [ -n "$n" ]; do sudo ufw --force delete "$n"; done'
```

Tote Firmware-Einträge (alte ESP) mit `sudo efibootmgr` prüfen und mit
`sudo efibootmgr -b <nnnn> -B` löschen.

### 4. WLAN (einmalig, Zugangsdaten nicht ins Repo)

Solange der USB-Adapter läuft, per SSH (`clusteradmin@<lan-ip>`):

```bash
sudo install -m 600 /dev/null /etc/netplan/60-wlan.yaml
sudo tee /etc/netplan/60-wlan.yaml >/dev/null <<'EOF'
network:
  version: 2
  wifis:
    wlp1s0:
      dhcp4: true
      dhcp4-overrides: {route-metric: 600}
      access-points:
        "<ssid>": {password: "<schluessel>"}
EOF
sudo netplan apply
```

### 5. Tailscale

```bash
task llm:tablet:bootstrap -- --host clusteradmin@<wlan-ip>
```

`tailscale up` gibt eine Login-URL aus; das Gerät erscheint als
`pk-tablet-linux` (der Windows-Teil bleibt `pk-tablet`). Kein WireGuard mehr
(ADR-014).

### 6. Loadout einspielen

```bash
task llm:tablet:apply -- --host clusteradmin@<wlan-ip> --dry-run
task llm:tablet:apply -- --host clusteradmin@<wlan-ip>
```

`apply` installiert den gepinnten llama.cpp-Build, lädt fehlende Modelle
(sha256-geprüft, setzt abgebrochene Downloads fort), löscht Modelle, die kein
aktives Loadout mehr braucht, schaltet `llama-server@<slug>.service` ein bzw.
aus, öffnet die Ports nur auf `tailscale0` und wartet auf `/health`.

Prüfen über das Tailnet:

```bash
curl -s http://100.94.91.65:8080/v1/rerank -H 'Content-Type: application/json' -d '{"query":"q","documents":["a","b"]}'
curl -s http://100.94.91.65:8081/v1/embeddings -H 'Content-Type: application/json' -d '{"input":"test"}' | head -c 200
```

## Loadout tauschen

In `devmesh/pk-tablet/loadouts.json` Einträge per `enabled` an- oder
abschalten oder neue hinzufügen (Schema wie `scripts/llm/loadouts.json`). Für
jedes neue Modell gehört ein Eintrag mit `url`, `sha256` und `bytes` nach
`devmesh/pk-tablet/models.json`. Dann `task llm:loadouts:check` und
`task llm:tablet:apply`. Alle aktiven Modelle zusammen müssen unter 20 GiB
bleiben (`test_models_list_hat_sha_und_url`).

## Was wo liegt (auf dem Gerät)

| Pfad | Inhalt |
|---|---|
| `/opt/llama/<build>/` | llama.cpp-Vulkan-Build |
| `/opt/llama/current` | Symlink auf den aktiven Build |
| `/etc/llama/<slug>.argv` | Startparameter, eine Zeile je Argument |
| `/var/lib/llama/models/` | GGUF-Dateien |
| `/etc/netplan/60-wlan.yaml` | WLAN (Modus 600) |
| `/etc/udev/rules.d/91-wlan-powersave-off.rules` | WLAN-Powersave aus |
| `journalctl -u llama-server@<slug>` | Log je Loadout |
