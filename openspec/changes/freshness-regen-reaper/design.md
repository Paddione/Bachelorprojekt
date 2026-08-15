# Design: freshness-regen-Reaper-Regel

## Symptom vs. Ursache (T002448-M5)

**Symptom (Fakt, reproduzierbar):** `chore/freshness-regen-<run-id>`-Branches akkumulieren auf
`origin`. Messung vom 2026-08-14 (Arbeitsbaum 9f5fb1ccb, origin/main frisch gefetcht) zeigte 10
Branches; am 2026-08-15 sind es 15. `bash scripts/branch-reaper.sh --sweep --dry-run` KEEPt alle
mit der Begründung „keine Ticket-ID im Branch-Namen erkennbar".

**Ursache (verifiziert, nicht Hypothese):** Zwei Faktoren greifen ineinander:

1. **Der Merge-Flow löscht die Branches nicht.** Seit T004612 ist `delete_branch_on_merge=false`
   im Repo gesetzt. Der Workflow `.github/workflows/freshness-regen.yml` ruft zwar
   `gh pr merge --auto --squash --delete-branch` auf — die Verifikation zeigt: **alle 15**
   Branches gehören zu PRs mit `state=MERGED`, die Branches existieren trotzdem auf origin.
   Der `--delete-branch` des Workflows greift unter `delete_branch_on_merge=false` nicht
   zuverlässig (T004612).
2. **Der Reaper kann die Klasse nicht prüfen.** Löschkriterium 1 des Reapers verlangt eine
   Ticket-ID im Branch-Namen; Kriterium 3 (Ticket-Status done/archived) ist für Branches ohne
   Ticket-ID nicht auswertbar. Die Sweep-Regel „unverifizierbar → verschonen" (T003074) ist
   korrekt — für diese eine, maschinell erzeugte Branch-Klasse fehlt aber ein Ersatzkriterium,
   das an die Stelle der Ticket-ID tritt: der PR-Status (analog zu den plan-archive-KEEPs).

## Prior-Art (T002829)

- **Sweep-CLI** (PR #4188, gemergt 2026-08-10): `--sweep`-Modus, Kriterien 1–4, Output-Vertrag
  `REAP`/`KEEP`, Archiv-Tag-Netz `refs/tags/reaped/<branch>`. Der Change-Ordner
  `openspec/changes/branch-reaper-sweep-cli/` ist ein Archiv-Relikt.
- **plan-archive-KEEP-Präzedenz:** Branches der Factory-Archivierung (`chore/plan-archive-*`)
  werden über den normalen Sweep-Pfad erfasst (PR-Status + Blob-Check), weil sie Ticket-IDs
  tragen. Die freshness-Klasse trägt keine Ticket-ID — der PR-Status ist das einzige
  verfügbare Abschluss-Signal.
- **Tests:** `tests/spec/ci-cd/branch-reaper-sweep.bats` (Stub-Technik: PATH-gh-Stub,
  `TICKET_SH`-Stub, Wegwerf-Git-Repo mit bare Remote), `branch-reaper.bats` (Einzel-Ticket),
  `branch-reaper-local-ref.bats` (T003182).
- **Specs:** Parent-SSOT für das Reaper-Verhalten ist `openspec/specs/ci-cd.md`
  („Local Branch Ref is Reaped after Remote Deletion", T003182). Die Sweep-Anforderung steht in
  `openspec/specs/batch-repo-hygiene-ops-fixes.md`.

## Entscheidung

**Regel:** Im Sweep-Modus entscheidet für Branches, die dem Muster `chore/freshness-regen-*`
entsprechen und keine Ticket-ID tragen, der **PR-Status** statt des Ticket-Status:

1. `gh pr list --head <branch> --state all --json state` auswerten.
   - gh-Fehler → `KEEP` (gleiche Fehlerbehandlung wie Kriterium 2 heute: Exit-Code auswerten,
     nicht die leere Ausgabe).
   - Kein PR gefunden → `KEEP` (unverifizierbar → verschonen, T003074-Muster).
   - `OPEN` vorhanden → `KEEP` (Auto-Merge läuft noch).
   - `MERGED` oder `CLOSED` vorhanden → weiter mit Schritt 2.
2. **Blob-Check unverändert:** `_diverging_files` gegen `origin/main` + bestehende
   `ALLOWLIST`-Prüfung. Abweichung außerhalb der Allowlist → `KEEP`, sonst `REAP`.

**Allowlist-Entscheidung (messungsbasiert):** Die bestehende `ALLOWLIST` wird **unverändert
wiederverwendet** — keine eigene „Generat-Allowlist". Verifikation am 2026-08-15 über **alle 15**
lebenden Branches: jede divergiert von `origin/main` in exakt **einer** Datei, immer unter
`docs/code-quality/*` — bereits in der ALLOWLIST:

```bash
# Stand: 2026-08-15, alle 15 chore/freshness-regen-* auf origin
for b in $(git ls-remote --heads origin | grep 'chore/freshness-regen' | awk '{print $2}' | sed 's|refs/heads/||'); do
  mb=$(git merge-base origin/main origin/$b)
  git diff --name-only "$mb" "origin/$b" | sed 's|/[^/]*$|/*|' | sort -u
done | sort -u
# → docs/code-quality/*
```

Die Freshness-Ausgabe (test-inventory.json, openspec-status.json, route-manifest.json,
learning-assets.generated.json, goals-data.generated.json, docs/generated/*,
docs/diagrams/architecture.md, docs/agent-guide/*, docs/code-quality/*) liegt damit praktisch
vollständig in der Allowlist. Zukünftige Generat-Ausgaben, die außerhalb liegen, erzeugen einen
konservativen `KEEP` (falsches Verschonen, nie falsches Löschen) — die sichere Richtung.

**Nicht-Ziele:**

- Kein Löschen von freshness-Branches mit offenem oder fehlendem PR.
- Keine Änderung am Einzel-Ticket-Modus (`--ticket`): der filtert Kandidaten bereits über die
  Ticket-ID, freshness-Branches erreichen ihn nie.
- Keine Änderung an der `ALLOWLIST` selbst, an den Lösch-Mechanik (Archiv-Tag-Netz,
  `_reap_local_ref`), an `agent-lock.sh` oder am Freshness-Workflow (`.github/workflows/`).
- Keine Änderung an der „keine Ticket-ID"-KEEP-Regel für andere Branch-Klassen.

## Trade-offs

| Richtung | Bewertung |
|---|---|
| PR-Status statt Ticket-Status | Einziges verfügbares Abschluss-Signal; identisches Muster zur plan-archive-Präzedenz. Risiko: ein manuell geöffneter, niemals gemergter PR (CLOSED) gibt den Branch frei — gemildert durch den Blob-Check (nur Allowlist-Abweichung). |
| `--state all` statt `--state open` | Notwendig, um gemergte/geschlossene PRs zu sehen; die bestehende `--state open`-Abfrage bleibt für alle anderen Branches unverändert. |
| Bestehende ALLOWLIST | Empirisch ausreichend (15/15 Branches nur `docs/code-quality/*`); vermeidet eine zweite Allowlist, die bei jeder neuen Generat-Ausgabe gepflegt werden müsste. |
| Pattern nur im Sweep-Modus | Der Sweep ist der produktive Aufräumlauf (repo-hygiene); der Einzel-Ticket-Pfad bleibt unberührt. |
