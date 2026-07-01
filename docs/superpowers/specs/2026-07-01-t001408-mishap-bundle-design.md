---
ticket_id: T001408
plan_ref: openspec/changes/t001408-mishap-bundle/tasks.md
date: 2026-07-01
status: approved
---

# T001408 — Mishap-Bundle: agent-lock, dev-flow-execute, devflow-ci-watch.sh

## Kontext

T001408 ist ein `mishap-tracker`-Aggregat-Ticket mit drei unabhängigen, aber thematisch
verwandten Findings — alle drei sitzen in derselben dev-flow CI/Merge/Lock-Reliability-Kette
(Branch-Claim halten → implementieren → pushen → CI überwachen → mergen). Alle drei sind klein,
risikoarm und unabhängig voneinander behebbar. Sie werden **in einem Plan / einer PR** unter
`fix/t001408-mishap-bundle-agent-lock` gebündelt, weil:

- Sie teilen sich Ticket-ID, Branch und Kontext (Mishap-Bundle-Ticket ist bereits so angelegt).
- Keiner der drei Fixes hat >~30 geänderte Zeilen; ein Multi-PR-Split wäre reiner Overhead.
- Ein gemeinsamer Verifikations-Durchlauf (`task test:changed`, BATS) deckt alle drei ab.

Scope-Entscheidung (statt Split in 3 Tickets): **ein Plan, drei Tasks** — je Finding ein
in sich abgeschlossener Task mit eigenem failing Test.

## Finding 1 — `scripts/agent-lock.sh`: Branch-Claim verschwindet unbegründet

### Root-Cause (verifiziert vs. verworfen)

- **Verworfen als Hauptursache:** `_sid_alive()` (Zeile 39) behandelt eine nicht-numerische
  `CLAUDE_SESSION_ID` bereits sicher als "immer lebendig" (`case "$1" in *[!0-9]*) return 0;;`,
  T001268-Fix). Solange `CLAUDE_SESSION_ID` gesetzt ist, kann dieser Pfad keinen Claim fälschlich
  reapen.
- **Plausibelste Ursache:** Fällt `CLAUDE_SESSION_ID` (z. B. innerhalb eines Subprozess-Agenten
  mit abweichender Environment) aus, nutzt `_my_sid()` den Unix-Session-`ps -o sess=`-Fallback.
  Diese SID kann zwischen einzelnen Bash-Tool-Aufrufen unterschiedlich sein (jeder Aufruf kann
  einen neuen Prozessbaum/eine neue Session bekommen); der numerische `_sid_alive()`-Pfad
  (`pgrep -s "$1"`) prüft dann eine SID, die zum Claim-Zeitpunkt existierte, aber beim
  `list`/`reap`-Aufruf schon nicht mehr die aktive Session dieses Agenten ist → `_reapable()`
  stuft den Claim fälschlich als tot ein.
- **Zusätzlich beobachtet (Live-Beleg in dieser Session):** Der für T001408 selbst gesetzte
  Claim war zu Beginn dieses Plannings bereits wieder verschwunden — reproduziert das
  gemeldete Muster, konnte aber wegen fehlender Diagnostik nicht auf eine der drei
  `_reapable()`-Branches (`worktree fehlt` / `sid tot` / `heartbeat-TTL`) zurückgeführt werden.
- Konsequenz: Wir können die genaue Ursache **nicht laborhaft isolieren**, weil `_reapable()`
  keinerlei Diagnostik hinterlässt, wenn sie `0` (reapable) zurückgibt. Der Fix behandelt daher
  zwei Dinge: (a) **Diagnostik**, damit der nächste Vorfall auswertbar ist, und (b) eine
  **Grace-Period-Härtung**, die verhindert, dass ein frisch erstellter Claim (< `AGENT_LOCK_GRACE`
  Sekunden alt) allein wegen einer nicht verifizierbaren numerischen SID gereapt wird — die
  Heartbeat-TTL bleibt als Fallback-Mechanismus für wirklich tote Sessions bestehen.

### Fix-Ansatz

1. **Reap-Diagnostik:** `_reapable()` schreibt (nur wenn sie `0`/reapable zurückgibt) eine
   Zeile nach `$(_lock_dir)/.reap.log` mit `timestamp scope/id reason` (`reason` ∈
   `worktree-missing` / `sid-dead` / `heartbeat-ttl`). Kein Verhalten ändert sich für den
   Rückgabewert selbst — nur ein append-only Audit-Trail. `cmd_reap` bleibt fail-open (Schreibfehler
   werden ignoriert, wie der Rest des Skripts es bereits handhabt).
2. **Grace-Period vor dem numerischen-SID-Reap:** Bevor `_reapable()` einen Claim allein wegen
   `_sid_alive` = "tot" (numerischer Pfad) reapt, prüft sie zusätzlich `created_at`: ist der Claim
   jünger als `AGENT_LOCK_GRACE` (Default 120s, env-override wie die bestehenden `AGENT_LOCK_*`-
   Variablen), wird er **nicht** allein deswegen gereapt — die Heartbeat-TTL-Prüfung greift
   unverändert weiter (kein Deadlock: nach `AGENT_LOCK_TTL` ohne Refresh wird trotzdem gereapt).
   Der `worktree fehlt`-Branch bleibt **ungehärtet** (ein fehlendes Verzeichnis ist ein hartes,
   eindeutiges Signal, keine Racebedingung).
