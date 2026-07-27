# Mishap-Bundle: test, repo/.gitattributes, skills/repo-hygiene — Design

## Änderungen im Überblick

| # | Bereich | Datei(en) | Änderung |
|---|---------|-----------|----------|
| 1 | test | `tests/spec/software-factory.bats` | mkdir in BATS_TEST_TMPDIR-Repo verlegen |
| 2 | repo/.gitattributes | `.gitattributes`, `docs/superpowers/references/gotchas-footguns.md` | merge=ours-Falle dokumentieren |
| 3 | skills/repo-hygiene | `.agents/skills/references/repo-hygiene-ops.md` | REST-API-Fallback für `pr update-branch` aufnehmen |

## Design Mishap 1 — software-factory.bats

### Ist-Zustand (Zelle 3436)

```bash
mkdir -p openspec/changes/x && touch openspec/changes/x/tasks.md
run bash scripts/ticket.sh stage-plan ...
rm -rf openspec/changes/x
```

Die Zelle schreibt ins echte Arbeitsverzeichnis. Das `rm -rf`-Cleanup in derselben Zelle ist unzureichend, weil es bei SIGTERN/Timeout nicht läuft.

### Soll-Zustand

Die Zelle erzeugt ein temporäres Git-Repo in `$BATS_TEST_TMPDIR`, analog zur etablierten Fixture-Technik:

```bash
TMP_REPO="$BATS_TEST_TMPDIR/repo"
mkdir -p "$TMP_REPO" && cd "$TMP_REPO"
git init -q && git config user.email t@t && git config user.name t
mkdir -p openspec/changes/x && touch openspec/changes/x/tasks.md
git add openspec/
run bash "$SCRIPT" stage-plan --id T000001 --branch feature/x --plan openspec/changes/x/tasks.md
```

**Referenz:** `tests/unit/check-commit-vs-diff.bats:62-67` (gleiches Muster, funktioniert zuverlässig).

**Voraussetzung:** Die Zelle muss `$SCRIPT` entweder relativ zum Test-TMPDIR auflösen oder den Absolutpfad zu `scripts/ticket.sh` nutzen (`bash "$BATS_TEST_DIRNAME/../../scripts/ticket.sh"`).

## Design Mishap 2 — .gitattributes merge=ours Phantom-Konflikte

### Dokumentation in gotchas-footguns.md

Neuer Eintrag unter dem Abschnitt "Git & GitHub":

```markdown
### `.gitattributes merge=ours` — Phantom-Konflikte auf GitHub

Mehrere generierte Artefakte (siehe `.gitattributes`) sind mit `merge=ours` markiert.
Lokal löst git dies still auf. GitHub führt **keine** Custom-Merge-Driver aus und
meldet stattdessen merge conflicts, die lokal nicht reproduzierbar sind.

**Symptom:** `gh pr view <n> --json mergeStateStatus -q .mergeStateStatus` → `DIRTY`,
aber `git merge-tree --write-tree origin/main HEAD` → exit 0 (kein Konflikt).

**Fix:** In den Branch committen, was auch immer sauber ist, dann per
`gh api -X PUT repos/Paddione/Bachelorprojekt/pulls/<n>/update-branch \
  -f expected_head_sha=$(git rev-parse HEAD)` den Server-Zustand neu berechnen lassen.
```

### Keine Änderung an .gitattributes selbst

Die `merge=ours`-Einstellungen sind lokal korrekt und nützlich (verhindern Konflikt-Noise bei lokalen Rebases). Der Fehler ist das fehlende Bewusstsein, dass GitHub sie nicht ehrt.

## Design Mishap 3 — gh pr update-branch REST-Fallback

### Änderung in repo-hygiene-ops.md §3

An den bestehenden Abschnitt "PR-Triage → verknüpftes Ticket schließen" wird ein Sub-Abschnitt angehängt:

```markdown
* **PR-Branch aktualisieren (gh-CLI-Version-abhängig):**
  Die `gh pr update-branch`-Subcommand existiert erst ab gh 2.50+.
  Ältere Versionen müssen den REST-API-Fallback nutzen:
  ```bash
  SHA=$(git rev-parse HEAD)
  gh api -X PUT repos/Paddione/Bachelorprojekt/pulls/<number>/update-branch \
    -f expected_head_sha="$SHA"
  ```
  Den SHA ermittelt man via `git rev-parse HEAD` auf dem Branch.
```

Diese API-URL ist versionsunabhängig und funktioniert immer, solange das Token `repo`-Scope hat.
