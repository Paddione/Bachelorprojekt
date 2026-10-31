---
title: "p1-tablet-profile — Installationsvorlage, apply.sh, Runbook"
domains: [infra]
status: draft
---

# pk-tablet-inference-followup — Implementation Plan

Partial p1. Kontext: `../design.md`. Ziel-Dateien:
`scripts/pxe/autoinstall/user-data-inference.tmpl`, `scripts/llm/pk-tablet/apply.sh`,
`docs/runbooks/pk-tablet-inference.md`.

S1: `scripts/llm/pk-tablet/apply.sh` Ist 187 · nicht gebaselined · Limit 800 → Budget 613.

## Task 1 — Vorlage

In `packages` von `user-data-inference.tmpl` `libgomp1` und `iw` ergänzen, je mit
Kommentar (libgomp: llama-server-Build ist gegen OpenMP gelinkt; iw: WLAN-Powersave).
Late-Command ergänzen, der `/etc/udev/rules.d/91-wlan-powersave-off.rules` schreibt:
`ACTION=="add", SUBSYSTEM=="net", KERNEL=="wlp*", RUN+="/usr/sbin/iw dev $name set power_save off"`.
Akzeptanz: `test_print_user_data_inference_bringt_laufzeitpakete_mit` grün.

## Task 2 — apply.sh ohne WireGuard

- `--bootstrap` braucht kein `--wg-conf` mehr; Flag `--wg-conf` und der WireGuard-Block
  entfallen. Bootstrap installiert Tailscale (offizielles install.sh) und ruft
  `sudo tailscale up --hostname pk-tablet-linux` auf. Neues Flag `--ts-hostname`
  (Default `pk-tablet-linux`).
- `--bootstrap --dry-run` gibt die Schritte aus, ohne SSH:
  `tailscale install`, `tailscale up --hostname <name>`; Exit 0.
- Normaler `--dry-run` gibt zusätzlich je Port `ufw allow <port> on tailscale0` aus.
- Im Remote-Block ufw nur noch auf `tailscale0` (Schleife über `wg0` entfernen).
- Kopfkommentar und `-h`-Text anpassen (Verweis ADR-014).
Akzeptanz: `test_apply_dry_run_oeffnet_ports_nur_auf_tailscale`,
`test_apply_bootstrap_braucht_kein_wireguard` grün; `bash -n` ok.

## Task 3 — Runbook `docs/runbooks/pk-tablet-inference.md`

- Netzwerk: Betrieb über WLAN (`/etc/netplan/60-wlan.yaml`, Modus 600, Zugangsdaten nicht
  im Repo, Beispiel mit Platzhaltern), USB-Adapter nur für PXE; Dock-Befund (RTL8153 hinter
  Hub: `Tx timeout`, `hub_ext_port_status failed (err = -110)`); GRUB hing mit Dock am Boot.
- Dual-Boot-Abschnitt: ESP für Windows auf Disk 1 (diskpart/bcdboot, `bcdedit /set {bootmgr}
  device partition=S:`), safeboot-Weg für AHCI, PowerShell-Fallstrick `'{current}'` in Anführungszeichen.
- Probe-Boot-Variante mit `interactive-sections: [storage]` als Alternative zu `--disk`.
- Tailscale-Name `pk-tablet-linux`, Endpunkte `100.94.91.65:8080/8081`; WireGuard-Schritte entfernen.
- Installer legt bei interaktivem Storage `/swap.img` an → entfernen.

## Task 4 — Taskfile

`tablet:bootstrap` ohne `requires: WG_CONF`, ruft `apply.sh --bootstrap {{.CLI_ARGS}}`.