3. Kein Verhalten für `AGENT_LOCK_FAKE_ALIVE`-Testpfad ändern — Tests bleiben deterministisch.

### Betroffene Datei
`scripts/agent-lock.sh` (`_reapable()`, ggf. neue Helper-Funktion `_reap_log()`).

### Edge Cases
- Grace-Period darf einen **wirklich toten** Claim nicht ewig blockieren → Heartbeat-TTL-Pfad
  bleibt der ultimative Fallback (unverändert, `AGENT_LOCK_TTL=1800`).
- `.reap.log` darf nicht unbegrenzt wachsen — Rotation ist außerhalb des Scopes dieses Fixes
  (kleine Textzeilen, kein akutes Risiko innerhalb der Ticket-Laufzeit); als Kommentar im Code
  vermerken, falls ein Follow-up nötig wird.
- Parallele `claim`/`reap`-Aufrufe laufen bereits unter `_with_lock` (flock) — keine neue
  Race-Fläche.

## Finding 2 — `dev-flow-execute`: Implementer hängt im CI-Poll-Loop trotz DIRTY

### Root-Cause (verifiziert)
`.claude/skills/dev-flow-execute/SKILL.md` Schritt 5.5 (Zeile ~439-442) ruft
`scripts/devflow-ci-watch.sh` direkt nach `git push` auf — **ohne** vorherigen
`mergeStateStatus`-Check. Der einzige `mergeStateStatus`/`DIRTY`-Check im gesamten Skill sitzt in
Schritt 6.4 (Zeile ~470-503), **nach** dem Auto-Merge-Request (Schritt 6) — für einen Agenten, der
bereits im CI-Wartelool von Schritt 5.5 hängt (CI startet bei `DIRTY` gar nicht erst), zu spät.

### Fix-Ansatz
Preflight-Check **in `scripts/devflow-ci-watch.sh` selbst** (nicht nur in der SKILL.md-Prosa,
damit er unabhängig vom lesenden Agenten greift):

1. Vor Eintritt in die `while true; do … done`-Polling-Schleife: einmalig
   `gh pr view "$PR_URL" --json mergeStateStatus -q '.mergeStateStatus'` abfragen.
2. Bei `DIRTY`: **selbst** `git fetch origin main && git rebase origin/main` versuchen.
   - Erfolgreich (kein Konflikt) → `git push --force-with-lease` und normal in die Polling-Schleife
     eintreten.
   - Rebase-Konflikt → Skript bricht mit klarer Fehlermeldung + Exit-Code ≠ 0 ab (Konflikt braucht
     menschliche/Subagenten-Entscheidung, kein automatisches Force-Resolve); der aufrufende
     Implementer-Subagent (laut SKILL.md-Prosa) behandelt diesen Exit-Code, statt weiter zu pollen.
3. `.claude/skills/dev-flow-execute/SKILL.md` Schritt 5.5 um einen Hinweissatz ergänzen: der
   Implementer-Subagent muss bei einem `devflow-ci-watch.sh`-Abbruch wegen Rebase-Konflikt selbst
   reagieren (rebasen/konfliktlösen), statt einen zweiten Subagenten für denselben Branch zu
   spawnen (das im Mishap beschriebene Doppel-Push-Risiko).

### Betroffene Dateien
`scripts/devflow-ci-watch.sh` (neuer Preflight-Block vor der Polling-Schleife),
`.claude/skills/dev-flow-execute/SKILL.md` (Schritt 5.5 — dokumentiert das neue Verhalten).

### Edge Cases
- Rebase, der lokal sauber durchläuft, aber Force-Push wegen zwischenzeitlicher fremder Commits
  auf demselben Branch scheitert → `--force-with-lease` verweigert dann korrekt (safe default),
  Skript propagiert den Fehler statt ihn zu verschlucken.
- Kein PR vorhanden / `gh pr view` schlägt fehl → Preflight überspringt den Check (fail-open,
  konsistent mit dem Rest des Skripts, das mehrfach `2>/dev/null || true`/`|| echo ""` nutzt) und
  die bestehende Polling-Schleife läuft unverändert weiter.

## Finding 3 — `devflow-ci-watch.sh`: ungültiges `gh pr checks --json` Flag

### Root-Cause (verifiziert)
Zeile 28: `gh pr checks --json name,state,link`. `gh pr checks --help` bestätigt: dieser
Subcommand kennt **kein** `--json`-Flag (nur `--fail-fast`, `-i/--watch`, `--required`, `-w/--web`).
Der Aufruf schlägt fehl; die Pipe zu `jq` bekommt leeren/fehlerhaften Input; `FAILED_CHECKS` bleibt
leer → das Skript meldet "✅ Alle CI-Checks grün", bevor überhaupt Checks liefen (bei PR #2420
beobachtet).

