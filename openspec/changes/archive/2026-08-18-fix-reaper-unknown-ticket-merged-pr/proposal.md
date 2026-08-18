# Proposal: fix-reaper-unknown-ticket-merged-pr

## Why

Der Ticket-DB-Drop vom 2026-08-18 hat `scripts/branch-reaper.sh` funktional stillgelegt. Für
jede `external_id` unterhalb `T012401` antwortet `ticket.sh get --id <id>` mit rc=0 und **leerer**
stdout. Das Ticket-Gate wertet das als „Status nicht ermittelbar" und bricht mit `continue` ab —
noch bevor die bereits vorhandenen Positiv-Signale aus T007032 ausgewertet werden.

**Symptom vs. Ursache (T002448-M5):** Beobachtet ist, dass der Sweep nichts mehr abräumt. Die
Ursache ist nicht ein fehlendes Signal, sondern die **Reihenfolge** — die Fähigkeit existiert und
ist unerreichbar, weil sie hinter dem abbrechenden Gate steht.

```bash
# MESSUNG (2026-08-18, Repo-Stand 9f5e0b717 — der Stand, gegen den gemessen wurde)
bash scripts/branch-reaper.sh --sweep --dry-run | grep -c 'Ticket-Status nicht ermittelbar'
# => 10  (von 15 evaluierten Branches)

# Gegenprobe: wie viele davon haben einen nachweislich gemergten PR?
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | sed 's|^origin/||'); do
  gh pr list --head "$b" --state merged --json number -q '.[0].number' | grep -q . && echo "$b"
done | wc -l
# => 8
```

Der Reaper ist fail-closed, löscht also nichts Falsches. Aber er räumt strukturell nichts mehr
ab, und der Remote-Branch-Bestand wächst monoton.

## What

Der **leere** (nicht ermittelbare) Ticket-Status reicht künftig auf die Positiv-Signale durch,
statt sofort abzubrechen. Ein **gelesener**, aber nicht-terminaler Status (`in_progress`) bleibt
ein hartes KEEP — nur die fehlende Messung reicht durch, nicht die negative Aussage.

Entscheidend ist die Auflage in der Gegenrichtung: Bei unbekanntem Ticket-Status **muss** ein
Positiv-Signal greifen. Der Branch darf **nicht** auf den Blob-Allowlist-Check durchfallen.
„Ticket done" und „Blob-Diff in der Allowlist" sind bewusst zwei nötige Signale — die Allowlist
allein hätte die einzige Kopie eines nie gemergten Deliverables gelöscht (T002431). Ohne
Positiv-Signal bleibt es beim bisherigen KEEP samt bisheriger Begründung.

**Spec-Umkehr:** `openspec/specs/batch-repo-hygiene-ops-fixes.md` sichert heute zu (T006329),
dass ein Branch mit leerer Ticket-Antwort mit der Begründung „Ticket-Status nicht ermittelbar"
behalten wird. Das wird per `MODIFIED`-Delta präzisiert statt still danebengeschrieben: Der Kern
jenes Requirements war der stille Exit-1-Absturz mitten im Lauf, nicht die KEEP-Politik. Der
zugehörige Guard `tests/spec/ci-cd/branch-reaper-empty-answer.bats` stubt `gh` auf „nirgends ein
PR" und trifft den neuen Pfad nicht — er bleibt unverändert grün.

_Ticket: T012412_
