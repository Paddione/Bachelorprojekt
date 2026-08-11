# Design: batch-git-worktree-integrity

Gemeinsamer Kern aller sieben Fixes: **ein Erfolgssignal darf nur auf einem positiven,
verifizierten Messwert beruhen** — nicht auf der Abwesenheit eines Fehlers und nicht auf
einem einmaligen, unbestätigten Messwert. Diese Regel existiert in repo-hygiene-ops §3
bereits für PR-Triage; dieser Change dehnt sie auf den Worktree-/Git-Bereich aus.

---

## T002994 — 0-Byte-Loose-Objects blockieren `git fetch` im gesamten Repo

### Fehleranalyse

Ein einziger Worktree mit truncated Loose Objects (0 Byte, inkl. detached HEAD `ace450108`)
legte `git fetch origin main` im Hauptcheckout lahm (`fatal: bad object
worktrees/<name>/HEAD`). `repo-hygiene` §0/§1 prüfen nirgends die Integrität des
GEMEINSAMEN Objektspeichers — die Fehlermeldung sieht aus wie ein Netzwerkproblem
("did not send all necessary objects"), nicht wie lokale Korruption.

### Fix

1. **Neues Skript `scripts/git-worktree-health.sh`**, Subkommando `objects`:
   - Vorcheck: `find "$(git rev-parse --git-dir)/objects" -type f -size 0` → Befund.
   - Vertiefung: `git fsck --no-reflogs --no-progress` → Befund bei Fehlern.
   - Exit-Code-Kontrakt identisch zu `worktree-clean-check.sh`: 0 sauber, 1 Befund,
     2 nicht prüfbar (kein Repo, `git fsck` nicht ausführbar — Fail-Closed, kein Urteil).
   - Bei Befund: Rettungssequenz aus T002994 ausgeben:
     a) letzten gültigen Commit aus `.git/worktrees/<name>/logs/HEAD` in
        `.git/worktrees/<name>/HEAD` schreiben,
     b) `git rebase --abort` im betroffenen Worktree,
     c) `find .git/objects -type f -size 0 -delete`,
     d) `git reflog expire --stale-fix --all`,
     e) Gegenprobe: `git fsck --no-reflogs` sauber + `git fetch origin main` ok.
2. **repo-hygiene-ops §0**: Vor dem Worktree-/Branch-Lauf
   `bash scripts/git-worktree-health.sh objects` aufrufen; Befund → Stopp mit Rettungsweg.

---

## T002995 — Erster `git status` nach Crash meldet Falsch-Positiv "dirty"

### Fehleranalyse

Nach dem WSL-Crash stimmten Datei-mtimes nicht mit dem Index-Stat-Cache überein. Der erste
`git status --porcelain` meldete drei modifizierte Dateien; der zweite Lauf null — der erste
Lauf hatte den Index aufgefrischt (Inhalte waren identisch, nie echte Änderungen). Ein
Dirty-Befund beim ERSTEN Blick ist nach Crash/Ruhe unzuverlässig — in beide Richtungen der
Konsequenz (blockiert berechtigtes Remove, verleitet zu Ticket-Zuordnung nach §0).

### Fix

1. **`scripts/worktree-clean-check.sh`**: Liefert der erste Lauf nicht-leere (nicht-
   allowlistete) Residuen, wird **ein zweiter** `git status --porcelain`-Lauf ausgeführt;
   nur Residuen, die beide Läufe identisch melden, sind ein Befund (Exit 1). Transiente
   Residuen (erster Lauf, zweiter leer) → Exit 0 mit Hinweis "Stat-Cache aufgefrischt,
   keine persistenten Änderungen".
2. **repo-hygiene-ops §1**: Regel "Dirty-Befund durch zweiten Lauf bestätigen" dokumentieren
   (alternativ `git update-index --refresh` vorschalten — bewusst NICHT der Default, weil er
   den Index fremder Worktrees mutiert; der zweite Lauf ist read-only bezüglich der
   Befund-Bedeutung).

---

## T002998 — Glob-Schleife misst Waisenverzeichnisse still als Hauptrepo

### Fehleranalyse

`.worktrees/factory-mcp-ask-backend-T002663` war ein Überrest (nur `scripts/`, kein `.git`,
nie in `git worktree list`). Eine Auswertungsschleife über `.worktrees/*/` beantwortete
`git -C <dir>` über die Aufwärtssuche fürs ELTERNREPO → Messwert `branch=main, dirty=0` —
das "sauber und gemergt, kann weg"-Urteil aus dem falschen Repo. Bei einem Waisenverzeichnis,
dessen Name zu einem tatsächlich gemergten Branch passt, wäre der Fehlschluss unsichtbar.

