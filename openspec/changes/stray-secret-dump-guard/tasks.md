---
title: "stray-secret-dump-guard — Implementation Plan"
ticket_id: T900027
domains: [plan-authoring, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# stray-secret-dump-guard — Implementation Plan

_Ticket: T900027_

## Summary

Add a fail-closed stray-secret-dump guard that catches `kubectl get secret -o json` dumps
(like the `ws-secret.json` incident file with the colon-mangled Windows filename) in the
working tree, independent of the `gitleaks` binary. Wire it into the pre-commit hook and the
CI `security-scan` job. Document the deletion + rotation operational gates (user-confirmed,
not automated). No secrets are written into this plan or any commit.

## File Structure

```
scripts/stray-secret-dump-guard.sh              neu        fail-closed Guard
tests/spec/security/stray-secret-dump-guard.bats  neu      RED->GREEN BATS (bereits angelegt)
.githooks/pre-commit                            geaendert  Guard-Aufruf (fail-closed, auch ohne gitleaks)
.github/workflows/ci.yml                        geaendert  Guard-Aufruf im security-scan-Job
openspec/changes/stray-secret-dump-guard/       neu        Proposal + Delta-Spec (dieser Change)
```

## Background (Root-Cause)

- **Symptom (Fakt, reproduzierbar):** Ein vollständiges Kubernetes `Secret`-Manifest (128 Keys,
  inkl. `ANTHROPIC_API_KEY`, OIDC-Client-Secrets, Admin-Passwörter) lag untracked im Repo-Root
  unter dem zerbrochenen Windows-Pfad-Dateinamen `C`+`U+F03A`+`Users…AppDataLocalTempws-secret.json`.
- **Wurzel-Ursache (Hypothese, evidence-backed):** Ein Git-Bash-Shell-Redirect
  `kubectl get secret … -o json > C:\Users\…\ws-secret.json` hat den Laufwerks-Doppelpunkt als
  U+F03A in den Dateinamen übernommen statt als Pfadtrenner.
- **Warum die Bestands-Guards versagten:** (a) `.gitignore`/`git check-ignore` können den Namen
  nicht auflösen (`outside repository`); (b) der lokale gitleaks-Pre-Commit-Hook ist **fail-open**
  bei fehlendem Binary (T002506/T002554) — auf der Fund-Maschine war gitleaks nicht installiert.
  Schutz hing allein an Disziplin + expliziter Pathspec-Konvention.

## Decisions

- **D1 (Guard-Interface):** `scripts/stray-secret-dump-guard.sh [--dir <path>] [--verbose]` —
  scannt das Zielverzeichnis (Default: `git rev-parse --show-toplevel` des Aufrufs) rekursiv nach
  Stray-Secret-Dump-Dateinamen (`*ws-secret*.json`, `*-secrets-*.json`, `*secretdump*.json`,
  `*secrets-dump*.json`). Exit 0 = keine Funde, Exit 1 = Funde (mit Dateinamen auf stderr),
  Exit 2 = Usage-Fehler. Laufzeitfehler (z. B. Zielverzeichnis fehlt) → Exit 2 (fail-closed,
  kein stilles Durchwinken).
- **D2 (gitleaks-Unabhängigkeit):** Der Guard führt KEIN gitleaks aus und braucht es nicht — er
  prüft reine Dateinamen-Muster. Damit failt er fail-closed auch auf Maschinen ohne gitleaks-Binary.
  Er ist eine **Ergänzung** zum bestehenden gitleaks-Hook (der weiterhin den Inhalt prüft), kein
  Ersatz.
- **D3 (Pre-Commit-Wiring):** `.githooks/pre-commit` ruft den Guard **immer** auf (auch wenn
  gitleaks fehlt, im Gegensatz zum gitleaks-Step). Bypass-Env `SKIP_STRAY_SECRET_GUARD=1` als
  Notausgang. Probe-Aufruf im Hook: `scripts/stray-secret-dump-guard.sh`.
- **D4 (CI-Wiring):** `.github/workflows/ci.yml` `security-scan`-Job ruft den Guard vor dem
  gitleaks-Schritt auf (fail-closed).
- **D5 (Op-Gates, NICHT automatisiert):** Löschen des untracked Incident-Files und Rotation der
  exponierten Credentials (via `scripts/secret-rotate.sh` / `env:generate`+`env:seal`) sind
  manuelle, nutzerbestätigte Schritte — sie gehören in den Verify-Abschnitt als explizite Gates,
  nicht in den automatisierten Code. **KEINE Secrets in Commits/Plan.**

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test
      `tests/spec/security/stray-secret-dump-guard.bats` (bereits angelegt, ASCII-only-Namen)
      führt den Guard gegen kontrollierte Zielverzeichnisse aus. Mit noch fehlendem
      `scripts/stray-secret-dump-guard.sh` scheitert er (Exit 127) → rot.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security/stray-secret-dump-guard.bats
# expected: FAIL (red — der Guard existiert noch nicht)
```

- [ ] **Fix-Step (GREEN).** `scripts/stray-secret-dump-guard.sh` implementieren und in
      `.githooks/pre-commit` + `.github/workflows/ci.yml` einbinden. Der BATS-Test muss jetzt
      grün sein (stray-fund exit 1 + Dateibenennung; sauberes Verzeichnis exit 0).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security/stray-secret-dump-guard.bats
```

- [ ] **Manual Gate 1 — Deletion (nutzerbestätigt):** Der/die Operator:in bestätigt und löscht
      das untracked Incident-File im Haupt-Checkout. NICHT automatisiert in diesem Change.

```bash
# Im Haupt-Checkout (nicht im Worktree) — erst nach expliziter Nutzerbestätigung:
py -3.14 -c "import os,glob; [os.remove(f) for f in glob.glob('C*ws-secret.json')]"
git status   # verifizieren: keine untracked Secret-Dump-Datei mehr
```

- [ ] **Manual Gate 2 — Rotation (nutzerbestätigt):** Ob die 128 Keys als exponiert gelten und
      rotiert werden, entscheidet der/die Operator:in. Bei Rotation:
      `bash scripts/secret-rotate.sh --env <env> --force` (goes über `env:generate`+`env:seal`).
      NICHT automatisiert.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Task 1 — Guard-Skript implementieren (GREEN)

Erstelle `scripts/stray-secret-dump-guard.sh`:

- Parsing: `--dir <path>` (Ziel-Scan-Verzeichnis, Default: `git rev-parse --show-toplevel`),
  `--verbose` (Funde zusätzlich auf stdout), `--help`/unbekannte Option → Exit 2.
- Fallback: Ist kein Git-Repo im cwd und kein `--dir`, Default auf `$(pwd)` mit Warnung auf stderr
  (trotzdem fail-closed).
- Muster (case-insensitive, fnmatch gegen `basename` jeder Datei):
  - `*ws-secret*.json`
  - `*-secrets-*.json`
  - `*secretdump*.json`
  - `*secrets-dump*.json`
- Rekursion: `find "$DIR" -type f 2>/dev/null`, pro Datei `basename` gegen die Muster.
- Ausgabe: bei Funden je eine Zeile auf stderr + Exit 1; keine Funde → Exit 0; Zielverzeichnis
  fehlt/nicht lesbar → Exit 2 (fail-closed).
- `SKIP_STRAY_SECRET_GUARD=1` → sofort Exit 0 (Notausgang, von Hook/CI gesetzt).

```bash
bash scripts/stray-secret-dump-guard.sh --dir <tmpdir-mit-ws-secret.json>   # exit != 0
bash scripts/stray-secret-dump-guard.sh --dir <tmpdir-clean>                # exit 0
tests/unit/lib/bats-core/bin/bats tests/spec/security/stray-secret-dump-guard.bats
```

## Task 2 — Pre-Commit + CI einbinden

- `.githooks/pre-commit`: Guard-Aufruf **vor dem gitleaks-Step**, unabhängig von der
  gitleaks-Binary-Präsenz:

```bash
if [ "${SKIP_STRAY_SECRET_GUARD:-0}" != "1" ]; then
  if ! bash "$(resolve_guard "scripts/stray-secret-dump-guard.sh")" 2>/dev/null; then
    echo "ERROR: refusing commit — stray secret-dump file(s) in working tree (see above)." >&2
    exit 1
  fi
fi
```

- `.github/workflows/ci.yml`: im `security-scan`-Job vor dem gitleaks-Schritt:

```bash
bash scripts/stray-secret-dump-guard.sh \
  || { echo "ERROR: stray secret-dump detected"; exit 1; }
```

- Verifikation: Der PRE-Commit-GUARD ist fail-closed, auch wenn `gitleaks` nicht installiert ist.

```bash
SKIP_STRAY_SECRET_GUARD=1 bash .githooks/pre-commit   # darf den Schritt überspringen
tests/unit/lib/bats-core/bin/bats tests/spec/security/stray-secret-dump-guard.bats
```

## Task 3 — Doku der Op-Gates (Reference-Spec)

- Die Delta-Spec `openspec/changes/stray-secret-dump-guard/specs/secrets-deploy-automation.md`
  enthält bereits beide Requirements (Guard + Cleanup-Runbook). Sicherstellen, dass der Plan und
  die Delta-Spec die nutzerbestätigten Lösch-/Rotations-Gates dokumentieren (kein automatisiertes
  Löschen/Rotieren).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security/stray-secret-dump-guard.bats
```

## Dependencies / Notes

- Kein externer Dienst, keine Cluster-Abhängigkeit: der Test nutzt nur `$BATS_TEST_TMPDIR`.
- Der gitleaks-Hook bleibt unverändert; der neue Guard ist additiv.
- **Security:** In keinen Commit/Plan fließen Secret-Werte; nur Dateinamen-Muster und
  Rotations-/Lösch-Prozeduren werden dokumentiert.
