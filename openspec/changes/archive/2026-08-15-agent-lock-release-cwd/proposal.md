# Proposal: agent-lock-release-cwd

## Why

dev-flow-chore Schritt 7 (chore/ci-kubeconfig-umask-T005902) führte
`agent-lock.sh release branch` samt nachfolgendem Worktree-Remove mit Shell-cwd im
Worktree aus. Der Remove selbst gelang (rc=0), aber danach starben alle Folgekommandos
(`git worktree prune`, `git push --delete`, `git branch -D`) mit
"Unable to read current working directory" (rc=128). Der Branch-Lock blieb stale und
musste per `agent-lock.sh reap` nachgeräumt werden.

Ursache (reproduziert am 2026-08-15 in einer /tmp-Sandbox): liegt das cwd der
aufrufenden Shell im Worktree, ist die Shell nach `git worktree remove` funktionslos —
jedes weitere Kommando scheitert. Die dokumentierte Release-Sequenz ist deshalb nur aus
dem Haupt-Repo heraus sicher.

## What

- `agent-lock.sh release branch <b>` verweigert (Exit 1) mit klarer stderr-Anleitung,
  wenn das cwd des Aufrufers im zum Lock gehörigen Worktree liegt; der Lock bleibt
  bestehen; `--force` bleibt bewusster Override.
- Die Skill-Sequenzen (git-workflow Schritt 7, session-coordination §Freigeben,
  dev-flow-chore Schritt 6) laufen den Release NACH dem Wechsel ins Haupt-Repo und
  verschlucken die Verweigerung nicht mehr per `2>/dev/null || true`.
- Neuer BATS-Test (RED → GREEN) unter `tests/spec/active-sessions-hub/`.

_Ticket: T006290_
