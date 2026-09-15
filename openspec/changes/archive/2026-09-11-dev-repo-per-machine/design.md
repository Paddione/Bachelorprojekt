# Design: dev-repo-per-machine

## Goals

- Eine neue Dev-Maschine ist mit einem Skriptlauf arbeitsfähig.
- Der Zustand einer bestehenden Maschine ist ohne Änderung prüfbar.
- Der git-crypt-Key hat einen definierten Transport, eine definierte Ablage und ein Register.

## Non-Goals

- Automatische Key-Rotation.
- Verwaltung von Windows-Programmen (Tailscale, LM Studio) durch das Skript.

## Kontext (gemessen 2026-09-11)

```bash
gh api repos/Paddione/Bachelorprojekt/collaborators --jq '.[] | "\(.login) \(.role_name)"'
# Paddione admin / gekko32 write
ls -la .git/git-crypt/keys/default     # -rw------- 148 Bytes, symmetrischer Key
```

## Decisions

### D1 — Clone pro Maschine

ADR-008 D4: pro Person eine physische Maschine. Ein geteilter Clone brauchte Gruppenrechte,
ACLs, `umask 002`, einen `flock`-Wrapper für `pnpm install` und einen Pull-Timer — alles
Folgen des Teilens. Mit getrennten Clones entfallen diese Mechanismen; Zusammenarbeit läuft
über Branches und PRs.

### D2 — Symmetrischer Key für gekko

Vom Operator gewählt. gekko bekommt denselben Key wie patrick und damit Lesezugriff auf alle
Secrets in `environments/.secrets/**`, auch Prod. Konsequenz: ein Widerruf lässt sich nicht
auf eine Person beschränken — er erzwingt einen neuen Key, Re-Encryption und Rotation aller
Secrets. Das Runbook beschreibt diesen Pfad vollständig; das Register macht sichtbar, welche
Maschinen betroffen sind.

### D3 — Transport per Vaultwarden Send

Vaultwarden läuft bereits (`k3d/vaultwarden.yaml`) und ist der Kanal aus
`claude-code/gekko-android-mcp-guide.md`. Ein Send mit Ablauf und Einmal-Abruf hinterlässt
keine dauerhafte Kopie. Messenger-Anhänge und E-Mail bleiben ausgeschlossen.

### D4 — Verifikation der Entschlüsselung statt Vertrauen in `git-crypt unlock`

`git-crypt unlock` kann erfolgreich enden, während Dateien verschlüsselt bleiben (z. B. bei
falschem Key in einem Worktree). Das Skript prüft deshalb eine Datei unter
`environments/.secrets/` mit `scripts/git-crypt-guard.sh is-encrypted` und erwartet das
Ergebnis „nicht verschlüsselt".

### D5 — Exit-Codes

`0` Maschine arbeitsfähig, `1` mindestens eine Prüfung fehlgeschlagen (mit Name der Prüfung),
`2` Vorbedingung fehlt (keine WSL, kein `git`, Keydatei nicht lesbar). Gleiches Muster wie in
SP-1 und SP-2.

### D6 — Keydatei-Rechte werden erzwungen, nicht nur geprüft

Liegt die Keydatei mit Modus weiter als 600 vor, setzt das Skript 600 und meldet das. Gehört
sie einem anderen Benutzer, bricht es mit Exit 1 ab.

## Risks

- **R1** Key auf drei Maschinen erhöht die Angriffsfläche. Gegenmaßnahme: Register,
  Laufwerksverschlüsselung (BitLocker) als Voraussetzung im Runbook.
- **R2** `install-dev-tools.sh` ändert sich für den bisherigen VM-Aufruf; der Aufrufer
  `provision-dev-vm.sh` entfällt im selben Change.

## Testing

- BATS `tests/spec/dev-machine-onboarding/onboard-machine.bats` mit gestubbten `git`, `gh`,
  `git-crypt`, `wslinfo`: fehlende Keydatei → Exit 2; Keydatei Modus 644 → korrigiert auf 600;
  Datei bleibt verschlüsselt → Exit 1 mit Prüfungsname; `--verify` schreibt nichts
  (Zeitstempel unverändert).
- BATS-Guard: `devmesh/key-holders.yaml` hat pro Eintrag `machine`, `person`, `since`.
- Live-Abnahme: `bash scripts/devmesh/onboard-machine.sh --verify` auf PK-Desktop, PK-L-1
  und PK-Tablet endet mit Exit 0.
