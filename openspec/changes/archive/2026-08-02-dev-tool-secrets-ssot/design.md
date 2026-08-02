---
title: "Dev-Tool-Secrets zentralisieren — eine SSOT, Injektion beim Install, gitleaks als Gegenscan"
ticket_id: T002214
domains: [infra, security]
status: planning
plan_ref: openspec/changes/dev-tool-secrets-ssot/tasks.md
---

# Design — dev-tool-secrets-ssot

## Purpose

Drei Harness-Config-Dateien sind vollständig git-crypt-verschlüsselt, obwohl sie fast nur
Konfiguration enthalten. Die enthaltenen Token sind über mehrere Dateien dupliziert, und seit
T002213 ist der Bootstrap für eine frische Maschine kaputt. Dieser Change legt eine einzige
Secret-Quelle an, injiziert sie beim Installieren, und schließt die Guard-Lücke, die durch das
Entschlüsseln von Config-Dateien überhaupt erst entsteht.

## Leitsatz

**Eine Datei ist entweder Secret-Tresor oder Konfiguration — nie beides.**

git-crypt ist ein *Datei*-Schalter, kein *Feld*-Schalter. Sobald ein einzelnes Token in einer
Config-Datei landet, wird die gesamte Datei unlesbar: Permissions, Hooks, aktivierte Plugins,
Marketplaces. Genau die Einträge also, die im PR-Diff sichtbar sein sollten — ein `PreToolUse`-Hook,
der bei jedem Toolaufruf ein Skript startet, gehört in ein lesbares Review.

## Ausgangslage

