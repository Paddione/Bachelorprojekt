# Delta Spec: sdlc-isolation (wsl-exit-adr007)

## MODIFIED Requirements

### Requirement: SDLC-Topologie ist dokumentiert und ADR-geprüft

Die SDLC-Topologie (wo läuft Factory, wo laufen Daten, wo läuft die
agentische Laufzeit) MUSS durch einen aktuellen ADR gedeckt sein. Superseded
ADRs MÜSSEN ihren Status-Header auf „Superseded by …" setzen und den
Nachfolger benennen.

#### Scenario: WSL-Exit ersetzt die Dev-Host-Prämisse

- **GIVEN** ADR-006 setzt voraus, dass der Dev-Host (WSL2) als Linux-Laufzeit
  bestehen bleibt
- **WHEN** der Operator den WSL-Exit beschließt (Host stilllegen, Factory
  fleet-nativ, Dev Windows-nativ)
- **THEN** existiert ADR-007 mit der neuen Topologie und ADR-006 trägt im
  Header „Superseded by ADR-007"

## ADDED Requirements

### Requirement: Windows-nativer Checkout bleibt LF-normalisiert

Repository-Sourcen, die unter Linux interpretiert werden (`*.sh`, `*.yaml`,
`*.yml`, `*.bats`), MÜSSEN per `.gitattributes` auf `eol=lf` erzwungen werden,
damit ein NTFS-Checkout unter Windows keine CRLF-Verschmutzung einführt.

#### Scenario: Clone auf NTFS mit core.autocrlf-Risiko

- **GIVEN** ein Operator klont das Repo auf einem NTFS-Laufwerk (Git Bash,
  Developer Mode)
- **WHEN** der Checkout ausgepackt wird
- **THEN** enthalten Shell-/YAML-Dateien ausschließlich LF-Zeilenenden und
  `bash scripts/factory/wakeup.sh --help` läuft ohne `\r`-Fehler

### Requirement: Windows-Dev-Einstieg ist als Runbook dokumentiert

Der Windows-native Entwicklungspfad MUSS in `docs/windows-dev-setup.md`
beschrieben sein, einschließlich der drei P0-Spikes als abhakbare Runbook-
Schritte (opencode-Windows-Viability, NTFS-Clone mit Symlinks+git-crypt,
Fleet→Windows:1919 über wg/NAT).

#### Scenario: Operator startet Windows-Dev

- **GIVEN** der WSL-Host ist heruntergefahren
- **WHEN** der Operator `docs/windows-dev-setup.md` abarbeitet
- **THEN** führt jeder Spike zu einem dokumentierten Ergebnis (Messnotiz) und
  gilt als Gate für die Feat-Tickets des Epics
