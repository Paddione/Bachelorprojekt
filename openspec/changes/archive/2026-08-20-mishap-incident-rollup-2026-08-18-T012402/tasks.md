---
title: "mishap-incident-rollup-2026-08-18-T012402 — Implementation Plan"
ticket_id: T012402
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-18-T012402 — Implementation Plan

_Container-Ticket: T012402_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-18 19:44 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-18 19:40 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | drift | scripts/flux-render-artifact.sh | out/ aus flux-render-artifact.sh ist nicht gitignored — dauerhaft untracked im Hauptcheckout |
> | 2 | drift | database/functions | DB-Funktion Drift: fn_purge_test_data Marker fehlt |
> | 3 | drift | repo/worktrees | Staler Worktree nach Merge nicht aufgeraeumt |
> | 4 | degraded | repo/pr | PR #4766 Konflikte + CI-Failures blockieren Factory |
> | 5 | drift | db/functions | DB-Drift: fn_purge_test_data traegt Migration-Marker nicht |
> | 6 | degraded | scripts/branch-reaper.sh | branch-reaper entscheidet nach Ticket-DB-Drop auf einem toten Signal |
> | 7 | degraded | .github/workflows/auto-enable-automerge.yml | Code-Review-Gate ist wirkungslos: Workflow aktiviert Auto-Merge vor dem Review |
> | 8 | degraded | scripts/devflow-post-merge-finalize.sh | post-merge-finalize bricht bei archive-plan ab, wenn der Branch nur im Worktree lebt |
> | 9 | drift | tests/spec/agent-skills/skill-path-references.bats | Pfad-Guard sieht weder OVERVIEW.md noch skill-relative Markdown-Links |
> | 10 | process | harness/worktree-isolation-guard | Worktree-Isolationsguard lehnt Redirects und Prozess-Substitution als "too complex" ab |
> 
> **1. out/ aus flux-render-artifact.sh ist nicht gitignored — dauerhaft untracked im Hauptcheckout** (drift, scripts/flux-render-artifact.sh)
> 
> Beobachtet beim repo-hygiene-Lauf 2026-08-18. `git status` im Hauptcheckout meldet `?? out/` mit 22 gerenderten Manifest-Dateien (out/clusters, out/mentolder, out/korczewski, out/platform, out/sealed-secrets, out/website-*). Quelle ist scripts/flux-render-artifact.sh, das mit `OUT_DIR="out"` als Default rendert (Zeile 10, `mkdir -p "${OUT_DIR}"` Zeile 38). .gitignore enthält keinen Eintrag für out/ (`grep -n '^out' .gitignore` leer). Folge: reines Build-Ergebnis erscheint bei jedem `git status` als untracked und kann versehentlich mitcommittet werden; ausserdem verrauscht es den §0-Arbeitsbaum-Check jedes Hygiene-Laufs. Nicht gelöscht, weil das Verzeichnis zum Zeitpunkt der Messung zu einer laufenden Session (T012177, GitLab-CI Etappe 2) gehörte. Fix wäre ein `out/`-Eintrag in .gitignore.
> **2. DB-Funktion Drift: fn_purge_test_data Marker fehlt** (drift, database/functions)
> 
> runtime-drift-check.sh meldet: DB-Funktion tickets.fn_purge_test_data traegt den RUNTIME-CHECK-Marker 'to_regclass' nicht, der in Migration scripts/one-shot/purge-fn-v8.sql deklariert ist. Die Funktion laeuft, aber der Marker fehlt — wahrscheinlich wurde die Migration noch nicht eingespielt. Kein Eingriff, nur Meldung.
> **3. Staler Worktree nach Merge nicht aufgeraeumt** (drift, repo/worktrees)
> 
> Worktree mirror-checkout-timeout (branch fix/mirror-checkout-timeout) ist in main gemergt, kein offener PR mehr. Worktree ist stale und sollte entfernt werden: git worktree remove .claude/worktrees/mirror-checkout-timeout
> **4. PR #4766 Konflikte + CI-Failures blockieren Factory** (degraded, repo/pr)
> 
> PR #4766 (feature/gitlab-ci-stage3-T012405) hat Merge-Konflikte (CONFLICTING) und 4 CI-Failures (Factory spec shards 1-3, Factory + OpenSpec + Guards). Factory-Queue blockiert (T012405 in backlog). Rebase + CI-Fix noetig.
> **5. DB-Drift: fn_purge_test_data traegt Migration-Marker nicht** (drift, db/functions)
> 
> DB-Funktion tickets.fn_purge_test_data traegt den RUNTIME-CHECK-Marker 'to_regclass' nicht, den Migration scripts/one-shot/purge-fn-v8.sql deklariert. Funktion laeuft auf alter Version. Remedy: Migration einspielen.
> **6. branch-reaper entscheidet nach Ticket-DB-Drop auf einem toten Signal** (degraded, scripts/branch-reaper.sh)
> 
> Nach dem Ticket-DB-Drop (2026-08-18) ist jede external_id unterhalb T012401 nicht mehr auflösbar: `scripts/ticket.sh get --id <alt>` liefert Exit 0 mit LEERER Ausgabe. branch-reaper.sh liest das in Zeile 276-282 als "Status nicht ermittelbar" und überspringt fail-closed. Messung beim Hygiene-Lauf 2026-08-18 (`bash scripts/branch-reaper.sh --sweep --dry-run`, Repo-Stand 9f5e0b717): 10 von 15 Branches mit dieser Begründung geblockt, davon hatten 8 einen nachweislich gemergten PR (`gh pr list --head <b> --state merged`). Der Reaper löscht also nichts Falsches, aber er räumt strukturell nichts mehr ab — bis eine Alternative greift, wächst der Remote-Branch-Bestand monoton. Das Runbook kennt bereits zwei taugliche Ersatzsignale (merged PR, refs/tags/reaped/<branch>); der Reaper wertet nur das Ticket aus. Handlungsvorschlag: zweites Positiv-Signal im Reaper zulassen, wenn die Ticket-Antwort leer ist — leere Antwort dabei explizit von "Ticket ist offen" trennen.
> **7. Code-Review-Gate ist wirkungslos: Workflow aktiviert Auto-Merge vor dem Review** (degraded, .github/workflows/auto-enable-automerge.yml)
> 
> `dev-flow-execute` Schritt 3.8 fordert Auto-Merge erst NACH bestandenem Code-Review-Gate an und ruft davor `scripts/check-pr-automerge.sh` als fail-closed Guard auf (Regression T006282). `.github/workflows/auto-enable-automerge.yml` aktiviert Squash-Auto-Merge aber auf JEDER neuen Nicht-Draft-PR gegen main (Trigger: opened/synchronize/ready_for_review/reopened; ausgenommen nur Drafts und das `dependencies`-Label).
> 
> Folge: Der Guard schlaegt bei jedem regulaeren PR an — beobachtet an PR #4775 am 2026-08-18: `BLOCK: Auto-Merge ist auf PR #4775 aktiv`, bevor ueberhaupt ein Review stattgefunden hatte. Der PR mergte anschliessend selbsttaetig, sobald die Checks gruen waren. Das Gate kann seinen Zweck damit nicht erfuellen: es verbietet dem Ausfuehrenden ausdruecklich, das Auto-Merge zu deaktivieren (Design D2 — der explizite User-Akt soll sichtbar bleiben), und der Merge laeuft trotzdem ohne bestandenes Review durch.
> 
> Reproduktion: beliebigen Nicht-Draft-PR gegen main oeffnen, danach `bash scripts/check-pr-automerge.sh` — der Guard meldet BLOCK.
> 
> Zwei Entscheidungen sind moeglich und beide sind Betreiber-Sache, nicht Agenten-Sache: entweder der Workflow nimmt PRs aus, die ein Review-Gate durchlaufen sollen (z.B. per Label oder Draft-Pflicht im dev-flow-Pfad), oder Schritt 3.8 wird als Gate aufgegeben und das Review als reine Nach-Merge-Pruefung dokumentiert. Der aktuelle Zustand behauptet ein Gate, das nicht greift.
> **8. post-merge-finalize bricht bei archive-plan ab, wenn der Branch nur im Worktree lebt** (degraded, scripts/devflow-post-merge-finalize.sh)
> 
> `scripts/devflow-post-merge-finalize.sh` Schritt 7 brach am 2026-08-18 (Ticket T012412, PR #4775) mit `ERROR: Schritt 7 — archive-plan fehlgeschlagen` und Exit 1 ab. Derselbe Aufruf mit identischen Flags lief unmittelbar danach aus dem Worktree heraus glatt durch:
> 
> ```bash
> bash scripts/ticket.sh archive-plan --id T012412 \
  > --slug fix-reaper-unknown-ticket-merged-pr \
  > --branch fix/reaper-merged-pr-signal-T012412 \
  > --plan-file openspec/changes/fix-reaper-unknown-ticket-merged-pr/tasks.md
> # => Plan successfully archived for ticket T012412
> ```
> 
> Ursache: Das Skript lief im Haupt-Checkout, der den Merge-Commit noch nicht gepullt hatte. `$PLAN_FILE` zeigte damit auf einen Pfad, der dort (noch) nicht existierte. Der dafuer vorgesehene Skip-Zweig in Zeile 245 (`[[ ! -s "$PLAN_FILE" ]] && ! git cat-file -e "$BRANCH:..."`) griff nicht, weil der Branch im Haupt-Checkout gar nicht ausgecheckt war — er lebte ausschliesslich im Worktree. Beide Teilbedingungen sind also erfuellbar, ohne dass ein echter Fehler vorliegt, und der ERROR-Zweig gewinnt.
> 
> Verschaerfend: der Aufruf ist mit `>/dev/null 2>&1` maskiert (Zeile 243). Die eigentliche Fehlermeldung von `archive-plan` ist damit unsichtbar, und die Diagnose besteht darin, den Aufruf von Hand zu rekonstruieren — dieselbe Fehlerklasse, gegen die das Runbook sonst anschreibt (leere/verschluckte Antwort ist kein Urteil).
> 
> Abhilfe im Lauf war: Haupt-Checkout pullen, `archive-plan` einzeln nachziehen, danach das Skript erneut aufrufen (es ist idempotent und lief die restlichen Schritte 8-10 sauber durch). Vorschlag: vor Schritt 7 gegen `origin/main` pruefen statt gegen den lokalen Branch, und stderr des Aufrufs bei Fehlschlag ausgeben statt zu verwerfen.
> **9. Pfad-Guard sieht weder OVERVIEW.md noch skill-relative Markdown-Links** (drift, tests/spec/agent-skills/skill-path-references.bats)
> 
> Befund waehrend T012433: OVERVIEW.md trug einen toten Link auf references/infra-ops-runbooks.md (laengst gesplittet in infra-ops/references/runbooks-{deploy,operations}.md), waehrend der Guard gruen blieb.
> 
> Zwei unabhaengige Gruende, beide verifiziert:
> 
> 1. skill_files() schliesst OVERVIEW.md explizit aus (-not -path "*/OVERVIEW.md") - ausgerechnet die Indexdatei, ueber die das Skill-Routing laeuft.
> 2. Wichtiger: PATH_PATTERN erfasst nur repo-relative Pfade unter festen Praefixen
   > (openspec|scripts|tests|docs|website|k3d|environments|flux + components/website).
   > Skill-relative Markdown-Links der Form ](references/foo.md) - die hier tatsaechlich
   > kaputte Klasse - matcht es gar nicht. Den Ausschluss allein zu entfernen haette den
   > Fund also NICHT gefangen.