| Datei | Secrets | Config-Einträge | Status |
|---|---|---|---|
| `.claude/settings.json` | 2 | 58 | gelöst in T002213 (PR #3253) |
| `dotfiles/agy/settings.json` | 2 — **dieselben Token** | 50 | offen |
| `dotfiles/opencode/config.json` | 1 (`provider.opencode.options.apiKey`) | 14 | offen |
| `deploy/mcp/claude-code-secrets.yaml` | — | — | **Datei existiert nicht mehr**, steht aber in `.gitattributes` |
| `environments/.secrets/**` (9 Dateien) | alles | 0 | **korrekt** — bleibt unangetastet |

Das Repository ist **public**. Die Verschlüsselung schützt heute; jeder Schritt, der sie löst,
muss vorher verifiziert werden.

## Zwei Befunde, die den Entwurf bestimmen

### `dotfiles/install.sh` existiert bereits

Das Skript installiert die Harness-Configs auf eine neue Maschine (`opencode/config.json` →
`~/.config/opencode/`, `agy/settings.json` → `~/.gemini/antigravity-cli/`, `openclaw/.env` →
`~/.openclaw/`). Ein zweites Bootstrap-Skript daneben wäre Doppelung — die Secret-Injektion
gehört an diesen Ort.

Bemerkenswert: `install.sh:31-33` dokumentiert das Duplikat-Problem bereits, statt es zu lösen:

```
3. Key rotation: GITHUB_PAT + Braintrust keys exist in TWO places:
     .claude/settings.json  (canonical)
     dotfiles/agy/settings.json  (copy for Agy — update both after rotation)
```

### Dieser Hinweis ist seit T002213 falsch — und die Lücke ist real

`.claude/settings.json` ist nicht mehr „canonical": die Token stehen dort nicht mehr. Und
`install.sh` installiert `~/.claude/settings.json` überhaupt nicht. Nach `git clone` +
`git-crypt unlock` + `install.sh` fehlen auf einer frischen Maschine jetzt die Claude-Code-Token.
T002213 hat diese Lücke aufgerissen; dieser Change schließt sie.

## Entwurf

### 1. SSOT: `environments/.secrets/dev-tools.yaml`

Alle Dev-Tool-Secrets an einem Ort, git-crypt-verschlüsselt wie die übrigen Secret-Dateien.

Zwei Vorbedingungen sind geprüft:

- **Präzedenz für Nicht-Env-Dateien** in diesem Verzeichnis existiert: `sealed-secrets-key.fleet.yaml`
  und `wireguard/` liegen dort, ohne ein Environment zu sein.
- **`env-validate --drift` stört sich nicht daran.** Die Env-Discovery iteriert über
  `environments/*.yaml` (`scripts/env-validate.sh:147-152`), nicht über `.secrets/`. Eine neue
  Datei dort wird nicht als Environment fehlinterpretiert.

### 2. Injektion in `dotfiles/install.sh`

Das Skript liest die SSOT und setzt die Werte beim Installieren in die Zieldateien. Die
Repo-Dateien bleiben secret-frei. `task dev:bootstrap` wird ein dünner Wrapper — der
`dev:`-Namespace existiert bereits (18 Targets). Der veraltete Merkzettel in Z.31-33 entfällt.

### 3. Schreibmodus: Merge statt Überschreiben — für die User-Configs

Hier liegt die einzige echte Fallgrube des Entwurfs. `install.sh` macht heute `cp`, was für die
reinen dotfiles-Ziele richtig ist: die Datei im Repo *ist* die Wahrheit.

Für `~/.claude/settings.json` und `~/.config/opencode/config.json` gilt das **nicht** — sie
enthalten manuell gepflegte Einstellungen (`askUserQuestionTimeout`, `editorMode`, `worktree`,
`skillOverrides`, …). Ein `cp` würde sie zerstören.

Deshalb: der Bootstrap setzt per `jq` **ausschließlich die Secret-Felder** und lässt alles andere
unangetastet. Idempotent, mehrfach ausführbar, kein Datenverlust. Das `cp` bleibt für
`dotfiles/openclaw/.env` und die agy-Zieldatei bestehen.

### 4. Repo-Dateien entschlüsseln

`dotfiles/agy/settings.json` und `dotfiles/opencode/config.json` verlieren ihre Secrets und ihren
`.gitattributes`-Eintrag — dasselbe Vorgehen wie bei `.claude/settings.json`.

**Reihenfolge ist sicherheitskritisch und nicht verhandelbar:** erst Secrets raus, dann
`.gitattributes`, dann stagen. Jeder Schritt wird verifiziert — der gestagte Blob gegen den
`GITCRYPT`-Magic-Header *und* gegen die konkreten Token-Werte. Das Vorgehen hat sich in T002213
bewährt und wird hier wiederholt, nicht abgekürzt.

### 5. gitleaks als Gegenscan

`scripts/git-crypt-guard.sh` prüft nur **eine** Richtung: dass als git-crypt markierte Dateien
auch wirklich verschlüsselt sind (Magic-Header, pre-commit + CI). Es gibt keinen Scan, der ein
Secret in einer *unmarkierten* Datei findet.

Solange alles verschlüsselt war, deckte die Markierung das ab. Nach T002213 ist
`.claude/settings.json` unmarkiert, nach diesem Change kommen zwei weitere Dateien dazu — ohne
Gegenscan tauscht man eine grobe Absicherung gegen keine. Der bestehende CI-Secret-Scan deckt nur
`k3d/*.yaml` ab.

gitleaks fügt sich in die vorhandene `pre-commit`-Guard-Kette ein (agent-lock → agent-collision →
git-crypt-guard → bonsai-write-guard) und läuft zusätzlich in CI.

### 6. gitleaks-Scope: verschlüsselte Pfade ausschließen

Alle in `.gitattributes` als git-crypt markierten Pfade werden ausgenommen. Zwei Gründe:

- **Arbeitsteilung.** Dort ist `git-crypt-guard.sh` zuständig und prüft genau das Richtige.
  gitleaks deckt die Gegenrichtung ab — unverschlüsselte Dateien.
- **Rauschen.** Verschlüsselte Blobs haben maximale Entropie. Ein Voll-Scan produzierte
  vermutlich hunderte Treffer, und eine lange Ignore-Liste verdeckt später echte Funde.

### 7. Karteileiche entfernen

`deploy/mcp/claude-code-secrets.yaml` steht in `.gitattributes`, die Datei existiert nicht mehr.

## Trade-offs und verworfene Alternativen

**Verworfen: neues `task dev:bootstrap` neben `install.sh`.** Zwei Wege, die dasselbe halb tun —
genau das Muster, das dieser Change auflöst.

**Verworfen: Vaultwarden als Quelle.** Die Plattform betreibt einen Passwort-Manager, und
konzeptionell wäre er der richtige Ort. Praktisch scheitert es am Henne-Ei-Problem beim ersten
Login, an der `bw`-CLI-Abhängigkeit und daran, dass Offline- und CI-Fälle einen Fallback bräuchten.
Zurückgestellt, nicht ausgeschlossen.

**Verworfen: nur User-Scope ohne SSOT.** Wäre sofort fertig (so ist `.claude/settings.json` heute
gelöst), aber nicht versioniert: auf einem zweiten Rechner oder nach Neuinstallation beginnt die
Handarbeit von vorn, und eine Rotation muss man sich merken.

## Was NICHT im Scope ist

- **`environments/.secrets/**`** — dort ist git-crypt korrekt eingesetzt.
- **Token-Rotation.** Die alten Blobs bleiben verschlüsselt in der Historie; beide Token sind dort
  weiterhin enthalten. Kein neues Leak, aber eine Rotation wäre der saubere Abschluss — eine
  Entscheidung, kein Automatismus.
- **Maschinenspezifische absolute Pfade** in den Configs (`/home/patrick/.local/bin/…`,
  `~/.claude/hooks/cbm-*`). Sie funktionieren nur auf einem Rechner und sind seit T002213 öffentlich
  sichtbar. Kein Sicherheitsproblem, eigener Kandidat.

## Risiken

| Risiko | Behandlung |
|---|---|
| gitleaks ist nicht installiert; ein hart fehlschlagender pre-commit-Hook blockiert jede Maschine ohne das Tool | Hook **fail-open** bei fehlendem Binary (mit Hinweis), CI **fail-closed** über die offizielle Action oder einen Install-Schritt |
| Ein `cp` auf `~/.claude/settings.json` zerstört lokale Einstellungen | jq-Merge ausschließlich der Secret-Felder; Idempotenz wird getestet |
| Beim Entschlüsseln bleibt ein Secret unentdeckt in der Datei | Verifikation gegen Magic-Header **und** konkrete Token-Werte vor dem Commit; das Repo ist public, deshalb kein Verlass auf Augenschein |
| Die SSOT wird als Environment fehlinterpretiert | Belegt: Env-Discovery liest `environments/*.yaml`, nicht `.secrets/`. Wird im Verify-Task mit `env:validate --drift` gegengeprüft |

## Verifikation

`task test:all`, `task freshness:check`, dazu ein neuer BATS-Guard, der prüft, dass die drei
entschlüsselten Config-Dateien keine Secret-Muster enthalten — damit der Zustand nicht still
zurückfällt.
