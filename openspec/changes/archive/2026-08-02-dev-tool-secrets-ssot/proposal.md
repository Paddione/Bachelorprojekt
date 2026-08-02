# Proposal: dev-tool-secrets-ssot

## Why

Drei Harness-Config-Dateien sind vollständig git-crypt-verschlüsselt, obwohl sie fast nur
Konfiguration enthalten — `.claude/settings.json` (2 Secrets / 58 Config-Einträge, gelöst in
T002213), `dotfiles/agy/settings.json` (2 / 50) und `dotfiles/opencode/config.json` (1 / 14).
git-crypt ist ein Datei-Schalter, kein Feld-Schalter: ein einzelnes Token macht die ganze Datei
unlesbar, inklusive Permissions, Hooks und aktivierter Plugins. Genau die Einträge also, die im
PR-Diff sichtbar sein sollten.

Die Token sind zudem **dupliziert** — `dotfiles/agy/settings.json` enthält dieselben beiden wie
`.claude/settings.json`. `dotfiles/install.sh:31-33` dokumentiert das bereits als Merkzettel
("update both after rotation"), statt es zu lösen. Bei einer Rotation führt eine übersehene Kopie
zu einem stillen Fehlschlag statt einer Fehlermeldung.

Zwei Lücken machen die Sache dringlich:

1. **Der Bootstrap ist seit T002213 kaputt.** `install.sh` bezeichnet `.claude/settings.json` als
   „canonical", aber die Token stehen dort nicht mehr — und die Datei wird von `install.sh` gar
   nicht installiert. Auf einer frischen Maschine fehlen nach `git clone` + `git-crypt unlock` +
   `install.sh` jetzt die Claude-Code-Token.
2. **Es gibt keinen Gegenscan.** `scripts/git-crypt-guard.sh` prüft nur, dass *markierte* Dateien
   verschlüsselt sind. Kein Guard findet ein Secret in einer *unmarkierten* Datei; der
   CI-Secret-Scan deckt nur `k3d/*.yaml` ab. Solange alles verschlüsselt war, deckte die Markierung
   das ab — nach dem Entschlüsseln von Config-Dateien tauscht man ohne Gegenscan eine grobe
   Absicherung gegen keine.

Das Repository ist **public**.

## What

**Leitsatz: Eine Datei ist entweder Secret-Tresor oder Konfiguration — nie beides.**

1. **SSOT** `environments/.secrets/dev-tools.yaml` (git-crypt) als einzige Quelle aller
   Dev-Tool-Secrets. Präzedenz für Nicht-Env-Dateien dort existiert; `env-validate --drift`
   iteriert über `environments/*.yaml` und nicht über `.secrets/`, wird also nicht gestört.
2. **`dotfiles/install.sh` erweitern** statt ein zweites Bootstrap-Skript danebenzustellen: es
   liest die SSOT, injiziert die Werte beim Installieren und schreibt zusätzlich
   `~/.claude/settings.json`. `task dev:bootstrap` wird dünner Wrapper.
3. **Merge statt Überschreiben** für die User-Configs: der Bootstrap setzt per `jq` ausschließlich
   die Secret-Felder. `~/.claude/settings.json` und `~/.config/opencode/config.json` enthalten
   manuell gepflegte Einstellungen, die ein `cp` zerstören würde.
4. **`dotfiles/agy/settings.json` und `dotfiles/opencode/config.json` entschlüsseln** — Secrets
   raus, `.gitattributes`-Eintrag weg, in dieser Reihenfolge und Schritt für Schritt verifiziert.
5. **gitleaks** als repo-weiter Gegenscan in `.githooks/pre-commit` (fail-open ohne Binary) und in
   CI (fail-closed).
6. **Scope-Trennung:** gitleaks nimmt die git-crypt-markierten Pfade aus — dort ist
   `git-crypt-guard.sh` zuständig, und die Blobs würden als maximale Entropie massenhaft
   Falsch-Positive erzeugen.
7. **Karteileiche** `deploy/mcp/claude-code-secrets.yaml` aus `.gitattributes` entfernen.

Nicht im Scope: `environments/.secrets/**` (dort ist git-crypt korrekt), Token-Rotation (die alten
Blobs bleiben verschlüsselt in der Historie — eine Entscheidung, kein Automatismus), und die
maschinenspezifischen absoluten Pfade in den Configs.

_Ticket: T002214_
