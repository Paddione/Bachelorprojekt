---
ticket_id: T002779
plan_ref: openspec/changes/spec-test-tracked-file-isolation/tasks.md
status: active
date: 2026-08-09
---

# Design: spec-test-tracked-file-isolation

_Ticket: T002779_

## Root-Cause

Bestätigt durch Lektüre der beteiligten Dateien (Symptom und Ursache getrennt nach T002448-M5):

**Symptom (beobachtet, CI-Run 31286855491, PR #3892, Shard 4/4):** Zwei Tests in
`tests/spec/mcp-gateway/authenticated-http-headers.bats` fallen ohne Bezug zum PR-Diff um. Die
Fehlermeldung nennt `mcp-kubernetes hat einen llamacpp-Block, ist aber transport: http`. Lokal laufen
dieselben Tests grün.

**Ursache (verifiziert):** `tests/spec/mcp-tooling.bats` schreibt in zwei Tests während des Laufs in
getrackte Dateien des Arbeitsbaums:

- Z. 115–123: `scripts/llm/mcp-servers.json` (Backup → Mutation → `mcp-sync.sh check` → Restore)
- Z. 128–140: `docs/agent-guide/registry/mcp.yaml` (Backup → Mutation → `mcp-sync.sh render` →
  Restore → erneuter Render)

Der zweite Test injiziert einen `llamacpp`-Block in den **ersten http-Client der Registry** — das ist
aktuell `mcp-kubernetes`, exakt der Name aus der Fehlermeldung. Zeile 136 und 138 rendern zusätzlich
`.mcp.json` und `.opencode/opencode.jsonc` neu, was den zweiten Fehlschlag erklärt
(`grep -c Authorization` auf `.mcp.json`).

`task test:spec` (Taskfile.yml Z. 820) und `task test:spec:changed` (Z. 859) rufen bats mit
`-j $(nproc) --no-parallelize-within-files` auf. Dateien laufen also parallel; jede Datei, die
während des Mutationsfensters eines dieser Artefakte liest, sieht den manipulierten Zustand.

Das Muster liegt unverändert auf `origin/main`. PR #3892 hat lediglich die Shard-Zusammensetzung so
verschoben, dass beide Dateien gemeinsam in Shard 4 landeten — er ist Auslöser, nicht Ursache.

## Fix-Ansatz

**1. Fixture-Umbau der beiden Tests.** `scripts/mcp-sync.sh` liest seit T002487 (Z. 15–16):

```
REGISTRY="${MCP_REGISTRY:-$REPO/docs/agent-guide/registry/mcp.yaml}"
OUT_DIR="${MCP_OUT_DIR:-$REPO}"
```

Der Weg ist also bereits gebaut und wird im selben Testkorpus schon genutzt — der Test „renderers
pass headers through for any http client" in `authenticated-http-headers.bats` arbeitet genau so.
Beide Tests in `mcp-tooling.bats` werden darauf umgestellt: Registry-Kopie und `MCP_OUT_DIR` liegen
in `$BATS_TEST_TMPDIR`, Backup und Restore der getrackten Dateien entfallen ersatzlos.

**2. mtime-Snapshot-Guard.** Vor dem bats-Aufruf wird für jede getrackte Datei Pfad, mtime und Größe
erfasst, nach dem Lauf erneut, und beide Listen werden verglichen. Weicht etwas ab, schlägt der Task
fehl und nennt die Pfade.

**Warum mtime und nicht `git status` oder ein Hash.** Beide Tests stellen den Originalinhalt selbst
wieder her. Nach dem Lauf ist der Arbeitsbaum sauber und der Inhalts-Hash identisch — ein
Endzustands-Check über `git status --porcelain` oder Prüfsummen meldet Erfolg für genau den
Fehlermodus, gegen den der Guard existiert. Die mtime dagegen überlebt die Wiederherstellung, weil
`cp` ohne `-p` neu stempelt. Empirisch bestätigt am 2026-08-09: Hash `c9e870f0` vor und nach
Mutation+Restore identisch, mtime von `1786252108` auf `1786252109` gewandert.

## Betroffene Subsysteme

| Bereich | Berührung |
|---|---|
| `tests/spec/mcp-tooling.bats` | zwei Tests auf `MCP_REGISTRY`/`MCP_OUT_DIR` umgestellt |
| `Taskfile.yml` | `test:spec` und `test:spec:changed` klammern den bats-Aufruf in den Guard |
| neues Guard-Skript unter `scripts/` | Snapshot vorher/nachher, Diff, Exit-Code-Durchreichung |
| `tests/spec/ci-cd/` | neuer RED-Test für den Guard |

## Edge-Cases

- **Exit-Code des bats-Laufs darf nicht maskiert werden.** Der Guard läuft nach bats und muss dessen
  Status durchreichen. Ein grüner Guard nach rotem bats darf nicht als Erfolg enden — und ein roter
  Guard nach rotem bats meldet weiterhin einen Fehler, aber die bats-Ursache muss sichtbar bleiben.
- **Vorlauf-Tasks im Snapshot-Fenster.** `test:spec:changed` ruft vorher `test:spec:build-mcp-runner`
  auf, der Dateien erzeugen kann. Der Snapshot wird deshalb **unmittelbar vor** dem bats-Aufruf
  genommen, nicht am Task-Anfang, sonst meldet der Guard legitime Vorarbeit als Verstoß.
- **Untracked-Dateien sind kein Verstoß.** Der Snapshot basiert auf `git ls-files` — Tests dürfen
  weiterhin in `$BATS_TEST_TMPDIR` und in untracked Pfade schreiben.
- **Kosten.** Zwei `git ls-files | xargs stat`-Läufe über das Repo. Gemessen werden muss, ob das im
  Verhältnis zu einem mehrminütigen Suite-Lauf vernachlässigbar bleibt; falls nicht, engt der Guard
  den Snapshot auf die Verzeichnisse ein, die Spec-Tests plausibel berühren.
- **Sharding.** Beide Tasks laufen in CI mit `SPEC_SHARDS` mehrfach parallel — aber jeweils in
  getrennten Runner-Checkouts, nicht im selben Arbeitsbaum. Der Guard braucht deshalb keine
  Shard-Koordination.
- **Weitere Fundstellen.** Findet der Guard beim ersten Lauf zusätzliche mutierende Tests, werden sie
  als eigene Tickets erfasst (Bug-Triage-Konvention G-DORA03) statt hier mitgezogen.