Audit der übrigen `gh … --json`-Aufrufe in derselben Datei: `gh run list --json
databaseId,status,conclusion` (Zeile ~46) ist **korrekt** — `gh run list` unterstützt `--json`.
Kein weiterer Fund derselben Fehlerklasse in dieser Datei.

### Fix-Ansatz
Zeile 28 ersetzen durch eine Abfrage über `gh pr view --json statusCheckRollup`, die sowohl
CheckRun- (`name`/`conclusion`/`detailsUrl`) als auch StatusContext-Einträge
(`context`/`state`/`targetUrl`) im Rollup robust behandelt:

```bash
FAILED_CHECKS=$(gh pr view "$PR_URL" --json statusCheckRollup \
  -q '.statusCheckRollup[] | select(
        (.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT"
        or (.state // "") == "FAILURE"
      ) | (.name // .context // "unknown") + ": " + (.detailsUrl // .targetUrl // "")')
```

Die genauen JSON-Feldnamen (`conclusion` vs. `state`, `detailsUrl` vs. `targetUrl`) werden während
der Implementierung gegen einen echten offenen PR verifiziert (in der Planungsphase existiert kein
offener PR auf diesem Branch, um das Schema live zu prüfen) — der obige Ausdruck deckt beide
bekannten GitHub-GraphQL-Typen defensiv ab.

### Betroffene Datei
`scripts/devflow-ci-watch.sh` (Zeile 28).

### Edge Cases
- PR ohne jegliche Checks (frisch erstellt, CI noch nicht getriggert) → `statusCheckRollup` ist
  leer/`null` → `FAILED_CHECKS` bleibt leer → Skript meldet fälschlich wieder "grün" bei **echt
  fehlenden** Checks (nicht nur fehlgeschlagenen). Das ist ein **bestehendes, nicht Teil dieses
  Fixes behobenes** Verhalten (das Skript unterscheidet nicht zwischen "keine Checks gestartet"
  und "alle Checks grün") — wird als Restrisiko im Plan als bekannte Grenze dokumentiert, kein
  Scope-Erweiterung in T001408.
- `jq`-Fehler bei unerwartetem Schema → `-q` (gh's eingebauter jq-Query-Modus) gibt bei einem
  Query-Fehler einen non-zero Exit + Fehlermeldung auf stderr zurück, statt still leer zu bleiben
  (im Unterschied zum bisherigen `| jq -r` Pipe-Verhalten) — das ist eine Verbesserung: ein
  Schema-Bruch wird sichtbar statt stillschweigend als "grün" interpretiert.

## Test-Strategie

Failing Tests **vor** dem jeweiligen Fix, rot→grün, in `tests/spec/dev-flow.bats` (neu anzulegen,
da es noch keine `tests/spec/dev-flow.bats`-Datei gibt und alle drei Findings dieselbe Kette
betreffen — passt in die BATS-Konvention aus CLAUDE.md: ein Spec-File pro betroffener SSOT-Spec,
Fallback `tests/unit/` falls keine passende `openspec/specs/`-Spec existiert für diese
Cross-Cutting-Infra-Fixes):

1. **Finding 1:** Claim mit `AGENT_LOCK_SID` setzen, `AGENT_LOCK_FAKE_ALIVE` NICHT auf diese SID
   setzen (simuliert "sid tot"), `created_at` künstlich frisch (< Grace) → `agent-lock.sh list`
   MUSS den Claim noch zeigen (nicht gereapt). Zweiter Test: `created_at` künstlich alt setzen
   (> Grace, > TTL) → Claim MUSS gereapt werden. Dritter Test: `.reap.log` enthält nach einem Reap
   eine Zeile mit scope/id/reason.
2. **Finding 2:** `devflow-ci-watch.sh` gegen einen gemockten `gh` (PATH-Override-Script, das
   `mergeStateStatus: DIRTY` zurückgibt) → Skript MUSS `git fetch`/`git rebase` versuchen
   (verifizierbar über eine Marker-Datei, die das Mock-`git` bei Aufruf schreibt) statt direkt in
   die CI-Poll-Schleife zu gehen.
3. **Finding 3:** `devflow-ci-watch.sh` gegen einen gemockten `gh`, der bei
   `gh pr checks --json …` (alte Zeile) einen Fehler zurückgeben würde und bei
   `gh pr view --json statusCheckRollup` einen echten `FAILURE`-Eintrag liefert → Skript MUSS
   `FAILED_CHECKS` non-empty melden (nicht fälschlich grün).

## Verifikation (Implementierungsphase)
`task test:changed`, `task freshness:regenerate`, `task freshness:check` — Standard-Gate,
keine Manifest-/Kustomize-Änderungen in diesem Fix (reine Bash-Skript- und Skill-Doku-Änderungen).

## Out of Scope
- Finding 3s Restrisiko "keine Checks gestartet ≠ grün" (siehe Edge Cases oben) — separates
  Follow-up-Ticket falls es erneut zuschlägt.
- Kein Redesign des `agent-lock.sh`-Identitätsmodells (SID vs. harness-ID) — nur die
  Grace-Period-Härtung plus Diagnostik, wie oben begründet.
