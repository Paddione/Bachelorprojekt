---
title: "repo-hygiene-merge-reconcile — Implementation Plan"
ticket_id: T900103
domains: [repo-hygiene]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# repo-hygiene-merge-reconcile — Implementation Plan

_Ticket: T900103_

## File Structure

```
tests/spec/agent-skills/repo-hygiene-auto-close-merged-mandatory.bats  (new, already committed on this branch)
.opencode/skills/references/repo-hygiene-ops.md                       (modified, canonical source — .claude/skills/references is a symlink onto this directory, mirrors automatically)
```

## Task 1: Verbindlichen Reconcile-Aufruf in §3 verankern (RED → GREEN)

**Kontext (aus dem Ticket, nicht neu zu verhandeln):** Die Messung vom
2026-09-20 zeigt sieben gemergte PRs (2026-09-04), deren Tickets offen
blieben. Weder GitHub-Metadaten noch die Phasen-Kette unterscheiden
Auto-Merge von Hand-Merge (Kontroll-PR #5767 sieht identisch aus) — Punkt 1/2
der ZU-KLAEREN-Liste sind damit rueckwirkend unbeantwortbar und NICHT Teil
dieses Plans. Das Netz `scripts/factory/auto-close-merged.sh` existiert,
funktioniert (Dry-Run 2026-09-20 sauber) und bleibt unveraendert; seine
Einhaengung in `scripts/factory/wakeup.sh:248` bleibt unveraendert. Die
Nutzerentscheidung vom 2026-09-20 macht **allein** den Aufruf aus dem
repo-hygiene-Skill verbindlich, damit das Netz auch greift, wenn die Factory
nicht laeuft. Kein neuer Cron, kein neuer GitHub-Workflow.

**RED:**
```bash
cd tests/unit/lib/bats-core && cd ../../.. 2>/dev/null; true
./tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/repo-hygiene-auto-close-merged-mandatory.bats
# expected: FAIL — Test 2 ("§3 ruft auto-close-merged.sh...") und Test 3
# ("...unabhaengig von der laufenden Factory begruendet") schlagen fehl, weil
# §3 den Aufruf noch nicht enthaelt. Test 1 (Symlink-Vorbefund) ist bereits GREEN.
```

**GREEN — Aenderung:** In `.opencode/skills/references/repo-hygiene-ops.md`,
Abschnitt `## 3. PR-Triage → verknüpftes Ticket schließen`, nach dem
bestehenden Block "Ticket schließen, sobald `mergedAt` gesetzt ist" (vor dem
Abschnitt "PR-Branch auf `main` nachziehen") einen neuen Unterabschnitt
einfuegen, der:

1. Den Aufruf als **verbindlichen** Schritt des repo-hygiene-Laufs markiert
   (nicht optional), mit der Begruendung, dass das bestehende Netz nur
   greift, wenn die Factory laeuft — der repo-hygiene-Aufruf schliesst genau
   diese Luecke.
2. Den ausfuehrbaren Befehl fuer beide Brands zeigt (`BRAND=mentolder` und
   `BRAND=korczewski`), analog zur bestehenden Schleife in
   `scripts/factory/wakeup.sh:248`.
3. Referenziert T900103 und die Messung vom 2026-09-20 (7 Faelle,
   2026-09-04) als Beleg, ohne Punkt 1/2 der ZU-KLAEREN-Liste erneut
   aufzurollen.

Beispieltext (Platzierung und genauer Wortlaut liegen beim Implementierer,
folgende Eckpunkte sind Pflicht — Ueberschrift, beide `BRAND=`-Zeilen, das
Wort "verbindlich" und die Begruendung "wenn die Factory nicht laeuft"):

```markdown
### Sicherheitsnetz: gemergte PRs gegen offene Tickets abgleichen (T900103)

Dieser Abgleich ist **verbindlicher** Bestandteil jedes repo-hygiene-Laufs —
nicht optional. `scripts/factory/auto-close-merged.sh` laeuft bereits ueber
`scripts/factory/wakeup.sh:248`, aber nur waehrend die Factory tickt; laeuft
sie nicht (Ausfallfenster, manuell gestoppt), bleibt das PR-Ticket-Delta
unentdeckt — genau das Muster der sieben Faelle vom 2026-09-04 (T900103,
Messung 2026-09-20). Deshalb hier zusaetzlich, unabhaengig vom Factory-Takt:

```bash
for _acm_brand in mentolder korczewski; do
  BRAND="$_acm_brand" bash scripts/factory/auto-close-merged.sh --dry-run
done
```

Findet der Dry-Run Nachzuegler, ohne `--dry-run` erneut ausfuehren. Das
Skript und seine `wakeup.sh`-Einhaengung bleiben unveraendert (T900103) —
neu ist nur dieser verbindliche Aufruf aus dem repo-hygiene-Ablauf.
```

**GREEN-Verifikation:**
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/repo-hygiene-auto-close-merged-mandatory.bats
# expected: alle 3 Tests GREEN
```

## Task 2: Finale Verifikation

```bash
task test:spec:changed
task freshness:regenerate
task freshness:check
```

`task test:changed` bricht lokal bekanntermassen an `runtime-drift-check`
(Live-DB-Drift, T900248) ab — unabhaengig von dieser Aenderung. Beleg fuer
diesen Plan ist `task test:spec:changed` (grenzt auf die geaenderten
Spec-Pfade ein und umgeht den Drift-Check).
