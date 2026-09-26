# Vendor-Sync — extern bezogene Skills und Plugins nächtlich aktualisieren

**Was:** Alle Skills und Plugins, die wir von Dritten beziehen, werden jede Nacht auf die neueste Release gehoben. Danach wird geprüft, ob das Update einen unserer Flows bricht, der sie einbindet — und das wird im selben PR repariert.

**Wer führt aus:** eine Claude-Code-Cloud-Routine (nächtlich, frische Session pro Lauf). Ihr Prompt verweist auf **dieses Dokument** — Änderungen am Ablauf gehören hierher, nicht in den Routine-Prompt.

| Baustein | Pfad |
|---|---|
| Herkunfts-SSOT (Repo, Pfad, Tracking, gelockter Commit) | `docs/agent-guide/registry/vendor-lock.json` |
| Werkzeug (`status` / `update` / `check`) | `scripts/vendor-sync.py` — Tasks `agents:vendor:status\|update\|check` |
| Inventar (welche Skills `provenance: vendor` sind) | `docs/agent-guide/registry/skills.yaml` |
| Guards | `tests/spec/agent-skills/vendor-sync.bats` |
| Nächtlicher Runner (WSL Cron) | `scripts/nightly-update.sh` |

## Was abgedeckt ist

| Harness | Extern bezogen | Mechanik |
|---|---|---|
| alle vier (Claude Code, opencode, Codex, agy) | 24 Vendor-Skills unter `.opencode/skills/` (über `.claude/skills` / `.agents/skills` projiziert) | 3-Wege-Merge je Datei gegen den gelockten Upstream-Commit |
| Claude Code + opencode | `superpowers` (Git-Pin in `.opencode/package.json`, `opencode.jsonc`, `package-lock.json`) | Pin auf neueste Release-Tag; Claude Code bezieht dieselbe Version über den Marketplace |
| opencode | npm-Plugins in `.opencode/package.json` (dcp, envsitter-guard, oh-my-opencode-slim, opencode-agent-memory) | Range auf neueste Version, `package-lock.json` neu aufgelöst |

**Bewusst nicht angehoben:** `@opencode-ai/plugin` (`track: pinned`) — das Plugin-SDK folgt der installierten opencode-CLI. Die übrigen Claude-Code-Marketplace-Plugins (`enabledPlugins`) sind im Repo nicht versioniert; sie aktualisiert der Marketplace auf jeder Maschine selbst. Relevant für uns ist davon nur, was unsere Flows referenzieren — und das prüft `check` gegen den superpowers-Pin.

**Tracking:** `release` = höchste stabile SemVer-Tag (Prereleases ignoriert, optional `tag_prefix`); `branch` = Default-Branch-HEAD für Upstreams ohne Releases (`huggingface/skills`, `anthropics/skills`, `antfu/skills`).

## Ablauf eines Laufs

1. **Arbeitsbranch.** Von frischem `origin/main` auf `chore/vendor-sync-<YYYY-MM-DD>`. Gibt es bereits einen offenen PR mit Branch-Präfix `chore/vendor-sync-`, diesen Branch weiterführen (`origin/main` hineinmergen) statt einen zweiten PR zu öffnen.
2. **Update.**
   ```bash
   python3 scripts/vendor-sync.py update --report /tmp/vendor-report.json
   ```
   Exit 0 und `git status` leer → nichts zu tun, **kein PR**, Lauf endet.
   Exit 1 heißt: Konflikt, Upstream-Pfad verschwunden, npm-Fehler oder Lockfile-Fehler — alles steht im Report und wird unten abgearbeitet, nicht ignoriert.
