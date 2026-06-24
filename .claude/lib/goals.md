# Repository Health Goals

Quantifizierbare Ziele für die strukturelle Gesundheit des Repos.
Jedes Ziel hat einen messbaren Befehl, einen aktuellen Baseline-Wert und ein **erreichbares** Target.

---

## G-RH01 — S1-Frozen-Violations: 98 → ≤ 30

**Was:** Einträge in `docs/code-quality/baseline.json` — Dateien, die wegen Überschreitung des Größenlimits eingefroren wurden (`frozen_at`). Jeder Eintrag ist eine Schuld: die Datei darf nicht größer werden, muss aber noch refactored werden.

**Warum erreichbar:** Keine neuen Einträge zuzulassen (Netto-Rate = 0) ist sofort erreichbar. Abbau auf ≤ 30 bedeutet ~2 Refactoring-Sessions pro Woche für ~5 Wochen.

```bash
# Aktuell messen:
python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))" < docs/code-quality/baseline.json

# Die 5 größten Schuld-Einträge anzeigen:
python3 -c "
import json,sys
d=json.load(sys.stdin)
for k,v in sorted(d.items(), key=lambda x: x[1].get('metric',0), reverse=True)[:5]:
    print(f\"{v.get('metric'):>5}  {v.get('path')}\")
" < docs/code-quality/baseline.json
```

| | Wert |
|---|---|
| Baseline (2026-06-22) | **98** |
| Target | **≤ 30** |
| Sofort messbar | ja |

---

## G-RH02 — TypeScript-Suppressionen: 9 → 0

**Was:** `@ts-ignore`- und `@ts-expect-error`-Kommentare in `website/src/`. Jeder unterdrückt einen Compiler-Fehler, der eigentlich gefixt werden sollte. Diese sind reale stille Fehlerpunkte.

**Warum erreichbar:** Nur 9 Vorkommen — das sind ca. 9 × 30 Minuten Arbeit.

```bash
# Aktuell messen:
grep -r "@ts-ignore\|@ts-expect-error" website/src \
  --include="*.ts" --include="*.svelte" --include="*.astro" \
  --exclude-dir=node_modules | wc -l

# Mit Dateipfaden:
grep -rn "@ts-ignore\|@ts-expect-error" website/src \
  --include="*.ts" --include="*.svelte" --include="*.astro" \
  --exclude-dir=node_modules
```

| | Wert |
|---|---|
| Baseline (2026-06-22) | **9** |
| Target | **0** |
| Sofort messbar | ja |

---

## G-RH03 — OpenSpec-BATS-Abdeckung: 17 % → ≥ 60 %

**Was:** Von 53 OpenSpec-Specs (`openspec/specs/*.md`) haben nur 9 eine entsprechende BATS-Datei in `tests/spec/`. Jede unabgedeckte Spec ist Verhalten, das nur durch manuelle Tests oder gar nicht verifiziert wird.

**Warum erreichbar:** ≥ 60 % = 32 abgedeckte Specs. Von 9 auf 32 sind 23 neue BATS-Dateien — bei ~1 h pro Datei machbar in ~4 Wochen. 100 % ist auf Thesis-Horizon nicht realistisch, 60 % schon.

```bash
# Aktuell messen:
SPECS=$(ls openspec/specs/*.md 2>/dev/null | wc -l)
BATS=$(ls tests/spec/*.bats 2>/dev/null | wc -l)
echo "Specs: $SPECS | BATS: $BATS | Coverage: $(python3 -c "print(f'{$BATS/$SPECS*100:.0f}%')")"

# Welche Specs fehlen noch:
comm -23 \
  <(ls openspec/specs/*.md | xargs -I{} basename {} .md | sort) \
  <(ls tests/spec/*.bats  | xargs -I{} basename {} .bats | sort)
```

| | Wert |
|---|---|
| Baseline (2026-06-22) | **17 %** (9/53) |
| Target | **≥ 60 %** (32/53) |
| Sofort messbar | ja |

---

## G-RH04 — Stale Remote Branches (>14 Tage, kein offener PR): 0

**Was:** Remote-Branches, die älter als 14 Tage sind und zu keinem offenen PR gehören. Diese sind entweder vergessene Worktrees oder schon gemergte Branches ohne `git push --delete`.

**Warum erreichbar:** Der aktuelle Stand ist 5 Branches, alle vom 2026-06-21/22 — aktuell 0 stale. Das Ziel ist, diesen Zustand dauerhaft zu halten: jeder Merge triggert `git push origin --delete <branch>`.

