---
title: "mishap-incident-rollup-2026-08-15-T008015 — Implementation Plan"
ticket_id: T008015
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-15-T008015 — Implementation Plan

_Container-Ticket: T008015_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-15 21:29 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-15 21:03 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | scripts/devflow-post-merge-deploy.sh | Deploy-Detection analysierte Archiv-Commit statt Feature-Merge (false negative) |
> | 2 | suspicious | dev-stack | dev.mentolder.de liefert 404 für /sdlc/design-system (Dev-Stack zeigt SDLC-Build nicht) |
> | 3 | drift | scripts/plan-intel.sh | plan-intel.sh parst keine annotierten target_files-Zellen (Präfixe/Braces werden Pfade) |
> | 4 | degraded | .githooks/post-commit-embed | post-commit-embed-Hook hing 2× (commit + amend), Port 15432 belegt — Wiederholung Mishap 7 |
> | 5 | suspicious | repo/git-workflow | pre-push-Gate (task quality:check) ueberschritt 2× das Bash-Timeout — Push wirkte wie Hang |
> | 6 | drift | repo/chore/plan-archive | openspec-status.json wurde waehrend des Laufs extern als '{}' gestaged (3952→1 Zeilen) |
> | 7 | suspicious | git/main-checkout | Hauptcheckout liegt auf fix/e2e-test-suite-resilience-T008338 statt main — Commit+Push ohne PR, Ticket triage ohne Lock |
> | 8 | suspicious | repo/untracked | Ungetickter funktionaler Patch scripts/llm/bench-guff.sh untracked im Hauptcheckout |
> | 9 | suspicious | repo/untracked | Streu-Artefakt-Verzeichnis website/ mit Prod-Credentials im Hauptcheckout |
> | 10 | suspicious | branch-reaper | chore/pk-device-autostart-T006842: download-quant.ps1 nie in main gemergt (T002431-Fall) |
> 
> **1. Deploy-Detection analysierte Archiv-Commit statt Feature-Merge (false negative)** (suspicious, scripts/devflow-post-merge-deploy.sh)
> 
> devflow-post-merge-deploy.sh (T007559) meldete "Keine bekannten Deploy-Trigger" und listete ausschließlich openspec/-Archiv-Dateien — es analysierte den Archiv-Commit statt des Feature-Merge-Commits 14e0c2b6, der die components/website/**-Änderungen enthält. Der tatsächliche Deploy lief trotzdem automatisch (build-website.yml completed/success auf 14e0c2b6), aber das Skript-Signal war irreführend ("Bitte manuell deployen"). Unklar, ob die Commit-Auswahl (letzter T007559-referenzierender Commit?) den Archiv-PR absichtlich oder versehentlich bevorzugt — Verdacht auf dieselbe Pfad-/Commit-Ableitungsklasse wie die in T008014 dokumentierten finalize.sh-Bugs.
> **2. dev.mentolder.de liefert 404 für /sdlc/design-system (Dev-Stack zeigt SDLC-Build nicht)** (suspicious, dev-stack)
> 
> Der Dev-Stack (dev.mentolder.de) lieferte beim E2E-Lauf für T007559 404 auf /sdlc/design-system — der SDLC-Build (BUILD_TARGET=sdlc) sollte die Route enthalten (Prod-404 ist korrekt, Dev-404 ist es nach aktuellem Verständnis nicht). Verifiziert per: curl -s -o /dev/null -w '%{http_code}' -m 5 http://dev.mentolder.de/sdlc/design-system → 404 (2026-08-15). Mögliche Erklärungen: Dev-Stack läuft gerade auf einem Umbau-Stand (dev-stack-Proxies auf Pocket-ID-FQDN, T007035-Linie), Route heißt im sdlc-Target anders, oder der Dev-Deploy ist veraltet. Kein Blocker für den Prod-Split-Guard (T1/T2 in FA-61 laufen gegen web.mentolder.de), aber für E3-Arbeit am Leitstand relevant: die Dev-Umgebung zeigt den Showcase derzeit nicht.
> **3. plan-intel.sh parst keine annotierten target_files-Zellen (Präfixe/Braces werden Pfade)** (drift, scripts/plan-intel.sh)
> 
> Beim E3-Lauf (T007957) schlug plan-lint mit I1 hart fehl: plan-intel.sh _resolve_target_files() nimmt die target_files-Spalte des ## Partials-Manifests wörtlich — Annotations-Präfixe ("Löschungen …") und Brace-Globs ({CommandBar,CockpitRail}.svelte) wurden zu Literal-Pfaden, die impact_files-Ableitung meldete sie als fehlend. Workaround: Löschdateien als nackte Pfade in die Zelle schreiben, Lösch-Status nur in der File-Structure-Spalte markieren (Hinweiszeile ins Manifest aufgenommen). Fix-Idee: plan-intel.sh sollte Nicht-Pfad-Tokens in der Zelle tolerieren (z.B. Wörter ohne Slash/Brace filtern) oder Braces expandieren — plus Doku-Konvention, dass Manifest-Zellen pfadrein sein müssen.
> **4. post-commit-embed-Hook hing 2× (commit + amend), Port 15432 belegt — Wiederholung Mishap 7** (degraded, .githooks/post-commit-embed)
> 
> Beim Commit (8aa961ccd) und Amend (f0055241f) in Worktree mishap-incident-rollup-2026-08-15-T007067-reuse hing der post-commit-Embed-Pfad (.githooks/post-commit-embed) erneut: Bash-Timeout (120s/180s) musste den Prozess killen, Hook-Ausgabe endete bei '[openspec-embed-local] retry 1/2 in 5s…'. Die Commits selbst wurden korrekt erstellt (Post-Commit-Hooks laufen nach Objekt-Erstellung). VERIFIZIERT: ss zeigt kubectl pid=870363 als Listener auf 127.0.0.1:15432 und 8081 — exakt das Mishap-7-Muster (Entscheidung 7 im T007067-Rollup: deferred, Hook-Chirurgie). Zweites Auftreten am selben Tag; der 2-Minuten-Hang verleitet weiterhin zu gefaehrlichen Commit-Retries.
> **5. pre-push-Gate (task quality:check) ueberschritt 2× das Bash-Timeout — Push wirkte wie Hang** (suspicious, repo/git-workflow)
> 
> Push und Push-Delete (T007067-Branch, T007877-Branch) liefen 2× in 60s-Timeout ohne sichtbare Ausgabe; Ursache: der pre-push-Hook laesst `task quality:check` laufen. VERIFIZIERT: standalone `task quality:check` (0 Violations) laeuft durch, aber der vollstaendige Push mit Hook + validate-commit-msg ueberschritt konsistent >60s; mit 300s-Timeout erfolgreich. Beobachtung: das Push-Gate ist fuer Agenten-Laufzeiten (Default-Timeout 60-120s) zu langsam und erzeugt Fehlalarme 'push haengt'. Kein Code-Defekt, aber Prozess-Reibung — wiederholte Pushes mit Zeitdruck koennten Hooks bypassen.
> **6. openspec-status.json wurde waehrend des Laufs extern als '{}' gestaged (3952→1 Zeilen)** (drift, repo/chore/plan-archive)
> 
> Nach dem Commit im T007067-Worktree tauchte erneut eine Staged-Aenderung an components/website/src/data/openspec-status.json auf, die die Datei auf '{}' (1 Zeile, 3952 geloescht) reduzierte — das bekannte cwd/OPENSPEC_ROOT-Artefakt der Regeneration (Entscheidung 9 im T007067-Rollup hatte es als 'verworfen' markiert). VERIFIZIERT: `git diff --cached` zeigte 3952 Loeschungen, head der Datei war '{}'; nach `git restore --staged --worktree` wieder korrekt. Nach dem Rebase regenerierte ein Hook die Datei erneut — diesmal korrekt (+6, T007067-Eintrag plan_staged). Der unzuverlaessige Regenerationspfad (falsches cwd → leeres {} statt Abbruch) besteht weiter und kann stille Datenverluste in Commits einschleusen, wenn niemand die Staged-Aenderung prueft.
> **7. Hauptcheckout liegt auf fix/e2e-test-suite-resilience-T008338 statt main — Commit+Push ohne PR, Ticket triage ohne Lock** (suspicious, git/main-checkout)
> 
> T006367-Falle wiedergekehrt: Der Hauptcheckout (statt Worktree) trägt Commit f2b42b0e3 auf Branch fix/e2e-test-suite-resilience-T008338 (22:48 UTC), gepusht nach origin, aber kein offener PR und T008338 steht auf triage ohne agent-lock-Claim. Der Commit ist damit unverknüpft — der Merge-Flow (PR-Anlage, Review, Ticket-Close) fehlt.
> **8. Ungetickter funktionaler Patch scripts/llm/bench-guff.sh untracked im Hauptcheckout** (suspicious, repo/untracked)
> 
> scripts/llm/bench-guff.sh (GGUF-Benchmark-Skript für llama-server, 60+ Zeilen, LLAMA_DIR/Port/CTX-Parameter) ist untracked im Hauptcheckout und hat kein Ticket. Laut §0 der repo-hygiene-Mechanik ist das ein funktionaler Patch ohne Ticket: Ticket anlegen und in Worktree überführen, nicht verwerfen. Risiko: Verlust beim nächsten Cleanup (git clean).
> **9. Streu-Artefakt-Verzeichnis website/ mit Prod-Credentials im Hauptcheckout** (suspicious, repo/untracked)
> 
> Top-Level website/ (Build-Artefakte: dist, node_modules, coverage, .astro) enthält website/.env mit POCKET_ID_WEBSITE_SECRET, CRON_SECRET, POCKET_ID_API_KEY, DATABASE_URL. .env ist zwar gitignored (kein Commit-Risiko, verifiziert via git check-ignore), aber das Verzeichnis ist nicht ignoriert und liegt im Repo-Root — Credentials in einem Streu-Artefakt sind ein Hygiene-/Sicherheitsbefund (Leserechte, versehentliches Löschen). website/ entfernen oder ignorieren.
> **10. chore/pk-device-autostart-T006842: download-quant.ps1 nie in main gemergt (T002431-Fall)** (suspicious, branch-reaper)
> 
> Branch chore/pk-device-autostart-T006842 (Ticket done) trägt scripts/llm/pk-devices/download-quant.ps1, das in keinem Commit von origin/main existiert (verifiziert: ls-tree origin/main leer, commit 06acadcc0 nur auf dem Branch, --branch --contains bestätigt). branch-reaper.sh KEEPT den Branch korrekt (Abweichung außerhalb Allowlist). Entscheidung nötig: Datei nach main mergen oder Branch bewusst verwerfen — sonst bleibt das einzige Exemplar eines potenziellen Deliverables am Branch hängen.

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
