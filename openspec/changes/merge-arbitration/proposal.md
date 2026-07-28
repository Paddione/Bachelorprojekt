# Proposal: merge-arbitration

## Why

Wenn drei oder mehr Branches dieselbe Datei fachlich ändern, existiert heute kein
Mechanismus, der die Divergenz zusammenführt und **eine** Entscheidung für alle
Beteiligten trifft. Die vorhandenen Werkzeuge sind sämtlich paarweise und binär:
`conflict-check.sh` blockiert den Dispatch, `agent-collision.sh` warnt beim Commit,
`agent-lock.sh` ist ein passiver Mutex. Keines löst auf.

T002413 deckt die präventive Stufe ab (Dispatch-Gate, Rebase-Heilung,
Verzeichniskonvention). Die Messung dort zeigt jedoch, dass echter fachlicher Overlap
übrig bleibt — `scripts/agent-lock.sh` lag über drei PRs. Für den Fall, dass der Scout
einen Pfad nicht vorhersieht, fehlt das Netz.

## What

Eine kurative Auflösungsstufe, die an offenen Pull Requests ansetzt:

- **`scripts/arbitration/detect.sh`** — erkennt Cluster (Datei → beteiligte PRs) über
  offene PRs, schließt generierte Artefakte und Arbitrierungs-PRs aus, gibt JSON aus.
  Schreibt nichts.
- **`scripts/arbitration/synthesize.mjs`** — baut aus einem Cluster den N-Wege-Kontext
  und liefert `{merged, confidence, rationale, per_pr_notes}` über den llm-proxy.
- **`scripts/arbitration/apply.sh`** — entscheidet: Synthese-PR bei hoher Confidence
  und unkritischem Pfad, sonst Eskalations-Ticket mit Briefing.
- **`.github/workflows/arbitration.yml`** — `runs-on: [self-hosted, fleet-gpu]`, weil der
  llm-proxy an `127.0.0.1:18235` gebunden ist.

Strikt additiv: kein Required Check, kein Force-Push, keine Änderung fremder Branches.

Design-Spec: `docs/superpowers/specs/2026-07-28-merge-arbitration-design.md`

_Ticket: T002423_
