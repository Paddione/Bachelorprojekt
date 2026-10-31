---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-25
---

# pxe-inference-tablet — Design

## Ziel

PK-Tablet (Intel Iris iGPU, 16 GB RAM, 32-GB-SSD, Boot über USB-NIC
`84:3a:5b:cb:12:89`) wird per vorhandenem PXE-Weg mit Ubuntu Server minimal
neu installiert und läuft danach ausschließlich als Inferenz-Endpoint
(llama.cpp, Vulkan). Welche Modelle laufen (Loadout), ist ohne Neuinstallation
vom Dev-Rechner aus austauschbar.

## Entscheidungen (vom User freigegeben 2026-10-25)

- **D1 — PXE-Profil.** `scripts/pxe/setup-pxe.sh --profile cluster|inference`,
  Default `cluster` (bestehende Aufrufe unverändert). `inference` rendert
  `scripts/pxe/autoinstall/user-data-inference.tmpl`: `ubuntu-server-minimal`,
  kein Swap, `--disk` Pflicht, kein k3s/iscsi, Lid-Switch ignoriert,
  Sleep-Targets maskiert.
- **D2 — Loadout im bekannten Schema.** `devmesh/pk-tablet/loadouts.json` im
  Format von `scripts/llm/loadouts.json`, validiert durch `parseLoadouts()`
  (`scripts/llm-proxy/loadouts.mjs`). Download-Quellen stehen NICHT im Loadout
  (`LOADOUT_KEYS` ist fail-closed), sondern in `devmesh/pk-tablet/models.json`
  (Modellpfad → URL + sha256).
- **D3 — Tausch vom Dev-Rechner.** Kein Node auf dem Gerät. Der Dev-Rechner
  rendert mit `buildServerArgv()` (`scripts/llm-proxy/runner.mjs:81`) je
  aktivem Loadout eine argv-Datei und spielt sie per SSH ein; auf dem Gerät
  startet die Template-Unit `llama-server@<slug>.service` sie. Ein Lauf von
  `task llm:tablet:apply` installiert den gepinnten llama.cpp-Build, lädt
  fehlende Modelle (sha256-geprüft), löscht nicht mehr referenzierte Modelle
  (32-GB-Platte), schaltet Units ein/aus, setzt ufw-Regeln und prüft `/health`.
- **D4 — Nur der Adapter.** Im Profil `inference` ist `--only-mac` Pflicht;
  dnsmasq beantwortet dann nur PXE-Anfragen dieser MAC
  (`dhcp-mac=set:target,<mac>` + `tag:target` an `pxe-service`/`dhcp-boot`).
- **D5 — Keine Secrets im PXE-HTTP.** `/srv/pxe/http` ist im LAN ohne Auth
  lesbar. WireGuard-Config (`192.168.100.12`, Glied der Rerank-Kette) und
  Tailscale-Login kommen per `task llm:tablet:bootstrap` über SSH.
- **D6 — Tests prüfen Befehlsausgaben** (`--print-user-data`,
  `--print-dnsmasq-conf`, Render-Ausgabe, `apply.sh --dry-run`).

## Grundsatz Install vs. Apply

Die Installation liefert nur Basis, SSH, Benutzer `llama`, Verzeichnisse und
Energie-Einstellungen. Alles Inferenz-Spezifische (Binary, Units, Governor,
Firewall-Ports, Modelle) kommt über `apply` — damit sind Korrekturen und
Loadout-Wechsel nie eine Neuinstallation.

## Gerätelayout

| Pfad | Inhalt |
|---|---|
| `/opt/llama/<build>/` | entpacktes `llama-<build>-bin-ubuntu-vulkan-x64.zip` |
| `/opt/llama/current` | Symlink auf den aktiven Build |
| `/opt/llama/run-loadout.sh` | liest `/etc/llama/<slug>.argv` (eine Zeile je Argument), `exec`t llama-server |
| `/etc/llama/<slug>.argv` | gerenderte argv |
| `/var/lib/llama/models/` | GGUF-Dateien, Pfade wie im Loadout-`model` |
| `/etc/systemd/system/llama-server@.service` | Template-Unit, `User=llama`, `SupplementaryGroups=render video` |

## Risiken

- R1 USB-NIC muss in der Firmware als Netzwerk-Boot erscheinen (User: ja).
- R2 32-Bit-UEFI würde `bootx64.efi` verweigern — Prüfung im Runbook.
- R4 Windows/LM Studio auf dem Tablet wird überschrieben.
- R5 Vulkan-Leistung unter Mesa ANV vorab per Live-USB + `llama-bench` messen
  (Runbook-Schritt, kein Code).
