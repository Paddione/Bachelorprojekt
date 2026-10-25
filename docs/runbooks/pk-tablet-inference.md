# Runbook: PK-Tablet als Inferenz-Endpoint (Ubuntu minimal per PXE)

PK-Tablet (Intel-Iris-iGPU, 16 GB RAM, 32-GB-SSD) wird per PXE mit Ubuntu
Server minimal neu installiert und betreibt danach nur noch llama.cpp
(Vulkan). Welche Modelle laufen, steht in
[`devmesh/pk-tablet/loadouts.json`](../../devmesh/pk-tablet/loadouts.json) und
wird vom Dev-Rechner aus eingespielt — ohne Neuinstallation.

> **Windows, LM Studio und LM Link auf dem Tablet werden dabei überschrieben.**
> Der Rückweg ist eine Windows-Neuinstallation.

Boot läuft über den USB-Ethernet-Adapter `84:3a:5b:cb:12:89`. Die MAC gehört
dem Adapter, nicht dem Tablet: steckt er an einem anderen Gerät, gilt der
PXE-Filter für jenes.

---

## 0. Vorab prüfen (Live-USB, nichts wird installiert)

Ubuntu-Desktop-Live-Stick booten, dann:

```bash
cat /sys/firmware/efi/fw_platform_size   # muss 64 sein — bei 32 startet bootx64.efi nicht
lsblk -o NAME,SIZE,TYPE,TRAN,MODEL       # Zielplatte (~32 GB) -> TABLET_DISK
vulkaninfo --summary                     # Intel-Gerät mit Treiber ANV muss erscheinen
```

Leistung gegen Windows vergleichen, bevor Windows weg ist: das
llama.cpp-Release `llama-<build>-bin-ubuntu-vulkan-x64.tar.gz` (Build aus
[`devmesh/pk-tablet/llama-build`](../../devmesh/pk-tablet/llama-build))
entpacken und

```bash
./llama-bench -m Qwen3.5-9B-Q4_K_M.gguf -ngl 99
```

Liegt der Wert deutlich unter dem Windows-Stand, hier abbrechen.

## 1. Hostnamen eintragen

In die lokale `scripts/iso/node-map` (nicht im Git):

```
84:3a:5b:cb:12:89  pk-tablet
```

## 2. PXE-Server starten und installieren

```bash
task iso:pxe:tablet TABLET_DISK=/dev/<platte-aus-schritt-0>
```

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
curl -fsS http://pk-tablet:1234/v1/models
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

Die Platte hat 32 GB. Das Gesamtgewicht aller aktiven Modelle sollte unter
etwa 20 GB bleiben; `apply` prüft vor dem Download den freien Platz.

## Was wo liegt (auf dem Gerät)

| Pfad | Inhalt |
|---|---|
| `/opt/llama/<build>/` | llama.cpp-Vulkan-Build |
| `/opt/llama/current` | Symlink auf den aktiven Build |
| `/etc/llama/<slug>.argv` | Startparameter, eine Zeile je Argument |
| `/var/lib/llama/models/` | GGUF-Dateien |
| `journalctl -u llama-server@<slug>` | Log je Loadout |