```bash
# Stale branches ermitteln (>14 Tage alt, kein offener PR):
CUTOFF=$(date -d "14 days ago" +%s)
git for-each-ref --format='%(refname:short)|%(committerdate:unix)' refs/remotes/origin \
  | grep -v "HEAD\|main" \
  | while IFS='|' read branch ts; do
      [[ "$ts" -lt "$CUTOFF" ]] && echo "$branch ($(git log -1 --format='%ar' "$branch"))"
    done | wc -l
```

| | Wert |
|---|---|
| Baseline (2026-06-22) | **0 stale** (5 aktive, alle frisch) |
| Target | **dauerhaft 0** |
| Sofort messbar | ja |

---

## G-RH05 — Plan-Staged-Tickets ohne Aktivität >14 Tage: 0

**Was:** Tickets im Status `plan_staged`, bei denen seit >14 Tagen kein Commit, kein PR, kein Kommentar existiert. Diese verursachen Kontextverlust und blockieren die Software Factory.

**Warum erreichbar:** Derzeit 4 plan_staged-Tickets. Keines davon aktiv zu lassen erfordert entweder `dev-flow-execute` oder explizites Zurücksetzen auf `backlog`.

```bash
# Aktuell messen (via ticket-mcp):
bash scripts/vda.sh oracle --dry-run 'list plan_staged tickets'

# Alternativ direkt:
# kubectl --context fleet exec -n workspace deployment/website -- \
#   psql -U website_user -d website \
#   -c "SELECT ticket_id, title, updated_at FROM tickets WHERE status='plan_staged' AND updated_at < NOW() - INTERVAL '14 days'"
```

| | Wert |
|---|---|
| Baseline (2026-06-22) | **4 plan_staged** (T000951, T000457, T000752, Brainstorm-Submit) |
| Target | **0 idle >14 Tage** |
| Sofort messbar | mit ticket-mcp |

---

## G-RH06 — Sentinel-Issues unbehandelt >48h: 0

**Was:** Der tägliche Sentinel-Bot öffnet Issues (z.B. #2068, #2069) mit Findings. Jede Issue sollte binnen 48h entweder in ein Ticket überführt, kommentiert (false positive) oder geschlossen werden. Offene Issues > 48h = unbearbeitete Sicherheits- oder Qualitätsfunde.

**Warum erreichbar:** Das ist ein Policy-Ziel, kein Code-Ziel. Sofort erreichbar durch konsequentes Triage-Ritual.

```bash
# Aktuell messen:
gh-axi issue list --label "sentinel" --state open \
  --json number,title,createdAt \
  | python3 -c "
import sys, json
from datetime import datetime, timezone, timedelta
issues = json.load(sys.stdin)
cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
stale = [i for i in issues if datetime.fromisoformat(i['createdAt'].replace('Z','+00:00')) < cutoff]
print(f'Open sentinel issues >48h: {len(stale)}')
for i in stale:
    print(f'  #{i[\"number\"]} — {i[\"title\"]}')
"
```

| | Wert |
|---|---|
| Baseline (2026-06-22) | 2 offen (beide frisch) |
| Target | **0 älter als 48h** |
| Sofort messbar | ja |

---

## G-RH07 — Freshness-Check: 100 % grün auf `main`

**Was:** `task freshness:check` validiert, dass generierte Artefakte (repo-index, architecture HTML, etc.) mit dem committed Stand übereinstimmen. Ein roter Stand auf `main` bedeutet, dass CI-generierte Artefakte divergieren.

**Warum erreichbar:** Bereits als CI-Gate vorhanden. Das Ziel ist, es dauerhaft grün zu halten — kein direkter Push zu `main` ohne vorheriges `task freshness:regenerate`.

```bash
# Aktuell messen:
task freshness:check
echo "Exit code: $?"
```

| | Wert |
|---|---|
| Baseline (2026-06-22) | unbekannt (manuell prüfen) |
| Target | **Exit 0 auf main, immer** |
| Sofort messbar | ja |

---

## Zusammenfassung

| ID | Ziel | Baseline | Target | Aufwand |
|----|------|----------|--------|---------|
| G-RH01 | S1-Frozen-Violations | 98 | ≤ 30 | ~5 Wochen kontinuierlich |
| G-RH02 | TypeScript-Suppressionen | 9 | 0 | ~1 Woche |
| G-RH03 | OpenSpec-BATS-Abdeckung | 17 % | ≥ 60 % | ~4 Wochen |
| G-RH04 | Stale Remote Branches | 0 | dauerhaft 0 | Policy |
| G-RH05 | Plan-Staged idle >14d | 4 | 0 | laufend |
| G-RH06 | Sentinel-Issues >48h | 0 | dauerhaft 0 | Policy |
| G-RH07 | Freshness-Check auf main | ? | immer grün | Policy |

**Messzyklus:** Wöchentlich G-RH01/02/03, täglich G-RH06, bei jedem Merge G-RH04/07.
