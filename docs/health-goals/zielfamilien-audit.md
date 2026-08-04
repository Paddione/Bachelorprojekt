# Zielfamilien-Audit T002584 — Systematischer Durchgang über alle Audit-Zielfamilien

**Datum:** 2026-08-04 · **Ticket:** [T002584](https://github.com/Paddione/Bachelorprojekt/issues/T002584) · **Methode:** Audit-Runner
(`scripts/lib/zielfamilien-audit.sh`, offline gegen Fixture-Korpus) + Code-Lektüre aller Messbefehle in
`scripts/health-goals-check.sh` gegen die realen Messquellen. Geprüft wird die Fehlerklasse T002356-M1
(vakuos grün / SKIP-forever) in vier Ausprägungen: fehlende Mess-Basis → Nullwert → Erfolg (E1),
SKIP-forever (E2), Filter auf nicht-existierenden Schlüssel (E3), Textwert im arithmetischen Vergleich (E4)
plus Existenz-Anker fehlt (E5).

**Scope-Hinweis:** Der Plan (2026-08-02) wurde gegen 20 Familien geschrieben (18 In-Scope + LLM + WT).
Seitdem wuchs die Datei durch T002598 (2026-08-03) um die Familien **CD, DORA, K8S, SPEC** — diese
vier liegen außerhalb des Audit-Scopes und sind unten nur als Klarstellung gelistet, nicht auditiert.

| Familie | Goals | Befund | Fehlerklasse | Maßnahme | Status |
|---------|-------|--------|--------------|----------|--------|
| AGENTIC | 17 | geprüft | — | — | grün |
| BRAIN | 4 | geprüft | — | — | grün |
| CFG | 1 | geprüft | — | — | grün |
| CI | 3 | geprüft | — | — | grün |
| CQ | 7 | geprüft | E5 | Positiv-Anker `website/src` + `n/a` statt 0 (G-CQ02, G-CQ06), T002442-Muster | geschärft |
| DB | 8 | geprüft | — | — | grün |
| DEP | 5 | geprüft | E5 | Positiv-Anker `website/Dockerfile` (G-DEP03) | geschärft |
| DOC | 2 | geprüft | E4 | Positiv-Anker `CLAUDE.md` — kein leerer Wert im arith. Vergleich (G-DOC02) | geschärft |
| E2E | 2 | geprüft | — | — | grün |
| FE | 3 | geprüft | E5 | Positiv-Anker `website/src` (G-FE03, G-FE04) | geschärft |
| GIT | 3 | geprüft | E5 | Positiv-Anker `origin/main`-Ref (G-GIT02) | geschärft |
| IF | 3 | geprüft | E1/E5 | Positiv-Anker: alle Mess-Dateien müssen existieren, sonst `n/a` statt 0 (G-IF02; `except: pass` entfernt) | geschärft |
| IMG | 1 | geprüft | — | — | grün |
| OPS | 3 | geprüft | — | — | grün |
| RH | 5 | geprüft | E5 | Positiv-Anker `website/src` im count()-Aufruf (G-RH02) | geschärft |
| SEC | 6 | geprüft | E5 | Positiv-Anker `k3d/` (G-SEC01) und `main`-Ref (G-SEC05) | geschärft |
| SIZE | 2 | geprüft | — | — | grün |
| TEST | 5 | geprüft | E5 | Positiv-Anker `website/src`/`mentolder-web/src` (G-TEST02, G-TEST03) | geschärft |
| LLM | 5 | ausgeschlossen | — | → [T002442](https://github.com/Paddione/Bachelorprojekt/issues/T002442) (zielfamilie-llm-stack) | — |
| WT | 6 | ausgeschlossen | — | → [T002443](https://github.com/Paddione/Bachelorprojekt/issues/T002443) (zielfamilie-worktree-hygiene) | — |
| CD | 1 | Klarstellung | — | nach Plan-Erstellung ergänzt (T002598), außerhalb Audit-Scope | — |
| DORA | 4 | Klarstellung | — | nach Plan-Erstellung ergänzt (T002598), außerhalb Audit-Scope | — |
| K8S | 4 | Klarstellung | — | nach Plan-Erstellung ergänzt (T002598), außerhalb Audit-Scope | — |
| SPEC | 3 | Klarstellung | — | nach Plan-Erstellung ergänzt (T002598), außerhalb Audit-Scope | — |

## Fehlerklassen (Taxonomie T002583 / T002356)

| ID | Klasse | Erkennungsmuster |
| --- | --- | --- |
| E1 | Fehlende Mess-Basis → Nullwert → vakuos grün (T002356-M1) | Messbefehl liest Feld/Quelle, die in der realen Antwort nicht existiert; Default `0`/leere Liste gilt als Erfolg |
| E2 | SKIP-forever | Fallback `-` (z. B. except-Zweig nach Struktur-Fehler) → Ziel läuft nie |
| E3 | Filter auf nicht-existierenden Schlüssel | `grep -c '"kind"' …` findet nie etwas, Messung schweigt |
| E4 | Textwert im arithmetischen Vergleich | Messung emittiert Text/leeren Wert in `[ "$actual" -le "$target" ]` |
| E5 | Existenz-Anker fehlt | Pfad-/Ref-basierte Zählung (grep/wc/git) ohne Existenz-Check → verschwundene Basis liest als `0` = Erfolg |

## Ergebnis

**13 Ziele in 9 Familien** nach dem T002442-Muster geschärft: Positiv-Anker als erste Anweisung der
Messung, Anker-Fehler ⇒ `n/a` (`-` im Runner), nie `0` als Default. Grüne Ziele blieben byte-for-byte
unverändert (REQ-005); G-LLM\* und G-WT\* sind FREEZE (T002442/T002443). Die verbleibenden 9 Familien
wurden geprüft und sind ohne Befund. Permanenter Regressionsschutz: Fixture-Suite
[`tests/spec/health-goals/zielfamilien-audit.bats`](../../tests/spec/health-goals/zielfamilien-audit.bats) —
SKIP-forever und vakuos-grün machen die Suite rot.
