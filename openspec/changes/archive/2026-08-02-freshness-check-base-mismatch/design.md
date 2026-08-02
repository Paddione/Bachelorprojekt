---
title: Design: freshness-check-base-mismatch
ticket_id: T002561
domains: [bachelorprojekt-test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: freshness-check-base-mismatch

_Ticket: T002561_

## Root-Cause (verifiziert)

`Taskfile.yml` `freshness:check` (Phase 0 + Phase 1) diffed generierte Artefakte ausschließlich
gegen den lokalen `HEAD`:

```bash
if ! git diff --quiet "$f" 2>/dev/null; then           # working tree vs. index
elif ! git diff --quiet HEAD -- "$f" 2>/dev/null; then  # index vs. local HEAD
```

Keine Stelle in der Task-Definition referenziert `origin/main` oder `git rev-list`. CI führt
denselben Task jedoch gegen den GitHub-generierten PR-Merge-Commit aus (`refs/pull/N/merge`),
der den aktuellen `origin/main`-Stand bereits enthält. Ist der lokale Branch hinter
`origin/main`, prüft `freshness:check` lokal effektiv gegen eine ältere Codebasis als CI — der
Vergleich ist nicht falsch, sondern misst eine andere Grundgesamtheit. Symptom (beobachtet):
lokal grün, CI rot, Re-Run ändert nichts. Ursache (jetzt verifiziert, nicht mehr Hypothese):
fehlende Divergenz-Prüfung/-Meldung.

## Fix-Ansatz

Kombination beider im Ticket vorgeschlagenen Ideen, da sie sich ergänzen (Diagnose vs.
Prävention):

1. **Divergenz-Warnung:** Vor Phase 1 (Diff-Check) `git rev-list --count HEAD..origin/main`
   ermitteln. Ist der Wert > 0, eine deutliche Warnzeile ausgeben (Anzahl fehlender Commits +
   Hinweis, dass CI gegen eine aktuellere Basis prüft). Kein `exit 1` — die Warnung ist
   informativ, kein hartes Gate (ein Operator kann bewusst mit veraltetem lokalem Stand
   arbeiten wollen, z. B. isolierte Artefakt-Diagnose).
2. **Basis-Transparenz:** Die abschließende Erfolgsmeldung („✓ All generated artifacts are
   fresh") und ggf. Fehlermeldungen nennen den gemessenen `HEAD`-Kurz-SHA, damit im Log
   sichtbar ist, gegen welchen Commit geprüft wurde.

Beide Änderungen bleiben innerhalb des bestehenden `freshness:check`-Tasks in `Taskfile.yml` —
kein neues Skript, kein neuer Task nötig; die Logik ist ein zusätzlicher Shell-Block vor Phase
1, analog zu den bestehenden `ERRORS`-Zählern in derselben Task-Definition.

## Betroffene Subsysteme

- `Taskfile.yml` (`freshness:check` Task) — einzige Änderung.
- Keine Änderung an `freshness:regenerate`, `freshness:graph-check`, `quality:check` oder den
  CI-Workflows selbst (`.github/workflows/ci.yml` ruft `task freshness:check` unverändert auf;
  die Warnung ist rein lokal relevant, da CI per Konstruktion nie hinter `origin/main`
  zurückliegt).

## Edge-Cases

- **Kein `origin`-Remote / kein Netzwerkzugriff:** `git rev-list --count HEAD..origin/main`
  schlägt fehl, wenn `origin/main` lokal nicht existiert (z. B. Shallow-Checkout ohne vorheriges
  `git fetch`). Der Befehl darf den Task nicht hart brechen — Fallback: Fehler unterdrücken
  (`2>/dev/null || echo 0`), keine Warnung ausgeben, wenn die Zählung nicht möglich ist (kein
  Fehlalarm, kein Absturz).
- **Branch ist VOR `origin/main`** (unpushte lokale Commits): kein Warnfall — die Warnung
  betrifft ausschließlich „lokal hinter origin/main", nicht „lokal voraus".
- **`origin/main` ist selbst veraltet** (kein `git fetch` seit Tagen): die Warnung basiert auf
  dem lokal bekannten `origin/main`-Ref-Stand, kann also selbst veraltet sein. Das ist ein
  akzeptierter Kompromiss — ein automatisches `git fetch` innerhalb von `freshness:check` wäre
  ein Netzwerk-Seiteneffekt in einem sonst rein lokalen Task und außerhalb des Ticket-Scopes.