3. **Konflikte auflösen** (`skills[].conflicts`). Die Marker (`<<<<<<< lokal` / `>>>>>>> upstream`) stehen in der Datei. Regel: Upstream-Inhalt übernehmen, **die Absicht des lokalen Patches erhalten**. Warum der Patch existiert, zeigt `git log -p -- <datei>`. Beispiele für bekannte lokale Patches: der Consent-Gate in `lavish`, die `.agents/skills/…`-Pfade in `gitops-repo-audit`, der „Framework mapping“-Block in `vitest`. Macht Upstream einen Patch überflüssig (gleiche Absicht, eigene Lösung), fällt er weg — das gehört in den PR-Text.
4. **`upstream-removed`.** Ein Skill ist am gelockten Pfad nicht mehr vorhanden. Im Upstream nach Umbenennung/Umzug suchen (`git log --follow`, `--diff-filter=R`). Gefunden → `path` im Lock korrigieren, erneut `update --only <id>`. Ersatzlos entfernt → Skill behalten, als offenen Punkt im PR nennen; nicht still löschen.
5. **Bruchanalyse** — der eigentliche Kern. Für jedes angehobene Element prüfen, ob sich eine **Schnittstelle** geändert hat, auf die ein Flow von uns baut:
   - **superpowers** (`plugins[].skills_changed`, `skills_removed`): welche der geänderten Skills referenzieren wir? `git grep -n 'superpowers:<name>' -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' ':!docs/superpowers/specs'`. Den Upstream-Diff lesen (der Klon liegt im Cache, `~/.cache/vendor-sync/`; oder `https://github.com/obra/superpowers/compare/<alt>...<neu>`). Gegen den Schichtkontrakt in `.opencode/skills/OVERVIEW.md` und die Aufrufer (`dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore`, `references/`) halten. Bruchsignale: umbenannte oder entfernte Skills, geänderte Artefaktpfade (z. B. wohin `writing-plans` den Plan schreibt), neue Pflichtschritte oder Rückfragen, die unsere autonomen Flows blockieren, geänderte Übergabe zwischen Skills (brainstorming → writing-plans → executing-plans / subagent-driven-development → finishing-a-development-branch).
   - **Vendor-Skills** (`skills[].frontmatter`, `upstream_log`): geänderter `name` → `skills.yaml`, `capabilities.yaml`, alle Referenzen anpassen. Geänderte `description` → prüfen, ob sich der Trigger mit einem unserer Projekt-Skills überschneidet. Umgezogene Skripte → lokale Pfad-Patches nachziehen.
   - **npm-Plugins** (`major: true` heißt bei 0.x auch ein Minor-Sprung): Release-Notes/CHANGELOG lesen (`npm view <pkg> repository.url`), Konfiguration in `.opencode/opencode.jsonc` und den Plugin-Configs (`.opencode/dcp.jsonc` usw.) gegen umbenannte/entfernte Optionen prüfen.
6. **Reparieren.** Brüche in **unseren** Dateien beheben (Flows, Registry, Configs, lokale Patches der Vendor-Kopie). Upstream-Code nicht umschreiben, außer als dokumentierter lokaler Patch. Ist ein Bruch nicht sicher reparierbar, das betroffene Element **nicht** anheben (`git checkout -- <pfad>`, Lock-Eintrag zurücksetzen) und im PR begründen — ein grüner PR mit einem bewusst zurückgehaltenen Update schlägt einen roten mit allem.
7. **Verifizieren** — alles muss grün sein:
   ```bash
   python3 scripts/vendor-sync.py check          # Referenzen, Konfliktmarker, Pins, Lock↔Inventar
   tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills
   bash scripts/build-test-inventory.sh          # nur falls Tests hinzukamen/entfielen
   ```
8. **PR.** Titel `chore(agents): vendor-sync <YYYY-MM-DD>`. Body: Tabelle alt → neu je Element, aufgelöste Konflikte, Bruchanalyse (was geprüft, was repariert, was zurückgehalten und warum). Die Repo-Regeln gelten unverändert (squash-merge, CI grün, Auto-Merge per Repo-Policy); den PR bis grün führen.

## Neuen Vendor-Skill aufnehmen

Eintrag in `skills.yaml` mit `provenance: vendor` **und** in `vendor-lock.json` (`repo`, `path`, `dest`, `track`, `ref` = Upstream-Commit, von dem kopiert wurde). Der Guard `vendor-sync.bats` („Lock, Inventar und Vendor-Kopien sind konsistent“) ist rot, solange eines von beiden fehlt. Ohne korrektes `ref` hält der 3-Wege-Merge lokale Abweichungen für Patches bzw. Upstream-Änderungen für Konflikte.
