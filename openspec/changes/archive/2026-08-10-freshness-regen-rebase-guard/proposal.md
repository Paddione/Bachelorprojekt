# Proposal: freshness-regen-rebase-guard

## Why

PR #3788 (T002634) scheiterte im CI-Freshness-Gate, weil `main` während der Session zweimal
weiterrückte (#3787, #3785 Release-Commits), während der Worktree-Branch dahinter zurücklag.
Der Autor regenerierte die Freshness-Artefakte (u. a. `website/src/data/test-inventory.json`,
`docs/code-quality/repo-index.json`) lokal, committete, pushte — und `main` war beim nächsten
CI-Lauf erneut weiter. Erst nach zwei Regen-Commit-Push-Zyklen (je ~1–2 min) wurde der Branch
stabil grün. Das ist ein Wettlauf, kein Einzelfehler: der Regen-Loop kostet Zeit, ohne dass am
eigentlichen Problem — der veralteten Basis — etwas geändert wird.

**Root Cause (verifiziert, nicht nur Hypothese):**
`task freshness:regenerate` erzeugt die Artefakte aus dem aktuellen Arbeitsbaum. Rückt `main`
während der Session weiter (z. B. durch parallele Releases oder andere gemergte PRs, die
ebenfalls generierte Dateien berühren — Datei-Inventar, Route-Manifest, Quality-Index),
unterscheidet sich der Arbeitsbaum zum Regenerationszeitpunkt vom Zustand, den GitHub Actions
beim `pull_request`-Trigger tatsächlich prüft: `actions/checkout` checkt dort den Merge-Commit
aus Branch-Tip + aktuellem `origin/main` aus (`.github/workflows/ci.yml`, Job `test-bats`).
Regeneriert der Autor lokal, bevor er ein Mal final gegen den zu diesem Zeitpunkt aktuellen
`origin/main` rebased hat, produziert `freshness:regenerate` Artefakte für eine Baumkonfiguration,
die auf `main` schon wieder veraltet ist, sobald der Push ankommt.

Ein verwandter, bereits gelöster Fall (T002561, archiviert unter
`openspec/changes/archive/2026-08-02-freshness-check-base-mismatch/`) hat `task freshness:check`
bereits um eine **Warnung** ergänzt (`git rev-list --count HEAD..origin/main`, Taskfile.yml
Zeilen ~1232–1240): sie nennt die gemessene Basis und weist darauf hin, wenn der lokale Branch
hinter `origin/main` zurückliegt. Diese Warnung greift aber **nachdem** `freshness:regenerate`
bereits gelaufen ist (Phase 0 vor Phase 0b) — sie deckt exakt den Fall dieses Tickets ab
(Divergenz durch parallel weiterrückenden `main`), verhindert den teuren Regen-Commit-Push-Zyklus
aber nicht, weil sie nur informiert, nicht vor der Regeneration abfängt, und weil sie nur beim
lokalen `task freshness:check`-Lauf sichtbar wird — nicht im `git-workflow`-Skill-Ablauf, den
Agenten tatsächlich befolgen (Schritt 0 „Pull-First" läuft dort nur **einmal am Sitzungsanfang**,
nicht erneut unmittelbar vor dem Freshness-Regen-Schritt, der oft erst Minuten bis Stunden später
läuft).

## Entscheidung: Variante (a) — Rebase-Vorbedingung direkt vor dem Regen-Lauf

Von den drei erwogenen Richtungen:

- **(a) Pull/Rebase auf `origin/main` als Vorbedingung vor dem Regen-Lauf** — direkter Treffer:
  die eigentliche Ursache ist eine veraltete lokale Basis zum Regenerationszeitpunkt, nicht ein
  fehlerhaftes Gate. Ein zweiter Pull-First-Checkpoint unmittelbar vor `task freshness:regenerate`
  (statt nur einmal zu Sitzungsbeginn) schließt exakt die Lücke, die T002561 offen gelassen hat.
  Kosten: ein `git fetch` + `git rev-list --count` (Sekunden), keine CI-Änderung, kein neuer
  Automatisierungspfad, keine neue Sicherheitsfläche.
- **(b) CI-Gate gegen den Merge-Base statt gegen HEAD von main prüfen** — passt nicht auf den
  tatsächlichen Mechanismus: `actions/checkout` bei `pull_request`-Events checkt bereits den
  Merge-Commit (Branch-Tip + aktueller `origin/main`) aus: `task freshness:check` in CI prüft
  also schon gegen exakt den Baum, der gemerged würde — nicht gegen einen künstlich fixierten
  Merge-Base. Ein Gate gegen den Merge-Base würde die Divergenz nur verstecken (der PR sähe
  lokal grün aus, obwohl der tatsächlich gemergte Baum andere Artefakte bräuchte) statt sie zu
  lösen. Verworfen.
- **(c) Regeneration im CI statt lokal (Bot committet)** — der bestehende Post-Merge-Healer
  `freshness-regen.yml` deckt genau diesen Zweck bereits ab (kommittiert auf `main`, nach dem
  Merge). Ihn auf den Pre-Merge-PR-Branch zu ziehen bräuchte entweder Schreibrechte auf
  Fork-/Feature-Branches (bei Fork-PRs strukturell nicht möglich) oder denselben Admin-PAT-Pfad,
  den T002889 bereits als offenen Sicherheitsbefund führt (Freshness-Bot pusht derzeit mit
  Admin-PAT direkt auf `main`). Diese Variante würde die Angriffsfläche vergrößern statt sie
  unverändert zu lassen — verstößt gegen die Auflage des Tickets. Verworfen.

**Gewählt: (a).** Ergänzung des `git-workflow`-Skills (Schritt 1, unmittelbar vor dem Freshness-
Guard) um einen expliziten zweiten Divergenz-Check gegen `origin/main` — bei Divergenz **erst
rebasen, dann regenerieren**, statt zu regenerieren und im Nachhinein zu warnen. Das ist eine
Erweiterung des bestehenden Schritt-0-Musters (Pull-First) um einen zweiten Checkpoint an der
Stelle, an der die T002561-Warnung bereits zeigt, dass die Divergenz real vorkommt — nur früher,
bevor der teure Regen-Commit-Push-Zyklus überhaupt beginnt.

## What

- `git-workflow` SKILL.md, Schritt 1 („Verifikation & Freshness Guard"): expliziter Rebase-
  Preflight-Schritt direkt vor `task freshness:regenerate` — `git fetch origin main` +
  `git rev-list --count HEAD..origin/main`; bei einem Wert > 0 zuerst rebasen
  (`git pull --rebase origin main`, Konfliktbehandlung wie in Schritt 0 beschrieben), dann erst
  `task freshness:regenerate` ausführen.
- Dokumentierte Begründung im Skill: warum ein zweiter Checkpoint nötig ist, obwohl Schritt 0
  bereits pull-first macht (Sitzungsdauer zwischen Schritt 0 und dem Freshness-Regen-Schritt).
- Test (source-verification, analog zum T002561-Präzedenzfall
  `tests/spec/ci-cd/freshness-check-base-mismatch.bats`): der `git-workflow`-Skill enthält vor
  dem `freshness:regenerate`-Verweis in Schritt 1 einen expliziten `origin/main`-Divergenz-Check.

_Ticket: T002669_

## Out of Scope

- Keine Änderung an `task freshness:check` selbst (T002561 deckt die Warnung dort bereits ab).
- Keine Änderung am CI-Workflow (`ci.yml`) — der Merge-Commit-Checkout ist bereits korrekt.
- Keine Änderung an `freshness-regen.yml` / dem Admin-PAT-Pfad (T002889 ist ein separates,
  offenes Ticket für diesen Sicherheitsbefund).
