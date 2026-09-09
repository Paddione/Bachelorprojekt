---
title: "p2 — BATS guard for abspath spellings"
ticket_id: T900047
domains: [testing]
status: active
---

# p2 — BATS guard for abspath spellings

Files: `tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats`
(einziges `target_files` dieses Partials; disjunkt zu p1, Regel D1).

## Task 3: Failing BATS-Guard schreiben (RED)

Neuen Guard unter `tests/spec/agent-skills/` anlegen (eine Datei pro Vorgang,
keine ticket-nummerierte Sammeldatei). Der Test baut ein minimales
Git-Repo mit eigenem Claim (`AGENT_LOCK_SID`) und leitet die
Windows-Schreibweisen aus der POSIX-Form des Repo-Pfads ab
(`cd && pwd`), damit er auf Linux und Windows/Git-Bash dieselbe Stelle
meint. Faelle T1–T6 siehe Dateikopf der `.bats`-Datei.

Rot-Nachweis (vor dem Fix):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats
# expected: FAIL — T1 (Laufwerk mit Slashes), T2 (Backslashes), T3 (kleiner
# Drive-Buchstabe) und T4 (UNC) werden mit Exit 2 abgelehnt, die Meldung zeigt
# den verstuemmelten Pfad `$PWD/C:/...`; T5/T6 bleiben gruen und belegen, dass
# das Harness sane ist und der Guard weiterhin blockt.
```

Konventionen: Output-Verifikation (`run`/`$status`, kein Source-Grep);
JSON-Payloads per bash/sed escapen (kein `python3` im Test — dessen argv wird
auf Windows-Hosts von der MSYS2-Runtime konvertiert); Negativ-Fall T6 mit
Positiv-Anker im selben Test.

## Task 4: Gruen-Nachweis nach dem Fix

Nach p1 denselben Runner erneut ausfuehren — alle 6 Faelle muessen gruen sein.
T5 (POSIX-Drive-Schreibweise) und T6 (Guard blockt weiterhin: ausserhalb des
eigenen Claims sowie laufwerk-relative Pfade bleiben Exit 2) sichern, dass der
Fix nichts oeffnet, was geschlossen bleiben muss.
