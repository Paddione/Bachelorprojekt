---
title: "watchdog-blocked-pr-transition — Implementation Plan"
ticket_id: T015820
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# watchdog-blocked-pr-transition — Implementation Plan

_Ticket: T015820_

Fix-Pfad: Ein Exec-Ticket, das per unfactory auf `blocked` eskaliert wurde, bleibt
dort hängen, obwohl sein Implementierungs-PR offen ist. Neues Pattern 5 in
reconcile-ticket-status.sh überführt solche Tickets nach `in_review`.

## File Structure

```
scripts/factory/reconcile-ticket-status.sh          # Pattern 5 ergänzen (Scan + Transition)
tests/spec/factory-watchdog/blocked-pr-transition.bats   # NEU — RED→GREEN BATS
```

### Budgets (S1, wirksame Schwellen)

| Datei | Ist | Baseline | Wirksame Schwelle | Budget |
|---|---|---|---|---|
| scripts/factory/reconcile-ticket-status.sh | 268 | nicht-baselined | 800 (.sh-Limit gates.yaml) | ~532 — Pattern 5 (~70 Zeilen) passt komfortabel |
| tests/spec/factory-watchdog/blocked-pr-transition.bats | neu | — | 800 (.sh/.bats-Familie) | voll |

## Tasks

### P1 — Pattern 5 „blocked-with-open-PR" in reconcile-ticket-status.sh [factory]

- [ ] **Failing-Test-Step (RED).** Zuerst die BATS-Datei anlegen und rot laufen lassen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/blocked-pr-transition.bats
# expected: FAIL (red — Pattern 5 existiert noch nicht; der Transition-Fall findet
# keinen Übergang und das Fixture bleibt blocked)
```

Testaufbau (Prüfmodus: Output-/Resultat-Verifikation T002448-M4, Spiegel von
merged-ticket-close.bats):
- Fixture via `_fixture_psql`-Konvention (k3d Dev-DB, `< /dev/null`-Stdin-Drain):
  Ticket mit `status='blocked'`, `updated_at` im INSERT zurückdatiert auf -40min
  (`fn_lifecycle_ts` überschreibt bei UPDATE jede Alterung, T002620), Titel-Suffix
  SF-REAL-* gegen den purge_real_feature-Titel-Guard, Registrierung für _sf_teardown.
  Kein Agent-Lock auf der Fixture-ID.
- Fake-`gh` auf PATH legen (Stub, der `pr list --state open …` mit einer Zeile
  `<prnummer>\t<Titel mit [T<fixture-id>]>` beantwortet) — kein Netzzugriff im Test.
- Lauf: `BRAND=mentolder bash scripts/factory/reconcile-ticket-status.sh`; Assertion
  per `ticket.sh get`: status=in_review. Positiv-Anker ist dieser echte Übergang.
- Negativfälle (je eigener @test, Reihenfolge nach T002356-M1 hinter dem Positiv-Anker):
  zweites Blocked-Fixture OHNE passenden PR bleibt blocked; drittes Fixture MIT PR aber
  mit gesetztem Agent-Lock bleibt blocked; `--dry-run` ändert nichts, meldet aber den
  geplanten Übergang auf stderr; fehlendes `gh` (PATH ohne gh-Stub) bricht den Lauf
  nicht ab und ändert keinen Status.

- [ ] **Fix-Step (GREEN).** Pattern 5 am Ende von reconcile-ticket-status.sh im
      nummerierten Stil der Patterns 1–4b ergänzen (Header-Kommentar oben um die
      Zeile „5. blocked-with-open-PR" erweitern):

  - Kandidaten-Query analog Patterns 4/4b: `SELECT external_id FROM tickets.tickets
    WHERE status = 'blocked' AND type NOT IN ('project','incident') AND updated_at <
    now() - interval '30 minutes' ORDER BY updated_at DESC;` (Karenz schützt frische
    Eskalationen vor dem Tick-Rennen).
  - PR-Liste EINMAL pro Lauf holen, im Stil auto-close-merged.sh:
    `gh pr list --state open --limit 100 --json number,title`. Fehler oder leeres
    Ergebnis ⇒ WARN auf stderr, Sweep übersprungen (fail-open, Requirement
    „gh-Ausfall bricht den Sweep nicht ab"). Für Tests über PATH-Stub erreichbar,
    KEINE produktive Env-Injektion nötig.
  - Match pro Kandidat: literaler Tag `[T<ext_id>]` im PR-Titel (Muster wie
    auto-close-merged.sh/extract_ticket_ids_from_title, M2/T002506).
  - Guard vor Write: `agent-lock.sh check ticket <ext_id>` gehalten ⇒ Skip (Spiegel
    der T002770-Signale); `--dry-run` meldet geplanten Übergang ohne Write (bestehende
    DRY_RUN-Mechanik des Skripts nutzen).
  - Transition im reconcile-Stil: `status → 'in_review'`,
    `attention_mode = 'auto'` (IS DISTINCT FROM-Guard wie Patterns 4/4b),
    `readiness.factory_excluded` bewusst NICHT anfassen (Begründung steht im
    Delta-Spec-Requirement), Audit-Kommentar kind='watchdog' mit PR-Nummer und
    Übergangsvermerk. Idempotent: nach dem ersten Lauf matcht die Status-Bedingung
    nicht mehr.
  - Kein Kommentar im Stay-blocked-Fall (Spam-Schutz pro Tick).

### P2 — Verifikation [test]

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich gezielt: `tests/unit/lib/bats-core/bin/bats tests/spec/factory-watchdog/`
(alle Bestandsguards der Spec müssen grün bleiben).
