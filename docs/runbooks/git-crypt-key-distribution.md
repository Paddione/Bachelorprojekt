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