### Fix

1. **Iterationsquelle ist `git worktree list --porcelain`** (Registrierung), nie der
   Dateisystem-Glob — das Muster existiert bereits in `worktree-git-op-guard.sh` und
   `scripts/lib/wt-hygiene-measure.sh`; es wird für die Runbook-Schleifen übernommen.
2. **Die Differenzmenge ist ein Befund**: Verzeichnis unter `.worktrees/` ohne
   Worktree-Eintrag → `git-worktree-health.sh orphans` meldet es explizit (Muell oder
   verlorene Arbeit), statt es still als sauberen Worktree mitzuzählen.
3. **ticket-ops-procedures.md Zeile ~417**: `for wt in .worktrees/*<ext-id>*` →
   Porcelain-Iteration + `[ -e "$wt/.git" ]`-Guard; ohne Guard ist `git -C` im Orphan der
   Aufwärtssuche ausgeliefert.

---

## T003069 — Teilweiser `git stash pop` sieht aus wie erfolgreich

### Fehleranalyse

`git stash -u` → `git pull --rebase origin main` → post-rewrite-Hook regenerierte
`website/src/data/openspec-status.json` (eine der gestashten Dateien) → `git stash pop`
konnte nur teilweise anwenden und meldete "The stash entry is kept". `git status` zeigte
danach EINE modifizierte Datei — sieht wie ein normaler Pop aus; die eigentliche Arbeit
(purge-fn-v8.sql) lag weiterhin im Stash. Exit-Code und Statusanzeige taugen als
Erfolgssignal nicht; `git stash list` (kürzer um genau den eigenen Eintrag) ist das
positive Signal.

### Fix

git-workflow (beide Varianten) Schritt 0: Sequenz erweitern um
1. Vor dem Pop: eigene Einträge zählen (`git stash list | grep -c "<ticket-id>"` bzw. die
   benannte Nachricht).
2. Nach dem Pop: `git stash list` prüfen — der eigene Eintrag MUSS weg sein.
3. Bleibt er: **Befund, kein Erfolg** — Wiederherstellung über
   `git stash show --stat "stash@{0}"` und `git checkout "stash@{0}" -- <pfad>`, dann
   erneut poppen oder Eintrag behalten und Verifikation gegen den Arbeitsbaum führen.

---

## T003070 — Stash-Stack ist worktree-übergreifend geteilt

### Fehleranalyse

`refs/stash` liegt im gemeinsamen Git-Verzeichnis (`git rev-parse --git-common-dir`), nicht
pro Worktree. Alle Worktrees teilen EINEN Stack; `git stash pop` in irgendeinem nimmt
`stash@{0}` — ggf. der Eintrag einer fremden Session. Indizes verschieben sich bei jedem
fremden Push auf den Stack. Ein Stash fühlt sich wie ein privates Sicherungsnetz an und ist
ein geteilter, fremd veränderbarer Stack.

### Fix

1. **Skills (beide Varianten)**: Bei Parallelarbeit Wegwerf-Commit auf dem eigenen Branch
   (`git commit -m "wip"`, später `git reset --soft HEAD~1`) — per Konstruktion an den Branch
   gebunden. Wo ein Stash nötig bleibt: immer `-m` mit Ticket-ID, Auflösung über die
   Nachricht, nie über `stash@{0}`.
2. **Neues `scripts/git-stash-net.sh`** (Sicherungsnetz-Referenz):
   - `find --by-ticket <id>`: listet Stashes, deren Nachricht die Ticket-ID trägt
     (durchsucht `git stash list --format='%gs'`), mit Index + Message.
   - `pop --by-message <pattern>`: findet per Nachricht (nicht Index), prüft die
     Stash-Liste vorher/nachher, droppt den Eintrag NUR bei vollständiger Anwendung.
   - Exit-Codes: 0 ok, 1 Befund (Teil-Pop), 2 kein Eintrag gefunden (Fail-Closed).
3. **`scripts/worktree-create.sh`**: `_wc_stash_pop_or_warn` (Zeile 162) poppt per
   Nachricht `worktree-create-auto-stash` statt `stash@{0}`; Warn-Text nennt
   `git-stash-net.sh pop --by-message worktree-create-auto-stash` als Referenzweg.
4. **repo-hygiene-ops §0 Stash-Inventar**: Notiz, dass gelistete Einträge aus beliebigen
   Worktrees stammen können — Zuordnung nur über die Nachricht, und nur wenn benannt.

---

## T003105 — Konfliktfreier Rebase verliert Freshness-Artefakte still

### Fehleranalyse

