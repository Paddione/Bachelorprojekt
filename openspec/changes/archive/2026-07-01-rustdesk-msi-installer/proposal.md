# Proposal: rustdesk-msi-installer

## Why

Patrick und gekko installieren RustDesk wiederholt auf neuen oder neu aufgesetzten
Windows-Rechnern. Jedes Mal müssen ID-Server (`rustdesk.mentolder.de`), der Public Key des
Relays und ein Unattended-Access-Passwort manuell eingetragen werden — repetitiv und
fehleranfällig. Ein vorkonfigurierter Installer entfernt diese Reibung.

Das Repository ist öffentlich auf GitHub. Eine naive Distribution (öffentliches GitHub Release
oder öffentlich einsehbares Actions-Artifact) würde das gebackene Unattended-Passwort jedem im
Internet zugänglich machen — ein Leak ermöglicht vollen passwortlosen Fernzugriff auf die
betroffenen Rechner. Diese Spec-Delta legt fest, wie der Installer trotzdem beide Werte
automatisch einfüllt, ohne diese Exposition einzugehen.

## What

Ein WiX-gebauter Wrapper-`.msi`, der die offizielle RustDesk-MSI silent installiert und danach
per Custom Action `rustdesk.exe --config <config-string>` sowie `rustdesk.exe --password
<password>` ausführt. Beide Werte kommen aus neuen GitHub-Actions-Repo-Secrets (kein
SealedSecret-Pfad nötig, da der einzige Konsument der CI-Build-Job ist, nicht ein laufender
Pod). Gebaut wird ausschließlich manuell (`workflow_dispatch` auf `windows-latest`, dem ersten
Windows-Runner in diesem Repo). Verteilt wird die fertige MSI über eine neue, OIDC-gated
(Pocket ID) Downloads-Fläche (`downloads.mentolder.de`), einmalig in der `workspace`-Namespace
deployed — nicht über GitHub Releases/Artifacts.

Die Aktivierung des RustDesk-Web-Clients (Port 21118/21119, kehrt REQ-RUSTDESK-RELAY-004 um)
ist explizit **out of scope** dieser Änderung und als eigenständiges Folge-Ticket **T001377**
getrackt.

Vollständiges Design: `docs/superpowers/specs/2026-07-01-rustdesk-msi-installer-design.md`.

_Ticket: T001378_
