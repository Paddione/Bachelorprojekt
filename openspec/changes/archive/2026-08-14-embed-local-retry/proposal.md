# Embed-Local-Retry

## Purpose (Deutsch)

`openspec-embed-local.sh` — der explizite C.4-Pfad aus dev-flow-plan — soll transiente
Embed-Backend-Ausfälle mit einer Retry-Schleife überbrücken, bevor er fail-visible
abbricht. Beobachtet am 2026-08-14: zwei Läufe endeten mit „best-effort failure (exit 0):
The operation was aborted due to timeout" — der Change `batch-worktree-guard-tooling-fixes`
(T004295) landete nie im pgvector-Index und ist für die Semantik-Suche unsichtbar
(T004608). Der post-commit-Hook hat Retries (T002916), der explizite Wrapper nicht.

## Problem / Auslöser

`openspec-embed.mjs` beendet sich bei Backend-Fehlern best-effort mit Exit 0 und der Zeile
`[openspec-embed] best-effort failure (exit 0): …` (Zeile 551–553). Der Wrapper
(`openspec-embed-local.sh` Zeile 162–178) ruft das mjs genau EINMAL auf und wertet aus:
kein `indexed slug=` → sofortiger Exit 1. Ein einziger transienter Timeout (bge-Backend
lädt, Proxy-Startup) macht den ganzen Embed-Schritt zunichte — es gibt keinen zweiten
Versuch, obwohl derselbe Wrapper-Flow im Hook drei hat.

## Fix-Richtung

- **Retry-Schleife in `openspec-embed-local.sh`** um den mjs-Aufruf (Schritt 3):
  - Env-Override analog zum Hook: `OPENSPEC_EMBED_RETRIES` (Default 2) und
    `OPENSPEC_EMBED_RETRY_DELAY` (Default 5).
  - Nach jedem Lauf prüfen, ob `indexed slug=` im Output steht:
    - Ja → weiter mit `--count-skipped` + Exit 0 (bestehendes Verhalten).
    - Nein → Retry, solange Versuche übrig; vor jedem Retry kurze Meldung
      `[openspec-embed-local] retry N/… in Xs` auf stderr.
  - Retries erschöpft → bestehende fail-visible-Meldung (`FEHLER: Embedding wurde
    NICHT indiziert`) + Exit 1 — **kein** stiller Exit 0.
- **Kein** Retry auf Probe-Fehler (Schritt 1): die Backend-Probe ist fail-fast gewollt
  (klare Remediation statt Verzögerung) — nur der Embed-Lauf selbst wird wiederholt.
- Keine Änderung an `openspec-embed.mjs` (best-effort-Semantik bleibt — der Wrapper ist
  der Escalation-Punkt, T002870).

## Out of Scope

- Keine Retries im Hook (existiert, T002916).
- Keine Backoff-Exponentialisierung — feste Verzögerung analog Hook.
- Kein Auto-Reindex alter verpasster Changes (Backfill bleibt `task openspec:embed:backfill`).