`.gitattributes` setzt `merge=ours` auf alle Freshness-Generate (u. a.
`website/src/data/test-inventory.json`, `docs/code-quality/repo-index.json`). Beim Rebase
löst der Treiber ohne Konfliktmeldung zugunsten EINER Seite auf — eigene, absichtlich
mitgeführte Regenerate verschwinden still aus dem Commit; `task freshness:check` wird rot,
nachdem er vorher grün war. Ein grüner Rebase belegt die Vollständigkeit des Ergebnisses
nicht. (Verwandt: T002823 — gleiche .gitattributes-Ursache, andere Richtung, GitHub-only.)

### Fix

Skills (beide Varianten):
1. Nach JEDEM Rebase (Schritt 0 Pull-First und Schritt 1 Rebase-Preflight) VOR dem Push:
   `task freshness:check` erneut laufen lassen. Rot → `task freshness:regenerate` →
   `git add <artefakte>` → Commit ergänzen.
2. Die Regel benennt die Ursache explizit: `merge=ours` schlägt ohne Konfliktmarker zu —
   ein Rebase, der keine Konflikte meldet, kann Artefakte trotzdem ersetzt haben.
3. Kostenlose Gegenprobe dokumentieren: `git show --stat HEAD -- <artefaktpfade>` nach dem
   Rebase (billiger als der volle Regen-Zyklus).

---

## T003131 — write-guard: SID-Modell unterscheidet Subagenten nicht

### Fehleranalyse (gegen Quellcode korrigiert)

`MY_WTS` sammelt alle Worktrees, deren Lock-Owner dieselbe SID trägt — sechs Subagenten
einer ticket-ops-Session liefen unter DERSELBEN SID, der Guard meldete sie korrekt als
"dieser Session gehörig"; die Meldung wurde nur als "fremd" gelesen. Der eigentliche Defekt:
das SID-Modell kann Subagenten einer Session nicht unterscheiden — Regel 2 erlaubt Agent A
das Schreiben in B's Worktree. Dieselbe gebrochene Annahme wie T003102 ("eine Session =
eine SID"). Zusatzbefunde: Worktrees doppelt in der Liste (keine Dedup), Meldezeile ohne
Quellenangabe.

### Fix

1. **SID-Parität**: `_my_sid` im Guard um `OPENCODE_SESSION_ID` ergänzen
   (agent-lock.sh kennt sie seit T002375-p1; der Guard nicht — in opencode driftet die SID
   sonst auf den ps-Fallback und eigene Claims erscheinen als fremd).
2. **Meldung mit Quelle**: "Dieser Session (SID $SID) gehoeren" →
   "Claims mit SID $SID (eigene Session UND deren Subagenten) — Besitz aus
   agent-locks/*.json owner_sid". Dedup bleibt (bereits in 6bd21c173, T003116, gelandet) —
   wird per Test abgesichert, nicht neu gebaut.
3. **Regel 2 bleibt bewusste Gegenentscheidung** (Kommentar Z. 154–157 existiert): eine
   Akteur-Verengung würde T002412 (legitime Mehrfach-Worktrees pro Session) umkehren. Der
   Schutz gegen FREMDE Sessions bleibt; Subagent-Schreibschutz ist als bekannte Grenze
   dokumentiert statt als neues Identitätsmodell.
4. **Regressionstests** in `tests/spec/batch-git-worktree-integrity.bats`:
   Dedup (branch+worktree-Scope auf denselben Pfad → 1 Eintrag), SID-Quelle in der Meldung,
   `OPENCODE_SESSION_ID` wird als eigene SID erkannt.

---

## Dateien

| Datei | Status | Kinder |
|-------|--------|--------|
| `scripts/git-worktree-health.sh` | neu | T002994, T002998 |
| `scripts/worktree-clean-check.sh` | geändert | T002995 |
| `.claude/skills/references/repo-hygiene-ops.md` | geändert | T002994, T002995, T002998, T003070 |
| `.claude/skills/references/ticket-ops-procedures.md` | geändert | T002998 |
| `.claude/skills/git-workflow/SKILL.md` | geändert | T003069, T003070, T003105 |
| `.opencode/skills/opencode-git-workflow/SKILL.md` | geändert | T003069, T003070, T003105 |
| `scripts/git-stash-net.sh` | neu | T003070 |
| `scripts/worktree-create.sh` | geändert | T003070 |
| `scripts/hooks/worktree-write-guard.sh` | geändert | T003131 |
| `scripts/agent-lock.sh` | geändert (nur Test-Festigung, kein Verhaltenswechsel) | T003131 |
| `tests/spec/batch-git-worktree-integrity.bats` | neu | alle |
| `scripts/branch-reaper.sh` | **bewusst nicht** geändert | — |
