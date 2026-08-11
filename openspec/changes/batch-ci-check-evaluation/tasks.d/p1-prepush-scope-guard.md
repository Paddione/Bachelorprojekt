# P1 — Pre-push Scope Guard (T002827)

Rolle: **impl**. Fix für T002827: `.githooks/pre-push` validiert heute
`${BASE}..${LOCAL_SHA}` mit `BASE=origin/main` (Fallback `REMOTE_SHA`); nach
`git rebase origin/main` ziehen ein veralteter/fehlender lokaler `origin/main`-Ref bereits
gemergte main-Commits mit konsolidierten Scopes (T002328) in den Range. Die neue
Range-Logik wandert in einen testbaren Helfer, der Hook nutzt sie.

## File `.githooks/pre-push` (geändert)

### Task P1.1 — Range-Berechnung auf echte Neu-Commits umstellen

- [ ] Im Block 2 (Conventional-Commit-Validierung, Zeilen ~40–61) die `BASE`-Ableitung
      ersetzen: statt `origin/main`-Ref (mit `REMOTE_SHA`-Fallback) wird die Commit-Menge
      über den neuen Helfer ermittelt:
      `NEW_SHA=$(bash "$repo_root/scripts/pre-push-scope-range.sh" "$LOCAL_SHA" "$REMOTE_SHA")`.
- [ ] Bei nicht-leerer `NEW_SHA`-Liste:
      `"$repo_root/scripts/validate-commit-msg.sh" range "$(echo "$NEW_SHA" | tail -1)..$LOCAL_SHA"`
      NICHT verwenden — der Helfer liefert die SHA-Liste, Validierung über
      `validate-commit-msg.sh head`-Schleife ODER `range` mit merge-base-korrekter Basis:
      konkret `git rev-list`-Ausgabe als Eingabe für den Validator (Entscheidung beim
      Umsetzen anhand der Validator-Schnittstelle; beide Wege prüfen, dass keine
      main-Commits enthalten sind).
- [ ] Fallback-Verhalten bewahren: ist `origin/main` nicht auflösbar UND `REMOTE_SHA`
      Nullen (neuer Branch), validiert der Hook weiterhin die vollen Neu-Commits gegen
      nichts (kein fälschlicher Block); der Empty-Branch-Guard [T002240] bleibt unberührt.
- [ ] `SKIP_CI_CHECK=1`-Bypass und `_commit_msg_failed`-Akkumulation unverändert lassen;
      der Fehlerpfad (Zeilen ~129–136) bleibt der einzige Blocking-Exit.
- [ ] Shellcheck-frei (Repo-Konvention): `bash -n` + lokale shellcheck-Reihe auf dem Hook
      ausführen.

## File `scripts/pre-push-scope-range.sh` (net-new)

### Task P1.2 — Helfer: neue Commit-Menge je Push

- [ ] Skript mit Usage `pre-push-scope-range.sh <LOCAL_SHA> <REMOTE_SHA>` und `--help`;
      Ausgabe: eine SHA pro Zeile = `git rev-list "$LOCAL_SHA" --not origin/main
      "$REMOTE_SHA"` — wobei `origin/main` und ein Nullen-`REMOTE_SHA` (neuer Branch)
      bedingungslos übersprungen werden (kein Ausschluss gegen einen nicht existenten Ref;
      `git rev-list --not` schlägt sonst hart fehl).
- [ ] Reihenfolge/Stabilität: `git rev-list`-Ausgabe deterministisch (kein `--reverse`,
      kein Sortieren — Ahnenlinien-Reihenfolge ist die rev-list-Norm; Test pinnt die
      Semantik „nur nicht von origin/main UND nicht von REMOTE_SHA erreichbare Commits").
- [ ] Fehlerfälle: nicht auflösbare SHAs → Exit 2 mit Meldung auf stderr (fail-closed,
      kein stilles Leer-Ergebnis), damit der Hook einen kaputten Zustand nie als
      „nichts zu validieren" liest.
- [ ] Kopf-Kommentar mit T002827-Bezug und Verweis auf den Regressionstest
      `tests/spec/ci-cd/pre-push-scope-guard.bats`.

### Task P1.3 — Verifikation (konkrete Test-Schritte)

S1-Budget: `.githooks/pre-push` ist nicht S1-gemessen (unbaselined) — kein Zahlen-Claim;
`scripts/pre-push-scope-range.sh` ist net-new (kein Bestandsbudget).

- [ ] Test-Schritt A: `bash scripts/pre-push-scope-range.sh --help` — rc 0, Usage sichtbar.
- [ ] Test-Schritt B: Temp-Repo-Fixture (siehe P7.1) — Range nach Rebase auf main mit stale
      `origin/main` enthält NUR die eigenen Commits; ein scope-fremder eigener Commit
      bleibt im Range (Output-Verifikation gegen die rev-list-Erwartung).
- [ ] Test-Schritt C: `bash -n .githooks/pre-push scripts/pre-push-scope-range.sh` — keine
      Syntaxfehler.