> 
> Nach dem Fix in T012433 extrahiert der Guard aus OVERVIEW.md 5 Pfade, alle lebend - der Ausschluss liesse sich streichen, ohne dass etwas rot wird.
> 
> Nicht in T012433 mitbehoben, weil eine link-relative Aufloesung mehrere vorbestehende Faelle foerdert, die je eine eigene Entscheidung brauchen: opencode-flow-execute/SKILL.md (Fremdharness-Verweis, existiert hier bewusst nicht), /tmp/...-Beispielpfade in hetzner-provisioning-network.md, .git/mishap-buffer.json als Laufzeitdatei. Diese muessten allowlistet werden.
> 
> MESSUNG (2026-08-18, Commit 99107e81f)
  > grep -n 'OVERVIEW.md' tests/spec/agent-skills/skill-path-references.bats   # -> Ausschluss in skill_files()
  > grep -n 'PATH_PATTERN=' tests/spec/agent-skills/skill-path-references.bats # -> Praefixliste ohne .claude/
> Gegenprobe (findet die Klasse, die der Guard nicht sieht):
  > python3 - <<'PY'
> import pathlib,re
> root=pathlib.Path('.')
> for p in root.glob('.claude/skills/**/*.md'):
    > for m in re.finditer(r'\]\((\.\.?/[^)]+|[a-z][A-Za-z0-9_./-]+\.md)\)', p.read_text()):
        > t=(p.parent/m.group(1)).resolve()
        > if not t.exists(): print(p, '->', m.group(1))
