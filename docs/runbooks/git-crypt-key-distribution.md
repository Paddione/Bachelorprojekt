# git-crypt-Key: Verteilung, Onboarding, Widerruf

_Ticket: T900119 · ADR-008 · Register: `devmesh/key-holders.yaml`_

Das Repo verschlüsselt `environments/.secrets/**` mit **einem symmetrischen git-crypt-Key**.
Jede Person mit dem Key liest alle Secrets, auch Prod. Deshalb gilt:

- Der Key liegt nur auf Maschinen, die im Register stehen.
- Voraussetzung auf jeder Maschine: Laufwerksverschlüsselung (BitLocker) ist aktiv.
- Ablage: `~/.config/git-crypt/bachelorprojekt.key`, Modus `600`, Eigentümer ist der
  Benutzer in der WSL-Distro.

## Transport (Vaultwarden Send)

Ausschließlich per Vaultwarden Send. Messenger-Anhänge und E-Mail sind ausgeschlossen.

1. Auf einer entsperrten Maschine den Key exportieren:
   ```bash
   cd ~/Bachelorprojekt
   git-crypt export-key /tmp/bachelorprojekt.key
   ```
2. In der Vaultwarden-Weboberfläche **Send → Neu → Datei** anlegen, `/tmp/bachelorprojekt.key`
   hochladen und setzen:
   - Löschdatum und Ablaufdatum: **24 Stunden**
   - Maximale Zugriffsanzahl: 1
   - Passwort gesetzt; das Passwort geht über einen zweiten Kanal (Signal) an die Person.
3. Exportkopie entfernen: `shred -u /tmp/bachelorprojekt.key`
4. Send-Link an die Person schicken.

Auf der Zielmaschine in der WSL-Distro (Download liegt im Windows-Downloads-Ordner):

```bash
mkdir -p ~/.config/git-crypt && chmod 700 ~/.config/git-crypt
install -m 600 "/mnt/c/Users/<Windows-Benutzer>/Downloads/bachelorprojekt.key" \
  ~/.config/git-crypt/bachelorprojekt.key
rm "/mnt/c/Users/<Windows-Benutzer>/Downloads/bachelorprojekt.key"
```

`rm` auf NTFS löscht nicht sicher. Deshalb ist BitLocker Voraussetzung. Den Windows-Papierkorb
leeren, falls die Datei über den Explorer bewegt wurde.

## Onboarding einer Maschine

Voraussetzungen: WSL-Distro (Ubuntu), `networkingMode = mirrored` in
`C:\Users\<Windows-Benutzer>\.wslconfig` (danach `wsl --shutdown`), `git` und `curl` installiert,
Key abgelegt wie oben.

```bash
curl -fsSL https://raw.githubusercontent.com/Paddione/Bachelorprojekt/main/scripts/devmesh/onboard-machine.sh \
  -o /tmp/onboard-machine.sh
bash /tmp/onboard-machine.sh --name "<Name>" --email "<GitHub-Mail>"
```

Der erste Lauf klont nach `~/Bachelorprojekt`, installiert die Toolchain über
`scripts/install-dev-tools.sh` (sudo), setzt Hooks und `merge.ours`-Treiber, setzt die
git-Identität und entsperrt git-crypt. Ohne gh-Anmeldung endet er mit Exit 1 und der Prüfung
`gh-auth`. Dann:

```bash
gh auth login
gh auth setup-git
bash ~/Bachelorprojekt/scripts/devmesh/onboard-machine.sh --verify   # erwartet: Exit 0
```

Exit-Codes: `0` arbeitsfähig, `1` Prüfung fehlgeschlagen (Name steht im Output), `2`
Vorbedingung fehlt. Commit-Signatur richtet `bash scripts/setup-dev-env.sh` ein.

Danach die Maschine in `devmesh/key-holders.yaml` eintragen (`machine`, `person`, `since` =
Datum der Key-Ablage) und per PR mergen.

## GPG-User (T900113, ersetzt das Keyfile für patrick/gekko)

