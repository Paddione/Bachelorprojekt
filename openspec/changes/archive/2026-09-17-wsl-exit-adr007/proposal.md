# Proposal: wsl-exit-adr007

## Why

ADR-006 (2026-08-03) entschied „Dienste wandern zum Dev-Host": der WSL-Host
bleibt, Dienste ziehen zu ihm hin. Diese Prämisse ist hinfällig — gemessen am
2026-08-24 hat WSL bei einem 10-GB-Limit nur noch 122 MB MemFree, während
FreeToken-native Serving die vollen 64 GB Host-RAM + 16 GB VRAM braucht. Der
Dev-Host verschwindet als Linux-Laufzeitumgebung vollständig (wsl --shutdown).

Die Supersession muss dokumentiert werden, bevor die Umsetzungstickets
(T016424 ff.) Landkarten ohne ADR hinter sich lassen. Zusätzlich: Der
NTFS-Checkout auf Windows (P0-Spike-Pfad) scheitert an CRLF-Verschmutzung,
wenn `.gitattributes` keinen eol=lf-Guard für Shell/YAML setzt.

_Ticket: T016436_ · Parent-Epic: T016422 (WSL-Exit)

## What Changes

1. **ADR-007** `docs/adr/ADR-007-wsl-exit-fleet-native-factory.md`: Kontext
   (RAM-Hunger-Messung), Entscheidung A+C (Fleet-nativer factory-runner +
   Windows-native Dev), verworfene Alternativen (Proxmox dev-vm Revival,
   Dev-in-Pod, llm-proxy-Migration), E17-Write-Authority-Bedenken
   (sdlc-cockpit-design) explizit dokumentiert.
2. **ADR-006-Header**: Status → „Superseded by ADR-007" mit Verweis und Datum.
3. **`.gitattributes`**: eol=lf-Guard für `*.sh`, `*.yaml`, `*.yml`, `*.bats`,
   `*.mjs` — Voraussetzung für den NTFS-Checkout.
4. **`docs/windows-dev-setup.md`**: Git Bash, Developer Mode (Symlinks),
   `core.symlinks=true`, git-crypt unlock; P0-Spike-Checklisten als abhakbare
   Runbook-Schritte: opencode-Windows-Viability, NTFS-Clone+git-crypt,
   Fleet→Windows:1919 über wg/NAT.
5. **`docs/WSL-BOOTSTRAP.md`**: Shutdown-Checkliste ergänzen (inkl.
   gitlab-registry-cache-Container T016428, `wsl --shutdown` als finaler Schritt).

## Impact

- Affected specs: `sdlc-isolation`
- Affected code: `docs/adr/`, `.gitattributes`, `docs/windows-dev-setup.md`,
  `docs/WSL-BOOTSTRAP.md`
- Kein Laufzeitverhalten — reine Dokumentation + Git-Attribute. Der
  eol=lf-Guard kann bei bestehenden CRLF-Dateien eine Einmal-Normalisierung
  auslösen (`task freshness:check` fängt das auf).
