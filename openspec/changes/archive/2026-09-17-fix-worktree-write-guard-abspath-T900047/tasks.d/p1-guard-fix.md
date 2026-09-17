---
title: "p1 — worktree-write-guard abspath fix"
ticket_id: T900047
domains: [scripts]
status: active
---

# p1 — worktree-write-guard abspath fix

Files: `scripts/hooks/worktree-write-guard.sh` (einziges `target_files` dieses
Partials; disjunkt zu p2, Regel D1).

## Task 1: `_canon()`-Normalisierung vor der Absolut-Erkennung

In `scripts/hooks/worktree-write-guard.sh` eine `_canon()`-Funktion einfuehren
und TARGET direkt nach der JSON-Extraktion kanonisieren, VOR dem
`case "$TARGET" in /*)`-Check:

- Backslashes zu Slashes normalisieren (`C:\Users\x` wird `C:/Users/x`).
- Laufwerk-Form `^[A-Za-z]:/` in POSIX-Form ueberfuehren (`C:/Users/x` wird
  `/c/Users/x`), Laufwerksbuchstabe case-insensitiv kleinschreiben
  (`c:` und `C:` sind gleich).
- POSIX-Drive-Form `/C/...` ebenfalls angleichen (`/C/Users/x` wird
  `/c/Users/x`).
- UNC (`\\srv\share` wird `//srv/share`) bleibt `/`-absolut.
- Laufwerk-relative Pfade (`C:relativ`, kein Slash nach dem Doppelpunkt)
  bleiben unveraendert und fallen weiter in die Relativ-Behandlung
  (`$PWD/`-Praefix).

Danach erkennt der bestehende `/*)`-Zweig jede absolute Schreibweise; der
`$PWD/`-Praefix trifft nur noch echte relative Pfade.

## Task 2: Vergleichsseiten kanonisieren und Regression pruefen

`MAIN_ROOT` sowie die Ausgabe von `_abs_wt()` (Claim-Pfade) durch dieselbe
`_canon()`-Funktion schicken, damit TARGET, `MAIN_ROOT` und Claims in
derselben Form verglichen werden. Die `[ -d ]`-Existenzpruefungen in
`_abs_wt()` und in der Claim-Schleife bleiben auf der kanonischen POSIX-Form
lauffaehig (Linux- und Git-Bash-nativ).

Akzeptanz: nach dem Fix laeuft der BATS-Guard aus p2 gruen (T1–T4), und die
bestehenden Guard-Suiten bleiben gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats tests/spec/agent-skills/worktree-write-guard-session-propagation.bats tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats
```

SID-Logik, Claim-Semantik und `WORKTREE_GUARD_BYPASS` bleiben unberuehrt
(Proposal-Scope).