**Stand 2026-09-23:** eingetragen ist patrick (`00EA78AE322FFAFDFF72244A0228D492CDA7ACA5`,
Verschlüsselungs-Unterschlüssel `6E9C70093D6F8E9E`, gültig bis 2028-04-01; #5838). gekko fehlt,
weil es noch keinen GPG-Schlüssel gibt — ein SSH-Key (`ssh-ed25519`) taugt dafür nicht (T900343).
Welche Schlüssel eingetragen sind: `git ls-tree -r --name-only origin/main .git-crypt/keys/default/0/`.

### Unlock ohne Keyfile

`git-crypt unlock` **ohne Argument** sucht in `.git-crypt/keys/default/0/` nach einem Eintrag, zu
dem der lokale GPG-Keyring den privaten Schlüssel hat. Welches `gpg` es aufruft, bestimmt
`git config gpg.program` (Default: `gpg` im PATH). Prüfen danach: eine Datei unter
`environments/.secrets/` beginnt mit Klartext statt mit `\0GITCRYPT\0`, `git status` ist sauber.

| Umgebung | Privater Schlüssel liegt in | Befehl |
|---|---|---|
| WSL auf PK-Desktop (getestet 2026-09-23) | Windows-GnuPG (`gpg.exe`) | `git config gpg.program "/mnt/c/Program Files/GnuPG/bin/gpg.exe" && git-crypt unlock` |
| Windows Git Bash | Windows-GnuPG (Gpg4win) | `git config gpg.program "C:/Program Files/GnuPG/bin/gpg.exe" && git-crypt unlock` |
| Linux / dev-shell | lokaler `~/.gnupg` | `export GPG_TTY=$(tty) && git-crypt unlock` |

Der WSL-Weg braucht keinen Schlüssel-Import nach WSL: der private Schlüssel bleibt im
Windows-Keyring. Ein WSL-`gpg` ohne privaten Schlüssel scheitert mit „no GPG secret key
available to unlock this repository". Fehlt jeder GPG-Weg, bleibt das Keyfile aus
„Onboarding einer Maschine" der Rückfall: `git-crypt unlock <keyfile>`.

Für Agenten (Claude Code, opencode, agy): der Haupt-Checkout auf PK-Desktop ist bereits per
Keyfile entsperrt; neue Worktrees übernehmen das über `scripts/worktree-create.sh`. Einen frischen
Klon entsperrt ein Agent nach der Tabelle oben — nie Klartext-Kopien von Secrets oder des
entschlüsselten Repo-Schlüssels liegen lassen.

Voraussetzungen im dev-shell (Linux-Zeile):

- `export GPG_TTY=$(tty)` in der Shell (pinentry findet das Terminal),
- gpg-agent mit begrenzter Lebensdauer: `default-cache-ttl 3600`, `max-cache-ttl 7200`
  in `~/.gnupg/gpg-agent.conf`,
- die GPG-Private-Keys liegen unter `/home/dev` (Threat-Modell T900110: seit #5537 hat
  die Website-Identität keinen lesenden Zugriff mehr auf fremde Home-Verzeichnisse —
  der entsperrte Clone unter `/home/dev` ist für sie nicht lesbar).

### Einen GPG-User hinzufügen

Auf einer entsperrten Maschine mit sauberem Arbeitsbaum. Gebraucht wird nur der
**öffentliche** Schlüssel der Person, mit einem Unterschlüssel für Verschlüsselung (`e`):

```bash
gpg --import <person>.pub.asc
git-crypt add-gpg-user --no-commit --trusted <fingerprint>
gpg --list-packets .git-crypt/keys/default/0/<fingerprint>.gpg | grep keyid   # Ziel-Unterschlüssel prüfen
git add .git-crypt/
git commit -m "chore(T<ticket>): add git-crypt GPG user <person> [T<ticket>]"
```

`--no-commit` hält den Commit in der eigenen Hand (Commit-Konventionen, PR-Pfad).

## Widerruf

Ein symmetrischer Key lässt sich nicht für eine Person sperren. Wer den Key hatte, kann jeden
bisher gepushten Stand entschlüsseln. Widerruf eines Eintrags bedeutet deshalb immer alle drei
Pflichtschritte:

1. **Neuer Key.** Auf PK-Desktop im entsperrten Haupt-Clone mit sauberem Arbeitsbaum:
   ```bash
   mv .git/git-crypt ".git/git-crypt.old-$(date +%F)"
   git-crypt init
   ```
2. **Re-Encryption.** Alle verwalteten Dateien mit dem neuen Key neu einchecken:
   ```bash
   git rm -r --cached -q environments/.secrets
   git add environments/.secrets
   bash scripts/git-crypt-guard.sh check-staged
   git commit -m "chore(security): git-crypt-Key erneuert [T<ticket>]"
   ```
   Bestehende Worktrees tragen eine Kopie des alten Keys unter
   `.git/worktrees/<name>/git-crypt/keys/default` und werden entfernt oder neu angelegt.
3. **Rotation aller Secrets.** Jeder Wert unter `environments/.secrets/` (Passwörter, Tokens,
   SSH-Keys) wird ersetzt, danach `task env:seal ENV=<env>` pro Umgebung und Deploy. Ohne
   Rotation bleibt der widerrufene Halter über die Git-Historie lesefähig.

Anschließend den neuen Key per Transport an alle verbleibenden Halter verteilen,
`.git/git-crypt.old-*` mit `shred -u` löschen und den widerrufenen Eintrag aus
`devmesh/key-holders.yaml` entfernen.
