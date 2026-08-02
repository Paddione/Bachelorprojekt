---
title: "dev-tool-secrets-ssot — Implementation Plan"
ticket_id: T002214
domains: [infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-tool-secrets-ssot — Implementation Plan

_Ticket: T002214_

## File Structure

```
tests/spec/secrets-deploy-automation.bats   geändert   RED-Guard: Config-Dateien secret-frei
.gitleaks.toml                              neu        Scan-Konfiguration, Allowlist der git-crypt-Pfade
.githooks/pre-commit                        geändert   gitleaks als weiteres Glied der Guard-Kette
.github/workflows/ci.yml                    geändert   gitleaks-Schritt im Security-Scan-Job
environments/.secrets/dev-tools.yaml        neu        SSOT aller Dev-Tool-Secrets (git-crypt)
.gitattributes                              geändert   dev-tools.yaml rein; 3 Config-Pfade raus
dotfiles/install.sh                         geändert   Secret-Injektion + ~/.claude/settings.json
Taskfile.yml                                geändert   dev:bootstrap als Wrapper
dotfiles/agy/settings.json                  geändert   2 Secrets entfernt
dotfiles/opencode/config.json               geändert   1 Secret entfernt
openspec/changes/dev-tool-secrets-ssot/specs/secrets-deploy-automation.md   Delta-Spec
```

S1-Lage: `dotfiles/install.sh` ist mit 33 Zeilen weit unter dem `.sh`-Limit von 500 und nicht
gebaselinet. `.githooks/pre-commit` (ohne Extension) und `tests/spec/*.bats` fallen nicht unter
S1. Kein Split nötig.

**Die Reihenfolge der Tasks ist sicherheitskritisch und darf nicht umgestellt werden.** Der
Guard muss stehen, bevor entschlüsselt wird; die SSOT und der Bootstrap müssen funktionieren,
bevor die Secrets aus den Repo-Dateien verschwinden. Das Repository ist öffentlich.

Aus demselben Grund ist dieser Plan **nicht** in parallele Partials zerlegt: die Schritte sind
sequenziell voneinander abhängig, nicht disjunkt. Ein Fan-out würde die Reihenfolge aufweichen,
die hier der eigentliche Schutz ist.

Die G1-Warnungen des Linters (fünf Tasks mit „touches N files") sind ein Zähl-Artefakt: gezählt
wird jeder erwähnte Pfad, also auch `scripts/git-crypt-guard.sh` oder der bats-Runner in den
Verifikationsblöcken. Tatsächlich geändert werden pro Task ein bis drei Dateien.

## Task 1 — RED: Guard-Test, der den Zielzustand beschreibt

Erweitere `tests/spec/secrets-deploy-automation.bats` um einen Test, der prüft, dass die drei
Harness-Config-Dateien keine Secret-Muster enthalten. Er ist zu diesem Zeitpunkt **rot**, weil
`dotfiles/agy/settings.json` und `dotfiles/opencode/config.json` ihre Token noch tragen.

Der Test prüft je Datei auf bekannte Token-Präfixe (`ghp_`, `github_pat_`, `sk-`, `xox`) und auf
`env`-Schlüssel, deren Name auf `_TOKEN`, `_KEY`, `_SECRET` endet und deren Wert länger als 20
Zeichen ist. Für die bereits gelöste `.claude/settings.json` ist er sofort grün — das belegt,
dass der Test den Zielzustand korrekt beschreibt und nicht nur trivial durchläuft.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/secrets-deploy-automation.bats
# expected: FAIL — agy/settings.json und opencode/config.json enthalten noch Secrets
```

**Akzeptanz:** Der neue Test schlägt fehl und nennt genau die zwei Dateien. Die Assertion für
`.claude/settings.json` ist grün. Die übrigen Tests der Datei bleiben unverändert grün.

## Task 2 — gitleaks-Guard einziehen (VOR jeder Entschlüsselung)

`.gitleaks.toml` anlegen: Standard-Regelsatz, plus eine Allowlist mit allen in `.gitattributes`
als `filter=git-crypt` markierten Pfaden. Begründung im Datei-Kommentar festhalten — dort ist
`scripts/git-crypt-guard.sh` zuständig, und verschlüsselte Blobs haben maximale Entropie, würden
also massenhaft Falsch-Positive erzeugen.

In `.githooks/pre-commit` als weiteres Glied nach `git-crypt-guard.sh` einhängen. **Fail-open bei
fehlendem Binary**, mit sichtbarem Hinweis: gitleaks ist auf dieser Maschine nicht installiert,
und ein hart fehlschlagender Hook würde jede Maschine ohne das Tool blockieren.

In `.github/workflows/ci.yml` im bestehenden Security-Scan-Job **fail-closed** ergänzen (offizielle
Action oder Install-Schritt plus Aufruf).

```bash
bash .githooks/pre-commit          # ohne gitleaks: Hinweis, Exit 0
gitleaks detect --config .gitleaks.toml --no-git --redact ; echo "exit=$?"
# erwartet nach Installation: 0 Findings auf dem aktuellen Stand
```

**Akzeptanz:** Der Hook läuft ohne installiertes gitleaks durch und meldet den fehlenden Guard;
mit installiertem gitleaks findet der Scan auf dem aktuellen Stand nichts. Die git-crypt-Pfade
sind ausgenommen und tauchen nicht als Treffer auf. Der CI-Schritt ist fail-closed.

## Task 3 — SSOT anlegen und Bootstrap umbauen

`environments/.secrets/dev-tools.yaml` anlegen mit den drei Werten: `GITHUB_PERSONAL_ACCESS_TOKEN`,
`BRAINTRUST_API_KEY`, `OPENCODE_API_KEY`. Die ersten beiden aus `~/.claude/settings.json`
übernehmen (dort liegen sie seit T002213), den dritten aus `dotfiles/opencode/config.json`
(`provider.opencode.options.apiKey`). Pfad in `.gitattributes` als `filter=git-crypt` eintragen
und danach mit `bash scripts/git-crypt-guard.sh is-encrypted environments/.secrets/dev-tools.yaml`
verifizieren, dass der Blob den Magic-Header trägt.

`dotfiles/install.sh` umbauen:

- Die SSOT einlesen. Fehlt sie oder ist sie nicht entschlüsselt, mit klarer Meldung abbrechen —
  ein halb bootstrappter Rechner ist schlechter als ein Fehlschlag.
- `~/.claude/settings.json` **neu** schreiben, per `jq`-Merge und **ausschließlich** die
  `env`-Secret-Felder. Diese Datei wird heute gar nicht installiert; das ist die Lücke, die
  T002213 hinterlassen hat.
- `~/.config/opencode/config.json` ebenfalls per `jq`-Merge, nur `provider.opencode.options.apiKey`.
- Die agy-Zieldatei und `openclaw/.env` weiter per `cp` installieren, danach die Secret-Felder
  per `jq` nachsetzen.
- Den überholten Merkzettel in Zeile 31-33 entfernen: `.claude/settings.json` ist nicht mehr
  „canonical", und das Duplikat, vor dem er warnt, existiert nach diesem Change nicht mehr.

`Taskfile.yml` um `dev:bootstrap` als Wrapper auf `bash dotfiles/install.sh` ergänzen.

```bash
cp ~/.claude/settings.json /tmp/claude-settings.before
bash dotfiles/install.sh
diff <(jq 'del(.env)' /tmp/claude-settings.before) <(jq 'del(.env)' ~/.claude/settings.json)
# erwartet: leer — alles außerhalb von env bleibt unangetastet
jq -e '.env.GITHUB_PERSONAL_ACCESS_TOKEN and .env.BRAINTRUST_API_KEY' ~/.claude/settings.json
bash dotfiles/install.sh    # zweiter Lauf: identisches Ergebnis
```

**Akzeptanz:** Der Merge lässt alle Nicht-`env`-Schlüssel unverändert (Diff leer), setzt beide
Token, und ein zweiter Lauf ändert nichts (idempotent). Bei fehlender oder verschlüsselter SSOT
bricht das Skript mit verständlicher Meldung ab.

## Task 4 — Die zwei Config-Dateien entschlüsseln

Für `dotfiles/agy/settings.json` und `dotfiles/opencode/config.json`, **in dieser Reihenfolge je
Datei**:

1. Secret-Felder entfernen.
2. Die bereinigte Datei gegen Entropie- und Präfix-Muster prüfen und jeden Treffer einzeln
   ansehen. Bei `.claude/settings.json` waren alle acht Treffer Falsch-Positive (Hook-Kommandos,
   öffentliche GitHub-Repo-Pfade) — das ist zu belegen, nicht anzunehmen.
3. Erst danach den `.gitattributes`-Eintrag entfernen.
4. Stagen und den Blob im Index verifizieren: kein `GITCRYPT`-Magic-Header, und keiner der
   konkreten Token-Werte enthalten.

Im selben Schritt die Karteileiche `deploy/mcp/claude-code-secrets.yaml` aus `.gitattributes`
entfernen — die Datei existiert nicht mehr. An den entfernten Zeilen einen Kommentar
hinterlassen, der auf die SSOT verweist, damit dort nicht wieder ein Secret landet.

```bash
git show :dotfiles/agy/settings.json | head -c 20 | grep -q GITCRYPT && echo LEAK-RISIKO || echo klartext
bash scripts/git-crypt-guard.sh check-staged
tests/unit/lib/bats-core/bin/bats tests/spec/secrets-deploy-automation.bats
# erwartet: GREEN — der RED-Test aus Task 1 ist jetzt grün
```

**Akzeptanz:** Beide Dateien sind Klartext im Index und enthalten keinen der Token-Werte.
`git-crypt-guard.sh check-staged` bleibt grün (die verbleibenden markierten Pfade sind weiter
verschlüsselt). Der Test aus Task 1 ist grün.

## Task 5 — Delta-Spec schreiben

`openspec/changes/dev-tool-secrets-ssot/specs/secrets-deploy-automation.md` befüllen: Requirements
für die SSOT als einzige Quelle der Dev-Tool-Secrets, für die Merge-Semantik des Bootstraps
(nur Secret-Felder, idempotent) und für den gitleaks-Gegenscan mit seiner Abgrenzung zu
`git-crypt-guard.sh`. Purpose auf Deutsch, Requirements und Scenarios auf Englisch — Konvention
aus `openspec/config.yaml`.

```bash
task openspec:validate
```

**Akzeptanz:** `task openspec:validate` grün; die Delta-Datei trägt den Parent-Slug-Namen
`secrets-deploy-automation.md`.

## Task 6 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu die inhaltlichen Nachweise:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/secrets-deploy-automation.bats
bash scripts/git-crypt-guard.sh check-tracked
bash scripts/env-validate.sh --drift --schema-only
grep -c 'git-crypt' .gitattributes
```

`env-validate --drift` ist der Gegenbeweis zur Annahme aus dem Design: die neue Datei unter
`environments/.secrets/` darf die Env-Discovery nicht stören.

**Akzeptanz:** Die drei Gate-Kommandos laufen grün. Der Guard-Test ist grün.
`git-crypt-guard.sh check-tracked` bestätigt, dass alle verbliebenen markierten Pfade
verschlüsselt sind. Der Drift-Check läuft unverändert durch. In `.gitattributes` stehen drei
Pfade weniger und einer mehr als vorher.
