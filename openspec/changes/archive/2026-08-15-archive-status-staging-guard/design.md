# Design: archive-status-staging-guard

## Ausgangslage (belegt)

- `scripts/openspec.sh` `cmd_archive` (T003136, PR #4255, 2026-08-11) regeneriert die
  Status-Map nach dem Move und staged sie — aber nur unter
  `if [[ "${TICKET_OFFLINE:-0}" != "1" ]]` und mit `|| true` auf beiden Zeilen
  (openspec.sh:325-336). `openspec-status-map.sh` ist ein rein lokaler Scan
  (git toplevel + `openspec/changes/`), kein Cluster-Zugriff — die Kopplung an
  `TICKET_OFFLINE` ist ein Konstruktionsfehler, kein Schutz.
- `scripts/devflow-post-merge-finalize.sh` Schritt 8 (PR #4539, 2026-08-15) — der
  automatisierte Archiv-Pfad, der die beobachteten PRs erzeugt hat — führt
  `task freshness:regenerate >/dev/null 2>&1 || true` aus und pusht den Archiv-Branch ohne
  `task freshness:check`-Verifikation vor dem Push. Die Subshell `( cd "$ARCHIVE_DIR"; … )`
  hat kein `set -e`: ein fehlgeschlagener Regenerate wird durchgereicht, der Commit+Push
  laufen weiter.
- Beleg der beobachteten Fälle: PR #4529 (T005560) und #4533 (T005958), je Commit 1 ohne
  JSON, Commit 2 „regenerate openspec-status after archive" als manuelle Heilung.

## Entscheidungen

### D1: `cmd_archive` — Regeneration + Staging fail-closed und offline-unabhängig

Der Block in `cmd_archive` (nach `mv "$dir" "$dest"`) wird aus der `TICKET_OFFLINE`-Bedingung
herausgelöst und verliert beide `|| true`:

```bash
bash "$HERE/openspec-status-map.sh"
git -C "$REPO" add -- "$REPO/website/src/data/openspec-status.json"
```

`set -euo pipefail` (Kopf von openspec.sh) macht Fehler fail-closed: schlägt die Status-Map
fehl (z. B. Zielverzeichnis fehlt), bricht der Archiv-Lauf mit Exit != 0 ab, statt still
weiterzulaufen und einen PR ohne frische JSON zu erzeugen. Kein `mkdir -p` im Verb — das
Repo-Layout existiert im echten Repo immer; in Sandbox-Tests wird das Verzeichnis im setup
angelegt (bewusst, damit Szenario „fehlendes Verzeichnis → Abbruch" testbar bleibt).

Damit kann kein Ausführer — online oder offline — den Add überspringen, solange er das
Archiv-Verb nutzt.

### D2: `devflow-post-merge-finalize.sh` Schritt 8 — Pre-Push-Freshness-Verifikation

Die Subshell in Schritt 8 wird fail-closed:

1. `set -e` am Anfang der Subshell (bricht bei jedem Fehlschlag ab, inkl. Regenerate).
2. `task freshness:regenerate` ohne `|| true`.
3. Nach `git cherry-pick "$ARCHIVE_COMMIT"` (auf dem frischen Archiv-Branch von
   `origin/main`): `task freshness:check`; bei Drift (Exit != 0) die regenerierten Artefakte
   stagen und den gepickten Commit amenden (`git commit --amend --no-edit`), danach erneut
   `task freshness:check` — erst wenn grün, `git push -u origin "$ARCHIVE_BRANCH"`.

Damit kann der automatisierte Factory-Pfad keinen Archiv-PR mehr pushen, dessen
`openspec-status.json` stale ist.

### D3: BATS-Guard in eigener Datei (T002416)

`tests/spec/openspec-workflow/archive-status-offline-staging.bats` — Sandbox-Verhaltenstest
nach dem Muster von `archive-terminal-ticket-status.bats` (git init, OPENSPEC_ROOT, Symlinks
auf scripts/, Stub-ticket.sh), Prüfmodus Output-Verifikation (T002448-M4):

- **Test 1 (RED, Kern):** `TICKET_OFFLINE=1 bash scripts/openspec.sh archive demo` →
  `git diff --cached --name-only` MUSS `website/src/data/openspec-status.json` enthalten.
  Heute rot (Bedingung überspringt den Block), nach D1 grün.
- **Test 2 (Positiv-Anker, T002356-M1):** derselbe Lauf ohne `TICKET_OFFLINE` → JSON gestaged.
- **Test 3 (Querschnitts-Doku-Guard, Ausnahmemodus dokumentiert):** `devflow-post-merge-finalize.sh`
  Schritt 8 trägt einen `freshness:check`-Guard vor dem Push (awk-Bereichsmuster auf den
  Schritt-8-Abschnitt, T003104; Positiv-Anker: `git push -u origin`-Zeile muss existieren).
  Heute rot, nach D2 grün.

Bestehende Bestandsdatei `archive-terminal-ticket-status.bats`: `mkdir -p website/src/data`
vom T003136-Testkörper ins `setup()` ziehen (die übrigen Tests dieser Datei rufen `archive`
ebenfalls auf; mit D1 würden sie ohne das Verzeichnis abbrechen). Keine neuen @test-Blöcke in
der Bestandsdatei (T002416).

### D4: Delta-Spec auf `scripts.md`

`openspec/changes/archive-status-staging-guard/specs/scripts.md` — ADDED-Requirement zum
Archiv-Verb (Parent-SSOT `openspec/specs/scripts.md`). T006369 deltat auf
`openspec-workflow.md` — keine Überschneidung.

## Koordination mit T006369 (Parallelsession, gleiche Domäne)

- **T006369** härtet `.claude/skills/references/plan-archive-steps.md` (freshness:check +
  Amend-Pfad zwischen cherry-pick und push, manueller Ablauf) mit eigenem Delta auf
  `openspec-workflow.md` und eigenem Guard `plan-archive-freshness-check.bats`.
- **T006371 (dieser Change)** berührt diese Dateien NICHT: Fix in `scripts/openspec.sh`
  (Verb) + `scripts/devflow-post-merge-finalize.sh` (automatisierter Pfad) + eigener Guard +
  Delta auf `scripts.md`. Die beiden Fixes sind komplementär und kollidieren nicht.
- **Geteilter Punkt:** Beide Changes fügen BATS-Testdateien hinzu und regenerieren dadurch
  `website/src/data/test-inventory.json`. Der letzte Merge gewinnt bzw. der jeweils spätere
  Lauf regeneriert erneut; ein Merge-Konflikt an der generierten Datei wird durch
  Regeneration aufgelöst, nicht von Hand gemergt. Im Implementier-Plan als Hinweis führen.
- **Kein File-Lock auf `scripts/openspec.sh` oder `devflow-post-merge-finalize.sh`**
  erforderlich — T006369 beansprucht sie nicht (seine File-Locks sind leer, sein Plan nennt
  nur die drei eigenen Dateien).

## Alternativen verworfen

- **Nur Referenz `plan-archive-steps.md` härten:** bereits durch T006369 belegt; deckt den
  manuellen Pfad, aber nicht den automatisierten Factory-Pfad (der die beobachteten PRs
  erzeugte) und nicht das Verb selbst (fremde Ausführer folgen der Referenz nicht zwingend).
- **Pre-Commit-Hook statt Verb-Fix:** Hooks laufen beim Ausführer mit dessen Branch-Stand
  und sind per `--no-verify`/`SKIP_*` umgehbar; das Verb ist der gemeinsame Nenner aller
  Archiv-Läufe.
