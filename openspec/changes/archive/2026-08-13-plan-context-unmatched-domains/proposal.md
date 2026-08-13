# Proposal: plan-context-unmatched-domains

## Why

`scripts/plan-context.sh` filtert aktive Proposals über den Rollenfilter in
`_role_allowlist()` (Zeilen 44-51): Ein Proposal wird nur dann in den
Agent-Prompt injiziert, wenn seine `domains:`-Liste mindestens ein Wort der
Allowlist der angefragten Rolle enthält. Das feste Vokabular je Rolle deckt
aber nur die Routing-Table-Wörter ab (`website frontend design ui svelte astro
css brett`, `ops llm k8s …`, `infra deploy k3d …` usw.).

Das Proposal-Korpus verwendet durchgehend freie Wörter, die in keiner Allowlist
stehen. Messung am 2026-08-13 (gegen `origin/main`, Worktree
`.worktrees/domains-rollenfilter-T002614`):

```bash
# Token-Häufigkeit in openspec/changes/*/proposal.md + tasks.md (aktiv, ohne archive/):
for f in openspec/changes/*/proposal.md; do
  slug=$(basename $(dirname $f)); [ "$slug" = "archive" ] && continue
  grep -h '^domains:' "$f" "$(dirname "$f")/tasks.md" 2>/dev/null | head -1
done | sed 's/^domains:[[:space:]]*//' | tr '[],"' ' ' | tr -s ' ' | tr ' ' '\n' \
  | grep -v '^$' | sort | uniq -c | sort -rn | head -12
# Ergebnis: scripts 11 · plan-authoring 5 · infra 5 · website 4 · factory 4 ·
#           ci-cd 4 · bachelorprojekt-test 4 · dev-tooling 3 · test 2 · ci 2 …
# scripts, plan-authoring, ci-cd, dev-tooling stehen in KEINER Allowlist.
```

Reproducer (Wegwerf-Repo, identische Fixtures wie der BATS-Test):

```bash
# Fixture mit domains: [bachelorprojekt-test] + Rolle bachelorprojekt-test:
bash scripts/plan-context.sh bachelorprojekt-test 2>&1 | grep -c zz-self
# beobachtet: 0 — der volle Rollenname als Domain matcht seine eigene Rolle nicht
# (Token-Exakt-Vergleich, `case " $allowlist " in *" $d "*)`)

# Fixture mit domains: [tooling, skills] + Rolle bachelorprojekt-ops:
bash scripts/plan-context.sh bachelorprojekt-ops 2>&1 | grep -E 'zz-dead|WARN'
# beobachtet: (leer) — stille Exklusion ohne jede Meldung
```

FOLGE: Ein Proposal, dessen `domains:`-Liste nur aus solchen Wörtern besteht,
wird in keinen Agent-Prompt injiziert (außer `orchestrator`, der auf `__ALL__`
steht). CLAUDE.md verlangt den Aufruf vor jedem Dispatch — der Aufruf läuft,
liefert aber leer. Das ist still: kein Fehler, keine Warnung. Im aktuellen
Korpus sind alleine 11 `scripts`- und 5 `plan-authoring`-getaggte Proposals
betroffen, plus 4 Proposals, die explizit mit vollen Rollennamen taggen
(`bachelorprojekt-test`, `bachelorprojekt-infra`) und ihre eigene Rolle
trotzdem nicht erreichen.

ABGRENZUNG ZU T002322: Dort ging es um die Kurzform einer Rolle (`infra`
statt `bachelorprojekt-infra`), die still auf `__ALL__` zurückfällt. Hier geht
es um die Gegenrichtung: eine gültige Rolle, deren Filter an den
Domain-Wörtern des Proposals vorbeigreift. Die WARN-Meldung `unknown role`
betrifft eine unbekannte ROLLE, nicht eine unbekannte DOMAIN — für unbekannte
Domains gab es bisher gar keine Meldung.

## What

1. **Selbst-Match-Regel:** Ein Domain-Token, das exakt der volle Rollenname
   ist (`bachelorprojekt-test` für Rolle `bachelorprojekt-test`), matcht immer.
   Die 4 betroffenen Bestandsproposals erreichen damit ihre Rolle wieder.
2. **Vokabular-Erweiterung:** Die beobachteten Korpus-Wörter werden den Rollen
   zugeordnet (`scripts`, `plan-authoring`, `dev-tooling`, `ci-cd`, `ci`,
   `devflow`, `testing`, `ticket-mcp`, `ticket-ops` → test;
   `deployment` → infra). Damit erreichen alle 30 aktiven Proposals mindestens
   eine Rolle.
3. **Fail-loud:** Ein Proposal ohne Domain-Anker (kein slash-freies Token in
   der Vokabular-Union aller Rollen) löst auf jedem Rollen-Lauf eine
   stderr-WARN aus, die Slug und Domains nennt — keine stille Exklusion mehr.
   Der Orchestrator-`__ALL__`-Pfad bleibt unverändert (inkludiert, keine WARN).
4. **Korpus-Guard:** Neuer `--vocab`-Flag gibt die Vokabular-Union des Skripts
   aus (Single Source of Truth); ein BATS-Test
   (`tests/spec/dev-flow-plan/domains-vocabulary.bats`) prüft den lebenden
   Korpus: Jedes aktive Proposal braucht mindestens einen Anker. Ein neu
   erfundenes Wort macht CI rot, bis es gemappt ist — analog `toolset:check`.

Lösungsrichtung (a) allein (nur Allowlist erweitern) wäre unzureichend: Sie
verschiebt das Problem bis zum nächsten frei erfundenen Wort. (b) Fail-loud
und (c) Guard sichern das Vokabular dauerhaft ab; (a) behebt den Bestand.

_Ticket: T002614_