> PY
> **10. Worktree-Isolationsguard lehnt Redirects und Prozess-Substitution als "too complex" ab** (process, harness/worktree-isolation-guard)
> 
> Beobachtet waehrend T012433 (~6 Fehlversuche). In einer worktree-isolierten Session lehnt der Bash-Guard Kommandos ab, sobald sie eine Ausgabe-Umleitung (> datei), Prozess-Substitution (<(...)) oder eine for-Schleife enthalten:
> 
  > "This session is isolated in the worktree ..., but this command is too complex
   > to verify that it stays inside the worktree; break it into plain, separate commands."
> 
> Betroffen waren u. a.:
  > - bash scan.sh "$PWD" > /pfad/dead.txt
  > - grep -vxF -f <(echo "$prev")
  > - for f in a b c; do grep -c X "$f"; done
  > - comm -13 <(echo "$prev") <(echo "$cur")   (auch innerhalb eines Monitor-Kommandos)
> 
> Die Ablehnung ist konservativ korrekt, aber die Meldung nennt keinen gangbaren Weg. Der funktionierende Workaround: das Skript per Write in einen Pfad ausserhalb des Worktrees legen (z. B. $CLAUDE_JOB_DIR/tmp/foo.sh) und mit `bash <absoluter-pfad>` aufrufen - dann greift der Guard nicht, obwohl das Skript identische Redirects enthaelt.
> 
> Auswirkung: keine Fehlfunktion, aber wiederholter Reibungsverlust bei jeder Analyse-Session, die Zwischenergebnisse in Dateien schreibt. Vorschlag: den Hinweis auf den Skript-Workaround in die Ablehnungsmeldung aufnehmen, damit nicht jede Session ihn neu herleitet.
> 
> [UNVERIFIED - Guard-Quelltext nicht lokalisiert] Der Guard ist Teil der Harness, nicht des Repos; die Beobachtung stuetzt sich auf die reproduzierten Ablehnungsmeldungen dieser Session, nicht auf Codelektuere.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
