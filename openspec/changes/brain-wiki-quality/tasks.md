---
title: "brain-wiki-quality — Implementation Plan"
ticket_id: T001963
domains: [brain, ingest, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-wiki-quality — Implementation Plan

_Ticket: T001963 · Design-Spec: `docs/superpowers/specs/2026-07-19-brain-wiki-quality-design.md` (D1–D5)_

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|---|---|---|
| `scripts/brain-ingest-prune.sh` | 0 (neu) | 500 |
| `scripts/brain-ingest.sh` | 474 | 26 |
| `scripts/brain-ingest-transform.sh` | 106 | 394 |
| `tests/spec/brain-foundation.bats` | 159 | ungated |
| `.claude/skills/brain-ingest/SKILL.md` | 57 | ungated |
| `openspec/changes/brain-wiki-quality/specs/brain-foundation.md` | 12 | ungated |

**S1-Hinweise (wirksame Schwellen, alle Dateien nicht-baselined):**
- `scripts/brain-ingest.sh` Ist 474 · Limit 500 → **Budget 26 — hart.** Die Prune-Logik lebt
  deshalb vollständig in der NEUEN Datei `scripts/brain-ingest-prune.sh`; `brain-ingest.sh`
  bekommt nur Flag-Parsing plus den Phasen-Aufruf (netto ≤ 26 Zeilen, Ziel ≤ 15).
- `scripts/brain-ingest-prune.sh` neu → Budget 500; Ziel ≤ 200 Zeilen (Wachstumsreserve).
- `scripts/brain-ingest-transform.sh` Ist 106 · Limit 500 → Budget 394 — Validierung, Retry
  und Prompt-Schärfung passen locker.
- `.bats`-Dateien und `.md`-Dateien haben kein S1-Extension-Limit (ungated).

**S4-Gate:** `scripts/brain-ingest-prune.sh` ist neu und braucht eine Referenz aus
`docs/**`, Taskfile oder einem Skill (`openspec/specs/` zählt NICHT als reference_source).
Die Referenz wird in Task 4 in `.claude/skills/brain-ingest/SKILL.md` ergänzt.

**Ist-Zustand (Intel, verifiziert gegen die Dateien):**
- `scripts/brain-ingest.sh` — 4 Phasen (Phase 1 Preparation → Phase 2 LLM Transformation →
  Phase 2b MOC Generation → Phase 3 Quality Gates → Phase 4 Delivery). Keine Prune-/Delete-Phase.
  CLI: `bash scripts/brain-ingest.sh --brain-repo <path> [--dry-run] [--pilot N] [--state <path>] [--branch <name>]`.
  State-File `~/.brain-ingest-state.json` (Env-Override `BRAIN_INGEST_STATE`), Format:
  `{"<src_path>": {"hash": "…", "slug": "…", "type": "…", "transformed_at": "…"}}` (434 Einträge live).
- `scripts/brain-ingest-transform.sh` — Aufruf (real, aus Z.7 + dem Call in brain-ingest.sh Z.166):
  `brain-ingest-transform.sh <source_file> <type> <slug> <slugs_json> <tag_defaults_json>`;
  Env `LM_STUDIO_URL` (Default `http://localhost:8095`), `LM_MODEL`, `MAX_SOURCE_CHARS`.
  Prompt Z.52–72, `max_tokens: 2048` in Z.80, einzige Output-Validierung: Frontmatter-Delimiter
  (Z.99). Keine `source::`-/Wikilink-Prüfung, kein Retry.
- `scripts/brain-ingest-worklist.sh` — `--root <repo> --manifest scripts/brain/ingest-sources.yaml`
  → TSV `pfad\tslug\tgruppe`; wird von der Prune-Kandidaten-Ermittlung nur lesend genutzt.

---

## Task 1 — RED: BATS-Tests für Prune-Kriterium und Transform-Validierung

**Datei:** `tests/spec/brain-foundation.bats` (≤ 2h)

Neue `@test`-Blöcke ans Ende der bestehenden Spec-Datei anhängen (BATS-Konvention: kein neues
ticket-nummeriertes File). Alle Fixtures leben in `$BATS_TEST_TMPDIR` nach dem
Temp-Repo-Muster aus `tests/spec/plan-context.bats` (T001895) — **keine Mutation des echten
Repos**, kein echter LLM-Call.

**Fixture-Aufbau (Prune, in einem `setup`-Helper `make_prune_fixture`):**

```bash
make_prune_fixture() {
  FIX="$BATS_TEST_TMPDIR/fix"
  mkdir -p "$FIX/repo/docs" "$FIX/brain/wiki"
  # Quell-Repo: kept.md existiert, gone.md existiert NICHT
  printf 'kept\n' > "$FIX/repo/docs/kept.md"
  # Worklist-TSV (Format: pfad \t slug \t gruppe)
  printf 'docs/kept.md\tdocs-kept\tcore-docs\n' > "$FIX/worklist.tsv"
  # Wiki-Seiten
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsource:: Bachelorprojekt docs/kept.md\nbody [[docs-kept]]\n' \
    > "$FIX/brain/wiki/docs-kept.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsource:: Bachelorprojekt docs/gone.md\nbody\n' \
    > "$FIX/brain/wiki/docs-gone.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nno source line\n' \
    > "$FIX/brain/wiki/orphan-with-state.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsource:: self\nmeta page\n' \
    > "$FIX/brain/wiki/SCHEMA-notes.md"
  # State-File: reverse-map für orphan-with-state (Quellpfad docs/vanished.md existiert nicht)
  printf '{"docs/vanished.md":{"hash":"h1","slug":"orphan-with-state","type":"note","transformed_at":"2026-07-15T00:00:00Z"}}\n' \
    > "$FIX/state.json"
}
```

**Neue Testfälle (Assertions müssen exakt zu den Task-2/3-Snippets passen):**

1. `prune default run lists stale source:: page as candidate without deleting` — run
   `bash "$REPO_ROOT/scripts/brain-ingest-prune.sh" --brain-repo "$FIX/brain" --root "$FIX/repo" --worklist "$FIX/worklist.tsv" --state "$FIX/state.json"`;
   erwartet `status -eq 0`, `[[ "$output" == *"PRUNE-CANDIDATE: wiki/docs-gone.md"* ]]`,
   Datei `$FIX/brain/wiki/docs-gone.md` existiert noch, `docs-kept.md` erscheint NICHT als Kandidat.
2. `prune state-reverse-map flags page without source:: whose state source vanished` —
   gleicher Lauf; `[[ "$output" == *"PRUNE-CANDIDATE: wiki/orphan-with-state.md"* ]]`.
3. `prune --prune deletes candidates and cleans state entries` — Lauf mit `--prune`;
   erwartet: `docs-gone.md` und `orphan-with-state.md` gelöscht, `docs-kept.md` vorhanden,
   `jq -e '."docs/vanished.md"' "$FIX/state.json"` schlägt fehl (Eintrag entfernt),
   `[[ "$output" == *"PRUNED: wiki/docs-gone.md"* ]]`.
4. `prune never deletes meta pages (source self / no state entry)` — Lauf mit `--prune`;
   `$FIX/brain/wiki/SCHEMA-notes.md` existiert danach weiterhin und taucht nicht in
   `PRUNE-CANDIDATE:`-Zeilen auf.
5. `transform fails closed when output lacks source:: after one retry` — Mock-LLM statt
   echtem Server: ein Python-One-Shot-HTTP-Server auf einem ephemeren Port, der pro Request
   einen Zähler in `$BATS_TEST_TMPDIR/hits` hochzählt und eine kanonische Chat-Completion
   mit einem Body OHNE `source::`-Zeile liefert (`{"choices":[{"message":{"content":"---\ntype: note\ntags: [x]\nstatus: active\n---\nkein rueckverweis"}}]}`).
   Dann `LM_STUDIO_URL="http://127.0.0.1:$PORT" run bash "$REPO_ROOT/scripts/brain-ingest-transform.sh" "$FIX/repo/docs/kept.md" note docs-kept "$SLUGS_JSON" '["note"]'`;
   erwartet `status -ne 0`, `[[ "$output" == *"validation: missing source:: line"* ]]`,
   `[ "$(cat "$BATS_TEST_TMPDIR/hits")" -eq 2 ]` (genau 1 Retry).
6. `transform passes a valid output with source:: and a body wikilink first try` — Mock
   liefert Content mit `source:: Bachelorprojekt docs/kept.md` und `[[docs-kept]]` im Body;
   erwartet `status -eq 0`, Hit-Count 1, Output enthält `source::`.
7. `transform requests max_tokens 3072 and carries the language rule` — statische Prüfung:
   `grep -q 'max_tokens: 3072' "$REPO_ROOT/scripts/brain-ingest-transform.sh"` und
   `grep -q 'Mischübersetzung' "$REPO_ROOT/scripts/brain-ingest-transform.sh"`.

**RED-Nachweis (Pflicht, vor Task 2/3 ausführen):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats
# expected: FAIL — brain-ingest-prune.sh existiert noch nicht (Tests 1–4),
# transform validiert weder source:: noch Wikilinks und kennt keinen Retry (Tests 5–7).
```

Die bestehenden 17 Tests der Datei müssen dabei weiterhin grün bleiben (nur die neuen sind rot).

---

## Task 2 — GREEN: `scripts/brain-ingest-prune.sh` (neu)

**Datei:** `scripts/brain-ingest-prune.sh` (≤ 2h, Ziel ≤ 200 Zeilen, Budget 500)

Neue eigenständige Datei mit `set -euo pipefail`, `chmod +x`. CLI:

```bash
# brain-ingest-prune.sh — Deletion-Sync: entfernt Wiki-Seiten, deren Quelle
# im Bachelorprojekt nicht mehr existiert (D1/D2, T001963).
# Usage: brain-ingest-prune.sh --brain-repo <path> [--root <repo-root>] \
#          [--worklist <tsv>] [--state <path>] [--prune]
# Default: dry (nur PRUNE-CANDIDATE-Zeilen listen). --prune löscht scharf.
```

- `--root` Default: Repo-Root (wie in `brain-ingest.sh` über `BASH_SOURCE` ermittelt).
- `--worklist` Default: selbst generieren via
  `bash scripts/brain-ingest-worklist.sh --root "$ROOT" --manifest scripts/brain/ingest-sources.yaml`
  in ein `mktemp`-File. **Wichtig:** immer die VOLLE Worklist, nie eine Pilot-gekürzte —
  deshalb generiert das Prune-Skript sie selbst statt die (ggf. gekürzte) des Orchestrators
  zu übernehmen. Der `--worklist`-Override existiert für die BATS-Fixtures.
- `--state` Default: `${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}`.

**Kandidaten-Ermittlung (D1) — Schleife über `"$BRAIN_REPO"/wiki/*.md`:**

```bash
src_line="$(grep -m1 '^source:: ' "$page" || true)"
slug="$(basename "$page" .md)"
if [[ "$src_line" == "source:: Bachelorprojekt "* ]]; then
  src_path="${src_line#source:: Bachelorprojekt }"
  # Kandidat nur wenn Quelle weg UND nicht in der Worklist (Spalte 1)
  if [ ! -e "$ROOT/$src_path" ] && ! cut -f1 "$WORKLIST" | grep -qxF "$src_path"; then
    candidate=1
  fi
elif [ -z "$src_line" ] || [[ "$src_line" != "source:: Bachelorprojekt "* ]]; then
  # Reverse-Map: State-Eintrag mit diesem Slug, dessen Quellpfad verschwunden ist
  state_src="$(jq -r --arg s "$slug" 'to_entries[] | select(.value.slug == $s) | .key' "$STATE_FILE" | head -1)"
  if [ -n "$state_src" ] && [ ! -e "$ROOT/$state_src" ] \
     && ! cut -f1 "$WORKLIST" | grep -qxF "$state_src"; then
    candidate=1
  fi
  # Weder Bachelorprojekt-source:: noch State-Eintrag → Meta-Seite, NIE löschen
  # (fällt ins Orphan-Audit, Mensch entscheidet — D1)
fi
```

Anmerkung zur Mischübersetzungs-Falle im eigenen Code: MOC-Seiten tragen
`source:: Bachelorprojekt scripts/brain/ingest-sources.yaml` — die Quelle existiert, sie
bleiben also per Konstruktion stehen; keine Sonderbehandlung nötig.

**Ausgabe/Aktion (D2):**

```bash
echo "PRUNE-CANDIDATE: wiki/$slug.md (source: ${src_path:-$state_src})"
if [ "$DO_PRUNE" -eq 1 ]; then
  rm -f "$page"
  # State-Eintrag mitbereinigen (flock-geschützt wie in brain-ingest.sh process_page)
  ( flock -x 200
    tmp="$(mktemp)"
    jq --arg k "${src_path:-$state_src}" 'del(.[$k])' "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
  ) 200>"$STATE_FILE.lock"
  echo "PRUNED: wiki/$slug.md"
fi
```

Abschlusszeile `Prune: <n> Kandidaten (<gelöscht|dry>)` auf stdout, Exit 0 auch bei 0
Kandidaten. Damit werden die Tests 1–4 aus Task 1 grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats
```

---

## Task 3 — GREEN: Transform-Härtung in `scripts/brain-ingest-transform.sh`

**Datei:** `scripts/brain-ingest-transform.sh` (≤ 2h, Ist 106, Budget 394)

1. **Prompt-Sprachregel schärfen** (im Prompt-Block Z.52–72): die Zeile
   `- Deutsch-Prosa, englische Fachbegriffe` ersetzen durch
   `- Sprachregel: durchgängig deutsche Prosa ODER englische Original-Passagen unverändert belassen — NIEMALS Wort-für-Wort-Mischübersetzung (Denglisch)` —
   das Wort `Mischübersetzung` ist Test-Anker (Task-1-Test 7).
2. **`max_tokens` 2048 → 3072** (Z.80, D5) — im jq-Payload `max_tokens: 3072`
   (Test-Anker `grep 'max_tokens: 3072'`; jq-Objekt-Syntax mit Leerzeichen nach dem
   Doppelpunkt beibehalten, sonst matcht der Test nicht).
3. **Curl-Aufruf in Funktion extrahieren** `call_llm <prompt>` (setzt `OUTPUT`, inkl.
   bestehendem Fence-Strip und Frontmatter-Delimiter-Check).
4. **Fail-closed-Validierung** `validate_output`:

```bash
validate_output() {
  local out="$1"
  if ! echo "$out" | grep -q '^source:: '; then
    echo "validation: missing source:: line" >&2
    return 1
  fi
  local body
  body="$(echo "$out" | awk 'BEGIN{fm=0} /^---[[:space:]]*$/{fm++; next} fm>=2{print}')"
  if ! echo "$body" | grep -q '\[\['; then
    echo "validation: no [[wikilink]] in body" >&2
    return 1
  fi
}
```

5. **Genau 1 Retry mit Fehlerhinweis (D3):**

```bash
call_llm "$PROMPT"
if ! validate_output "$OUTPUT"; then
  RETRY_HINT="

WICHTIG — dein vorheriger Versuch war ungültig. Pflicht: eine Zeile 'source:: Bachelorprojekt ${SRC_PATH}' UND mindestens ein [[wikilink]] aus der Slug-Liste im Fließtext."
  call_llm "${PROMPT}${RETRY_HINT}"
  if ! validate_output "$OUTPUT"; then
    echo "error: output invalid after retry (source::/wikilink)" >&2
    exit 1
  fi
fi
echo "$OUTPUT"
```

Temperatur bleibt 0.2 (D3). Die stderr-Zeilen `validation: missing source:: line` und
`validation: no [[wikilink]] in body` sind wortidentisch mit den Task-1-Assertions.
Beachte: `brain-ingest.sh` ruft das Transform-Skript mit `2>/dev/null` auf (Z.166) —
die Fehlerdetails landen im Exit-Code (`FAILED`-Zähler), das ist gewollt sichtbar > still kaputt.

Grün-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats
```

---

## Task 4 — Wiring: `--prune`-Flag im Orchestrator + S4-Referenz im Skill

**Dateien:** `scripts/brain-ingest.sh` (Ist 474, Budget 26 — hart!),
`.claude/skills/brain-ingest/SKILL.md` (≤ 1h)

1. `scripts/brain-ingest.sh` — netto ≤ 26 Zeilen, Ziel ≤ 15:
   - Default `PRUNE=0` neben den bestehenden Defaults; Case-Arm `--prune) PRUNE=1 ;;` im
     Parse-Block; Usage-Kommentar in Z.6 um `[--prune]` ergänzen.
   - Neue Phase 2c zwischen Phase 2b (MOC Generation) und Phase 3 (Quality Gates) —
     so laufen Frontmatter-/Wikilink-Lint über den bereits geprunten Baum:

```bash
# Phase 2c: Prune (Deletion-Sync, T001963) — default dry, --prune schaltet scharf
echo ""
echo "=== Phase 2c: Prune ==="
PRUNE_FLAG=""
[ "$PRUNE" -eq 1 ] && [ "$DRY_RUN" -eq 0 ] && PRUNE_FLAG="--prune"
bash "$HERE/brain-ingest-prune.sh" --brain-repo "$BRAIN_REPO" --root "$REPO_ROOT" \
  --state "$STATE_FILE" $PRUNE_FLAG
```

   (`--dry-run` übersteuert `--prune` defensiv — ein Trockenlauf löscht nie.)
2. `.claude/skills/brain-ingest/SKILL.md` — S4-Referenz für die neue Datei: im
   Schritte-Abschnitt einen Prune-Block ergänzen:

````markdown
### 4. Prune (Deletion-Sync)
Listet Wiki-Seiten, deren Bachelorprojekt-Quelle gelöscht wurde (default dry):
```bash
bash scripts/brain-ingest-prune.sh --brain-repo ~/brain
bash scripts/brain-ingest.sh --brain-repo ~/brain --prune   # scharf, inkl. State-Cleanup
```
Meta-Seiten (source `self` oder ohne Bachelorprojekt-Präfix und ohne State-Eintrag)
werden nie gelöscht.
````

   Zusätzlich im Artefakte-Abschnitt `scripts/brain-ingest-prune.sh` erwähnen. Der
   bestehende SKILL-Test (`brain-ingest SKILL.md references the real orchestrator`) bleibt grün.

Kontrolle des Zeilenbudgets nach der Änderung: `wc -l scripts/brain-ingest.sh` — MUSS ≤ 500 sein.

---

## Task 5 — Dual-Target: Purge-Lauf + Lint-Härtung im externen `Paddione/brain`-Repo

**Extern:** `~/brain` (lokaler Checkout von `Paddione/brain`) — manuell/skriptgestützt,
KEINE Bachelorprojekt-CI (≤ 2h, D4). **Erst NACH Merge des Bachelorprojekt-PR ausführen.**

1. Branch im brain-Repo anlegen und Prune scharf laufen lassen (erwartet ≈ 338 Löschungen):

```bash
cd ~/brain && git checkout -B chore/stale-purge origin/main
cd ~/Bachelorprojekt
bash scripts/brain-ingest-prune.sh --brain-repo ~/brain            # dry: Kandidaten sichten
bash scripts/brain-ingest-prune.sh --brain-repo ~/brain --prune    # scharf
```

2. MOCs neu bauen und Journal pflegen (Skripte des brain-Repos):

```bash
cd ~/brain
bash scripts/build-mocs.sh
printf '%s\n' "- 2026-07-19: Stale-Purge (T001963) — Seiten mit gelöschter Bachelorprojekt-Quelle entfernt, MOCs neu gebaut." >> log.md
```

3. Lint-Härtung im brain-Repo (`~/brain/scripts/lint-frontmatter.sh`): zusätzliche Prüfung,
   dass jede `wiki/*.md`-Seite eine `source::`-Zeile trägt (Fehlermeldung
   `missing source:: back-reference`, Exit non-zero) — im Stil der bestehenden
   `missing required frontmatter field:`-Meldungen.
4. Neues advisory Orphan-Audit-Skript `~/brain/scripts/audit-orphans.sh`: listet Seiten
   ohne eingehenden `[[slug]]`-Link aus einer MOC-Seite auf stdout, Exit immer 0
   (advisory, kein Gate — T001608 Scope B bleibt).
5. Lints lokal laufen lassen (`bash scripts/lint-frontmatter.sh . && bash scripts/lint-wikilinks.sh .`),
   dann PR ins brain-Repo:

```bash
cd ~/brain && git add -A && git commit -m "chore(purge): remove stale pages, harden lints [T001963]"
git push origin chore/stale-purge
gh pr create --repo Paddione/brain --base main --head chore/stale-purge \
  --title "chore(purge): stale-page purge + source:: lint + orphan audit [T001963]"
```

Abnahme (Design-Spec): 0 Wiki-Seiten mit totem `source::`-Pfad; Seitenzahl ≈ 130 + Meta;
ein zweiter Dry-Lauf zeigt 0 Kandidaten (idempotent).

---

## Task 6 — Verifikation (Bachelorprojekt-PR)

**Dateien:** gesamter Change (≤ 1h)

Nach den Test-Änderungen aus Task 1 zuerst das Inventar regenerieren und mitcommitten:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

Dann die drei mandatory Verify-Commands:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich gezielt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation.bats   # alle alt+neu grün
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/brain-wiki-quality/tasks.md
wc -l scripts/brain-ingest.sh   # ≤ 500 (S1)
```

<!-- vitest: kein neuer Test nötig, weil keine website/src-Datei berührt wird — reine Bash-Skripte + BATS. -->
