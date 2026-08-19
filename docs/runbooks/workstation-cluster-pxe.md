# Runbook: Workstations per Netzwerk installieren (PXE)

Alternative zum USB-Weg ([`workstation-cluster-iso.md`](workstation-cluster-iso.md)).
Die Maschinen booten übers Netz und installieren unbeaufsichtigt — ohne
Boot-Medium.

## Warum PXE, wenn es den Stick schon gibt

Ein umgepacktes ISO ist **nicht mehr signiert**. Maschinen mit aktivem Secure
Boot verweigern den Start, und das Fehlerbild ist unspezifisch: die Maschine
ignoriert den Stick einfach.

Beim PXE-Weg wird nichts umgepackt. Ubuntus signierte `shim`, `grubnetx64` und
der signierte Kernel werden unverändert durchgereicht; von uns kommen nur die
Kernel-Parameter und die Autoinstall-Daten. **Secure Boot kann anbleiben.**

---

## 1. Server starten

```bash
sudo apt install -y dnsmasq xorriso curl gettext-base
sudo bash scripts/pxe/setup-pxe.sh \
  --ssh-key ~/.ssh/id_ed25519.pub \
  --admin-password 'geheim' \
  --node-map scripts/iso/node-map
```

Das Skript baut den Boot-Baum unter `/srv/pxe`, startet einen HTTP-Server und —
sofern möglich — dnsmasq als Proxy-DHCP. Es sagt am Ende, welcher der beiden
Boot-Wege offensteht.

Beenden mit `--stop`, Zustand mit `--status`.

### Warum Proxy-DHCP und kein eigener DHCP-Server

Der Router im Netz vergibt bereits Adressen. Ein zweiter vollwertiger
DHCP-Server würde mit ihm konkurrieren und alles im Netz gefährden, nicht nur
die Installation. Proxy-DHCP beantwortet ausschließlich die Boot-Frage; die
Adressvergabe bleibt beim Router.

---

## 2. Der Boot-Weg

### Weg A — automatischer Netzwerk-Boot

Setzt voraus, dass der Proxy-DHCP läuft. An der Workstation im Bootmenü
**„Network Boot"** / **„PXE over IPv4"** wählen. Mehr ist nicht nötig.

### Weg B — UEFI-HTTP-Boot (ohne DHCP)

Wenn UDP-Port 67 belegt ist, fällt Proxy-DHCP aus (siehe unten). Dann trägt man
die Boot-URL direkt im UEFI-Setup ein:

```
http://<server-ip>:8099/boot/bootx64.efi
```

Der Menüpunkt heißt je nach Hersteller „HTTP Boot URI", „Boot from URL" oder
liegt unter „Network Stack Configuration". Er muss dort ggf. erst aktiviert
werden.

---

## 3. Nach der Installation

Die Maschine **fährt herunter** (`--shutdown poweroff`, Voreinstellung). Das ist
Absicht: startet sie stattdessen neu und steht die Boot-Reihenfolge noch auf
Netzwerk, installiert sie sich endlos neu.

Danach Boot-Reihenfolge auf die Platte stellen, einschalten, und weiter mit dem
Cluster-Join — identisch zum USB-Weg:

```bash
openssl rand -hex 32                                                           # Token, einmal
sudo k3s-join.sh --role init   --token "$T"                                    # Node 1
sudo k3s-join.sh --role server --token "$T" --server https://<ip-node-1>:6443  # Node 2+3
```

---

## Bekannte Stolperstellen

**Port 67 ist unter WSL belegt.** Mit `networkingMode=mirrored` teilt Linux den
Netzwerkstack mit Windows, und dort hält der Hyper-V-eigene DHCP den Port. Von
Linux aus ist daran nichts zu ändern — weder `bind-dynamic` noch ein Bind auf
die konkrete Adresse helfen, weil ein DHCP-Server den Wildcard-Socket braucht.
Zwei Auswege: Weg B (HTTP-Boot), oder in einer Windows-Shell mit
Administratorrechten:

```powershell
Stop-Service SharedAccess     # danach setup-pxe.sh neu starten
Start-Service SharedAccess    # rückgängig
```

Das schaltet die gemeinsame Internetverbindung ab und kann Docker Desktop und
Hyper-V-VMs betreffen.

**GRUB landet in seiner Kommandozeile.** Dann wurde das falsche GRUB
ausgeliefert. Das `grubx64.efi` aus dem ISO hat einen lokalen `$prefix`
einkompiliert und sucht seine Konfiguration auf einem Laufwerk statt im Netz —
im Netzwerkmitschnitt fragt es nach dem eigenen Laden **keine weitere Datei**
mehr an. Nötig ist `grubnetx64.efi.signed` aus dem Paket
`grub-efi-amd64-signed`; `setup-pxe.sh` holt es automatisch.

**Arbeitsspeicher.** casper lädt das komplette ISO (~3,2 GB) ins RAM. Unter
etwa 6 GB wird es eng.

**Dauer.** Pro Maschine kommen rund 3,3 GB über das Netz. In einem
Gigabit-Netz sind das wenige Minuten, über WLAN entsprechend länger.

**Firewall auf dem Server.** TFTP (UDP 69), HTTP (TCP 8099) und Proxy-DHCP
(UDP 67, 4011) müssen erreichbar sein.

---

## Was wo liegt

| Pfad | Inhalt |
|---|---|
| `/srv/pxe/tftp/` | shim, grubnet, `grub/grub.cfg`, Kernel, initrd |
| `/srv/pxe/http/boot/` | dieselben Dateien für den HTTP-Boot-Weg |
| `/srv/pxe/http/nocloud/` | `user-data`, `meta-data` (Autoinstall) |
| `/srv/pxe/http/assets/` | `k3s-join.sh`, `assign-identity.sh`, `node-map` |
| `/srv/pxe/http/*.iso` | das Ubuntu-ISO, das casper lädt |
| `/srv/pxe/http.log` | jeder HTTP-Zugriff — die beste Diagnosequelle |
