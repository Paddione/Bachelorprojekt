# Health Goals — Chronik

Vollständige Änderungshistorie der Health Goals ab dem Baseline-Stichtag `2026-07-01`.

> **Warum diese Datei existiert.** `.claude/lib/goals.md` ist das Ziel-**Register**: es sagt,
> was gilt. Diese Datei sagt, was war. Bis T002598 standen beide im selben Dokument, wodurch
> das Register monoton wuchs — jeder Fix hängte einen Absatz an, keiner räumte einen ab.
>
> **Kappungsregel:** `goals.md` behält höchstens **5** `Baseline-Update`-Einträge; alles Ältere
> wird hierher verschoben. Erzwungen von `tests/spec/health-goals/id-parity.bats`.
>
> **Reihenfolge:** Die Einträge stehen in der Reihenfolge, in der sie im ursprünglichen
> Dokument standen — **thematisch**, nicht chronologisch. Sie wurden bewusst nicht umsortiert,
> um den Textbestand unverändert zu übernehmen. Wer nach einem Datum sucht, greppt danach.

---

**Baseline-Update 2026-07-25 (T002063):** G-E2E02 Baseline 2→24 (21× mentolder: 18× coaching.sessions + 3× public.inbox_items; 3× korczewski: public.inbox_items). Root cause: abgebrochene Nightly-E2E-Läufe (DNS-Fehler EAI_AGAIN web.korczewski.de) verhinderten den globalTeardown-Purge. Fix: `global-db-cleanup.ts` fängt Network-Errors ab (PR #3207).

> Dieser Eintrag stand bis T002598 im Fließtext des Ziels G-E2E02 in `goals.md` statt im
> Chronik-Abschnitt — er war damit der letzte verbliebene `Baseline-Update`-Marker im Register
> und hätte nach der Auslagerung zufällig das Messdatum des gesamten Dashboards bestimmt.

**Sprint-Highlights 2026-07-01:** G-CI01 erreicht Target (85 %→95 %, 19/20 grün) und wechselt von Prio A nach Prio C. G-RH03 (OpenSpec-BATS-Abdeckung 50 %→82 %) und G-DEP02 (Major-Deps 9→2) erreichen ihr Target und wechseln von Prio B nach Prio C. G-CQ01 erstmals gemessen: 0 astro-check-Fehler. G-CQ02 (explizite `any`) fällt weiter von 154 auf 8. G-GIT03 (Dateien >1MB) erreicht Target 7→6 per Policy-Ausschluss von `.codebase-memory/` (T001348) und wechselt von Prio A nach Prio C. G-SEC05-Messfehler dokumentiert: das Skript filtert nur eine von zwei GitHub-Actions-Bot-Mail-Varianten heraus, wodurch 4 Bot-Commits fälschlich als unsigniert zählen — echter Wert 0/50, Skript-Fix noch offen.

**Sprint-Highlights 2026-07-03:** G-FE03 (console.error/warn) von 10 auf 1 reduziert — deutliche Verbesserung. G-CQ02 (explizite `any`) weiter von 11 auf 10 gesunken. G-SIZE03 (God-File website-db.ts) von 2106 auf 1957 Zeilen geschrumpft. G-TEST05 (Vitest Coverage) steigt von 82 %→85 %. **Regressionen:** G-CFG01 (env:validate:all) von Exit 0 auf 201 Schema-Verstöße gesprungen; G-GIT02 (non-conventional Commits) von 0 auf 1; G-AGENTIC06/07 jeweils von 0 auf 3 — vier Gates von Prio C nach Prio A zurückgestuft.

**Baseline-Update 2026-07-02:** G-SIZE04 +324.494→+325.521 (weiterhin im Spike-Fenster, aber Top-Diffs sind wieder normale Feature-Arbeit); G-GIT03 7→6 (graph.db.zst per Policy-Entscheidung T001348 aus Gate-Scope ausgeschlossen, keine LFS-Migration); G-CD01 unverändert bei 100 % (15/15); G-CQ02 154→8; G-CQ01 ?→0; G-RH03 50 %→82 %; G-DEP02 9→2 Major; G-CI01 85 %→95 %; **G-SEC05** 25→0 (Mess-Bug fix: beide github-actions[bot] Mail-Varianten werden korrekt gefiltert, alle vorherigen "unsignierten" Commits waren GitHub-Bots); **G-AGENTIC01** 3→0 (tools:-Feld zu security/infra/db Agenten hinzugefügt); **G-AGENTIC10** 3→0 (dispatchende Skills website-specialist/database-specialist/security-specialist erstellt).

**Baseline-Update 2026-07-03:** G-CQ02 11→10; G-SIZE03 2106→1957; G-FE03 10→1; G-TEST05 82 %→85 %; **G-CFG01** Exit 0→201 (Schema-Drift nach GITHUB_CONTENT_TOKEN-Add); **G-GIT02** 0→1 (non-conventional Commit); **G-AGENTIC06** 0→3 (OVERVIEW.md Skill-Zähler); **G-AGENTIC07** 0→3 (verwaiste Skills) — vier Gates von Prio C nach Prio A zurückgestuft.

**Baseline-Update 2026-07-03 (Fix):** G-CFG01 201→0 — PRIMARY_FRONTEND + TURN_OVERLAY_IP in fleet-*/staging ergänzt, RUSTDESK-Keys auf `required: false` gesetzt (mentolder-only). Wechselt von Prio A → Prio C.

**Baseline-Update 2026-07-03 (Fix 2):** G-GIT02 1→0 — `--no-merges` im Gate (Merge-Commit war falsch positiv). G-AGENTIC06 3→0 — OVERVIEW.md Zähler 27→30. G-AGENTIC07 3→0 — specialist Skills in OVERVIEW.md registriert. Drei Gates von Prio A → Prio C.

**Baseline-Update 2026-07-04 (morning):** G-CQ01 (T001553) → done (Bereits grün, gate aktiv). G-CQ03 (T001554) → done (Bereits grün, ESLint-Gate aktiv). G-CQ08 (T001555) → done (knip-Baseline: ~120 unused exports, 7 unused files, 5 unused deps entfernt). G-FE01 (T001557) → done (axe 4.12.1, Baseline: 7 violations). G-FE02 (T001558) → done (Bundle-Budget: 747 KB, 99 JS files). G-SIZE02 (T001556) → backlog (17 files >600 Zeilen, ~2-3 Wochen). G-AGENTIC09 (T001559) → done (3 SKILL.md via Whitespace-Kompression auf <500 Zeilen).

**Baseline-Update 2026-07-04 (Fix):** G-AGENTIC06 0→0 (OVERVIEW.md 30→31 — brain-ingest nachgezogen). G-AGENTIC08 1→0 (toter Script-Pfad `scripts/brain-ingest.mjs` aus brain-ingest/SKILL.md entfernt). G-GIT02 0→1 (Commit `f9dc1ae4e` durch Mishap-Bundle-Routine — kann nicht aus History entfernt werden, löst sich nach ~17 weiteren main-Commits).

**Baseline-Update 2026-07-04:** G-CQ07 S2 Import-Zyklen 0 (baseline.json); G-CQ09 S3 Hostnames 0; G-CQ10 S4 Orphaned Scripts 0 — alle grün, Gates neu eingefügt.

**Baseline-Update 2026-07-10:** G-CFG01 Exit 0→201→0 (fehlendes `TERMINAL_OVERLAY_IP` in `environments/staging.yaml` ergänzt). G-AGENTIC06 6→0 (OVERVIEW.md Skill-Zähler 31→37 korrigiert — brain-ingest/infra-ops/lavish/references/vitest waren nicht mitgezählt). G-AGENTIC07 1→0 (Verweis auf `superpowers-executing-plans`-Stub in dev-flow-execute/SKILL.md ergänzt). G-FE03 2→0 (Mess-Scope-Fix: `logger.ts`/`error-log-store.ts`-Selbstschutz-Fallbacks ausgeschlossen, analog `browser-logger.ts`). G-FE04 3→0 (`website/src/db/migrate.ts`: drei `console.log` auf den bereits importierten pino-`logger` umgestellt). G-DB04 163h→1h (Backup-Alter unter Target — Root-Cause-Status T001738 nicht verifiziert, Messzyklus bleibt täglich als Regressionswache). **Neue Regression:** G-IMG01 0→2 (`promtail-rendered.yaml`/`loki-rendered.yaml`, Helm-Chart-Digests nach T001703-Upgrade nicht nachgezogen) — von Prio C nach Prio B verschoben, Ticket T001766. Nebenbei zwei doppelt vorhandene G-CQ09/G-CQ10-Tabellenzeilen (Copy-Paste-Duplikat) aus der Prio-C-Tabelle entfernt.

**Baseline-Update 2026-07-14 (T001804):** G-AGENTIC06 1→0 (OVERVIEW.md Zähler 37→36 + Mess-Umstellung auf getrackte SKILL.md via `git ls-files` — lokal via market-cli installierte Skills kippen das Gate nicht mehr, Präzedenz T001783). G-AGENTIC07 6→0 (2 untrackte lokale Skills aus dem Mess-Scope entfernt; 4 getrackte Drittanbieter-/ML-Skills — ui-ux-pro-max, unsloth, gguf-quantization, speculative-decoding — in neuer OVERVIEW.md-Sektion registriert). G-AGENTIC08 1→0 (Mess-Bug: Regex ohne Anker matchte `scripts/search.py` als Substring des existierenden Pfads `.claude/skills/ui-ux-pro-max/scripts/search.py` — Lookbehind ergänzt). G-AGENTIC11 5→0 (CLAUDE.md-opencode-Liste um `github-mcp`, `playwright`, `sequential-thinking`, `webresearch`, `docfork` ergänzt). G-DOC02 216→190 (CLAUDE.md kondensiert: Merge=Abschluss- und Bug-Triage-Blöcke entwrappt, leere `### Brett`-Überschrift und redundantes Oracle-Beispiel entfernt). G-AGENTIC09 1→0 (dev-flow-plan/SKILL.md 513→495 Zeilen, Prosa-Entwrapping ohne Inhaltsverlust). G-GIT03 bleibt 7 (>Target 6): Kandidaten `assets/grilling-brett-admin-panel/Brett Admin Panel.html` und `environments/korczewski/KERN Logo Design.html` sind Nutzer-Assets — Löschen/LFS braucht manuelle Entscheidung.

**Baseline-Update 2026-07-17 (T001902):** G-GIT03 7→6 — Target erreicht, wechselt von Prio A nach Prio C. Entfernt: `.claude/skills/unsloth/references/llms-full.md` (1.03 MB, redundanter GitBook-Volldump, von der Skill selbst nicht referenziert — SKILL.md listet nur `llms-txt.md`). Die 2 verbleibenden Nutzer-Assets (`assets/grilling-brett-admin-panel/Brett Admin Panel.html`, `environments/korczewski/KERN Logo Design.html`) bleiben bewusst unangetastet: Löschen ohne Nutzerfreigabe riskant, LFS repo-weit als defekt dokumentiert (T001348); da das Target auch ohne sie erreicht ist, ist keine Gate-Scope-Ausnahme nötig.

**Baseline-Update 2026-07-17 (T001903):** G-SIZE02 Messmethode gefixt — die naive `wc -l`-Zählung folgte den Symlinks `.opencode/plugins/background-agents.ts` und `.opencode/plugins/worktree.ts` (git-tracked Symlinks auf `.opencode/skills/dev-flow/*.ts`) und zählte deren Zeilen doppelt (19 statt 17). Messkommando um `[ -L "$f" ]`-Filter ergänzt. Echter, verifizierter Bestand bleibt bei 17 (3× .opencode/, bereits sanktioniert via S1-Gate-Ignore; 14× VideoVault/, echter Produktionscode, keine Duplikate/generierte Artefakte). T001556 hatte den Wert nie wirklich gefixt — der archivierte Plan referenzierte nicht-existente Pfade (`VideoVault/src/lib/upload.ts` statt der realen `VideoVault/client/src/...` / `VideoVault/server/...`-Struktur), daher blieben alle abgehakten Tasks wirkungslos. Zielwert ≤8 erfordert echtes, getestetes Code-Splitting über ~9 Dateien (~2-3 Wochen) — kein Chore-Scope (kein `node_modules` installiert, kein Testlauf als Regressionsnetz in dieser Session verfügbar) → Nachfolger-Ticket T001920 mit konkreten Split-Vorschlägen je realer Datei, zur Umsetzung über `dev-flow-plan`.

**Offene Tickets (2026-07-17):** G-AGENTIC09 (T001904), G-DB01 (T001905), G-SEC06 (T001909), G-FE05 (T001911), G-BRAIN14 (T001912), G-SIZE02 (T001920, Nachfolger von T001903 — echtes VideoVault-Refactoring), G-DB03 (T001925, Nachfolger von T001906 — echte 41-Tabellen-Migration in 3 Gruppen), G-DB09 (T001926, Nachfolger von T001907 — Messmethoden-Korrektur Backup-COPY-Ausschluss), G-DB10 (T001928, Nachfolger von T001908 — 92 restliche Unused-Index-Kandidaten klassifizieren)

| Ziel | Ticket | Status |
|------|--------|--------|
| G-GIT03 | T001902 | done (7→6, Target erreicht — `llms-full.md` entfernt, 2 Nutzer-Assets bewusst unangetastet) |
| G-SIZE02 | T001903 | **gefixt** (Messmethode korrigiert — Symlink-Doppelzählung behoben; echter Bestand 17 verifiziert, davon 3 bereits sanktioniert. Zielwert ≤8 nicht erreichbar ohne echtes Code-Splitting → Nachfolger T001920) |
| G-AGENTIC09 | T001904 | **gefixt** (dev-flow-plan/SKILL.md 508→479 Zeilen, Whitespace-Kompression ohne Inhaltsverlust — Nachfolger von T001559) |
| G-DB01 | T001905 | Migration erstellt, Anwendung ausstehend (nächster Deploy) — Nachfolger von T001739 |
| G-DB03 | T001906 | **gefixt** (Messmethode korrigiert — 3 VIEWs ausgeschlossen, echter Bestand 41 Basistabellen; kein einheitlicher Wertebereich [Wildcard `'*'` + NULL-Ausnahmen] → Nachfolger T001925) |
| G-DB09 | T001907 | offen (Slow Queries, erster Scan + Optimierung — Nachfolger von T001838) |
| G-DB10 | T001908 | **gefixt** (Baseline 93 gemessen, 1 zweifelsfreier Drop [`idx_customers_email`] via Migration umgesetzt — Nachfolger T001928 für die restlichen 92 Kandidaten, Nachfolger von T001839) |
| G-SEC06 | T001909 | **gefixt** (Image-Pin-Refresh 39→8 CRITICAL, Rest Upstream-blockiert [gosu/grpc-go] — Nachfolger von T001840) → Nachfolger **T001949** |
| G-CI03 | T001910 | **gefixt** (CI p95 = 7 min ✅ ≤12, Messscript-Bug behoben — Nachfolger von T001841) |
| G-FE05 | T001911 | **gefixt** (90/100 ✅ Target erreicht 2026-07-19 via T001950 — sidekick-panels.css async + PortalSidekick dynamic-import) |
| G-BRAIN14 | T001912 | **gefixt** (Nachfolger T001951, 2026-07-19: 15 Backlog-Seiten ingested, Backlog 17→0, PR Paddione/brain#8 gemergt — zurück nach Prio C) |
| G-DB04 | T001739 | gruen (1h, Target ≤26h — Root-Cause-Fix nicht verifiziert, Regressionswache bleibt täglich) |
| G-DB06 | T001739 | gruen (Gate, halten) |
| G-IMG01 | T001766 | **gefixt** (Regression 0→2→0, Helm-Digest-Drift Loki/Promtail behoben — zurück nach Prio C) |
| G-SIZE04 | T001280 | geschlossen (`done`), Messwert weiterhin rot → Nachfolger T001347 |
| G-SIZE04 | T001347 | offen |
| G-GIT03 | T001275 | **gefixt** (gitignore search-index.json [T001305]) |
| G-GIT03 | T001320 | geschlossen (`done`), graph.db.zst nicht migriert → Nachfolger T001348 |
| G-GIT03 | T001348 | **gefixt** (Policy-Ausschluss `.codebase-memory/` aus Gate-Scope, keine LFS-Migration) |
| G-CD01 | T001276 | geschlossen (`done`), Erfolgsrate unverändert → Nachfolger T001349 |
| G-CD01 | T001349 | **gefixt** (Root Cause: Messbefehl zeigte auf geloeschten Workflow build-website-korczewski.yml; jetzt Job-Level gh api gegen build-website.yml) |
| G-CQ01 | T001277 | **gefixt** (PR #2225) |
| G-DEP01 | T001278 | **gefixt** (0 vulnerabilities) |
| G-CI01 | T001279 | **gefixt** (95 % letzte 20 Läufe) |
| G-CFG01 | T001548 | **gefixt** (Commit 97f04f031) |
| G-GIT02 | T001552 | **gefixt** (Commit 1d4ba261b — `--no-merges` im Gate) |
| G-AGENTIC06 | T001550 | **gefixt** (OVERVIEW.md count 27→30, am 2026-07-04 erneut 30→31 für brain-ingest) |
| G-AGENTIC07 | T001551 | **gefixt** (OVERVIEW.md: specialist skills registriert) |
| G-CQ01 | T001553 | **gefixt** (0 astro-check errors, gate aktiv seit PR #2225) |
| G-CQ03 | T001554 | **gefixt** (ESLint-Gate aktiv, 2 legitime inline-disables) |
| G-CQ08 | T001555 | **gefixt** (knip-Baseline: ~120 unused exports, −5 unused deps) |
| G-SIZE02 | T001556 | Prio B — backlog (17 files >600 Zeilen) |
| G-FE01 | T001557 | **gefixt** (axe 4.12.1, Baseline: 7 violations) |
| G-FE02 | T001558 | **gefixt** (Bundle-Budget: 747 KB, 99 JS files) |
| G-AGENTIC09 | T001559 | **gefixt** (Whitespace-Kompression → alle <500 Zeilen) |
| G-AGENTIC08 | — | **gefixt** (2026-07-04: toter script-path `scripts/brain-ingest.mjs` aus SKILL.md entfernt) |
| G-GIT02 | T001552 | **regressed** (Commit f9dc1ae4e — `mishap-bundle-fix:` non-conventional) |

**Baseline-Update 2026-07-15:** G-SEC06 n/a→0 (Trivy-Integration in CI + scripts/trivy-scan.sh erstellt, erster Scan ausstehend); G-CI03 n/a→0 (Implementierung in health-goals-check.sh abgeschlossen, erster Scan ausstehend); G-FE05 n/a→0 (Lighthouse CI in ci.yml + health-goals-check.sh integriert, lighthouse-budget.json erstellt, erster Scan ausstehend)

**Baseline-Update 2026-07-17 (T001904):** G-AGENTIC09 1→0 — `dev-flow-plan/SKILL.md` 508→479 Zeilen. Whitespace-Kompression analog T001559/T001804 (redundante Leerzeilen vor Headern/Listen/Codefences entfernt, Codefence-interne Leerzeilen unangetastet gelassen) — reine Deletion-Diffs, kein Inhaltsverlust.

**Baseline-Update 2026-07-17 (T001901 — Struktur-Refresh + Brain-Ziele):** Strukturbereinigung:
G-IMG01 2→0 (Helm-Digest-Drift behoben, T001766 gefixt) — von Prio B zurück nach Prio C; die
Duplikat-Zeile G-IMG02 (identisches Ziel/Messung) und die doppelte G-DORA04-Zeile aus der
Prio-C-Tabelle entfernt; G-GIT03-Duplikatzeile aus Prio C entfernt (lebt nur noch in Prio A).
Fünf gemessene, aber undokumentierte Ziele als Prio-C-Zeilen nachgetragen: G-AGENTIC01, G-AGENTIC10,
G-DB04, G-DB08, G-TEST05. **Neu: Brain-Dokumentations-Ziele** (Namespace ab G-BRAIN12; G-BRAIN01–11
leben im brain-Repo): G-BRAIN12 Manifest-Drift 0 (Gate), G-BRAIN13 Merge-Hook-Pfad-Parität 0 (Gate),
G-BRAIN15 Seed-Template-Lint Exit 0 (Gate) — alle drei in health-goals-check.sh verdrahtet;
G-BRAIN14 Ingest-Backlog 17→0 (Prio B, T001912). Messwerte: G-CQ02 9→8, G-CQ05 1→0.

**Baseline-Update 2026-07-17 (T001909 — G-SEC06 erster Trivy-Scan):** G-SEC06 n/a→39 (CRITICAL;
706 HIGH). Vollständige CVE-Triage in [`docs/audits/2026-07-17-trivy-cve-baseline.md`](../../docs/audits/2026-07-17-trivy-cve-baseline.md).
Alle CRITICAL-Funde fixable, keine False-Positives; Konzentration auf `alpine/k8s:1.34.0`
(23/39). Bugfix im gleichen Zug: `scripts/trivy-scan.sh` fehlte der `ghcr.io/`-Prefix beim
pocket-id-Image (Scan schlug für dieses Image still fehl statt zu warnen). Fix der CRITICAL-CVEs
(Image-Pin-Refresh, 6 betroffene Images) ist bewusst nicht Teil dieses Baseline-Chores —
Folgeticket empfohlen.
Alle Alt-Tickets der offenen Ziele waren done/archived ohne Messwert-Fix — elf Nachfolge-Tickets
T001902–T001912 angelegt und in den Meta-Zeilen referenziert.

**Baseline-Update 2026-07-17 (T001911 — erster Lighthouse-Lauf):** G-FE05 n/a→60 (3× `npx @lhci/cli
autorun` gegen `https://web.mentolder.de`, Performance-Score konstant 60/100; FCP 6.0s, LCP 7.5s,
TTI 7.5s, TBT 0ms, CLS 0 — größte Opportunity: fehlende Text-Compression, ~622 KiB Einsparpotenzial,
gefolgt von unused-javascript ~278 KiB und responsive Images ~146 KiB). Score liegt deutlich unter
Target 90 — echte Optimierung ist bewusst nicht Teil dieses Chores; Follow-up-Ticket T001922 angelegt.

**Baseline-Update 2026-07-17 (T001910 — G-CI03 erster Messlauf):** G-CI03 n/a→7 min p95 ✅ (Ziel ≤12 min; Messscript-Bug behoben — `gh-axi run list` unterstützt kein `--json` (nur `--fields`), Python-Auswertung parste ISO-Timestamps nicht als datetime — beide Stellen auf `gh` direkt + `datetime.fromisoformat` korrigiert).

**Baseline-Update 2026-07-19 (T001952 — Prio-B Ticket-Backfill):** Alle Tracking-Tickets der 10 Prio-B-Ziele waren via Merge=Abschluss-Konvention bereits `done`, ohne dass die zugrundeliegenden Health-Goals ihr Target erreicht hätten (T001280→T001347-Stil-Churn). Für die 7 Ziele mit weiterhin verfehltem Target wurden neue Nachfolge-Tickets angelegt: G-SIZE02 → T001945, G-DB01 → T001946, G-DB03 → T001947, G-DB10 → T001948, G-SEC06 → T001949, G-FE05 → T001950, G-BRAIN14 → T001951. Die 3 Ziele, deren Wert bereits am oder über dem Target liegt (G-AGENTIC09 0≤0, G-DB09 0=0, G-CI03 7≤12), wurden redaktionell von Prio B in die Prio-C Green-Gates-Tabelle verschoben — kein neues Ticket, da kein offener Arbeitsbedarf besteht.

**Baseline-Update 2026-07-19 (T001949 — G-SEC06 Image-Pin-Refresh):** G-SEC06 39→8 CRITICAL (−79%). alpine/k8s 1.34.0→1.36.2, pgvector 0.8.0-pg16→0.8.5-pg16, nats 2.10-alpine→2.12-alpine, [livekit/egress — removed T002184] — je mit `trivy image --severity CRITICAL` vor Merge verifiziert. Wichtiger Messfehler in der Baseline korrigiert: `alpine/k8s` im Manifest ist ein Docker-Hub-Image (nicht `registry.gitlab.com/alpine/k8s`, das für anonyme Pulls gesperrt ist) — Docker Hub führt aktiv gepflegte Tags bis 1.36.x. Verbleibende CRITICAL nach LiveKit-Entfernung (T002184) reduziert.

**Baseline-Update 2026-07-19 (T001950 — Lighthouse Stufe 3):** G-FE05 Live-Baseline neu vermessen (3× `npx @lhci/cli autorun --collect.numberOfRuns=3` gegen `https://web.mentolder.de`, `CHROME_PATH=/usr/bin/google-chrome` gesetzt): aktueller Prod-Stand (vor diesem Fix) misst konstant **89/100** (FCP 2.0s, LCP 3.1s, SI 4.5s über alle 3 Läufe) — höher als der am 2026-07-17 dokumentierte Wert von 74, vermutlich durch zwischenzeitliche CDN-/Cache-Warmup-Effekte, aber weiterhin unter Target 90. Root-Cause-Analyse via `pnpm build` + manuellem Dist-Vergleich: `sidekick-panels.css` (~180 KB) wurde von Vite mit `global.css` in einen gemeinsamen Chunk gebündelt und war in `Layout.astro` (der öffentlichen Homepage-Layout-Datei, für beide Brands) ein render-blockendes `<link rel="stylesheet">`, obwohl es nur Styles für `PortalSidekick`-Drawer-Subviews liefert, die erst nach FAB-Klick sichtbar werden. `PortalSidekick.svelte` selbst importierte alle 9 Subviews (SupportView, QuestionnaireView, HelpView, AgentGuideView, MediaviewerPanel, TerminalSessionIframe, CockpitSidekickView, AiQualitySidekickView, LogsSidekickView) statisch, wodurch der über `client:idle` geladene Chunk auf 246 KB anwuchs (Lighthouse: 117 KB "unused JavaScript" allein hier). Fix: (1) `sidekick-panels.css` per `?url`-Import + `<link rel="preload" as="style" onload="this.rel='stylesheet'">`+`<noscript>`-Fallback asynchron nachgeladen (bleibt in `PortalLayout.astro`/`AdminLayout.astro` weiterhin eager, dort ist der Sidekick primäre UI); (2) die 9 Subviews in `PortalSidekick.svelte` auf `{#await import(...)}`-Dynamic-Imports umgestellt → PortalSidekick-Chunk 246 KB→84 KB, 9 neue On-Demand-Chunks (5–36 KB je View). Lokale Vorher/Nachher-Messung (`pnpm build` + `pnpm preview`-Server, `npx lighthouse`, gleiche unkomprimierte Dev-Umgebung ohne Traefik-Kompression, daher nicht direkt mit der Prod-Zahl vergleichbar, aber intern konsistent): Performance-Score **68→77** (+9), FCP 4.1s→2.8s, LCP 6.2s→5.0s. Live-Bestätigung gegen `https://web.mentolder.de` ist erst nach Merge + Deploy von `build-website.yml`/`build-website-korczewski.yml` möglich — Folge-Messung dort ausstehend (kein neues Ticket nötig, Messung ist Teil des Post-Merge-Verify-Schritts).

**Baseline-Update 2026-07-19 (T001951 — G-BRAIN14 Ingest-Backlog gefixt):** Backlog 17→0. `bash scripts/brain-ingest-worklist.sh` gegen `~/.brain-ingest-state.json` zeigte real noch 15 offene Seiten (2 der ursprünglichen 17 waren zwischenzeitlich bereits ingested). Ingest-Pool-Blocker gefunden und umschifft: der dokumentierte Default `LM_STUDIO_URL=http://localhost:8095` (`start-qwen36-ingest-pool.ps1`) war nicht aktiv — stattdessen lief unter einem Zufallsport (`127.0.0.1:52875`) eine von LM Studio selbst verwaltete Backend-Instanz mit `--api-key` (401 Invalid API Key, da `brain-ingest-transform.sh` keinen Authorization-Header sendet). Fix: `LM_STUDIO_URL=http://127.0.0.1:1234` (LM Studios öffentlicher Endpunkt, kein API-Key, Modell `qwen3.6-14b-a3b-fablevibes` bereits geladen) statt des dedizierten Standalone-Pools verwendet — funktioniert, aber nur `--parallel 1` (LM Studios eigene Server-Instanz), daher `MAX_PARALLEL=2` statt 6 für den Lauf gewählt. Alle 15 Seiten erfolgreich transformiert (0 Failed), Wikilink-Lint-Autofix lief durch, PR [Paddione/brain#8](https://github.com/Paddione/brain/pull/8) erstellt und gemergt. Re-Messung bestätigt Backlog 0. G-BRAIN14 damit von Prio B nach Prio C (Green Gates) verschoben — kein Code-Fix in `Bachelorprojekt` nötig (reiner Ops-Ingest-Lauf), daher kein PR gegen dieses Repo.

**Baseline-Update 2026-07-19 (T001950 — Live-Bestätigung nach Deploy):** G-FE05 **89→90 ✅ Target erreicht.** Nach Merge von PR #2948 (Auto-Deploy via `build-website.yml`, beide Brand-Jobs `Deploy Website (mentolder)`/`Deploy Website (korczewski)` grün) erneut 3× `npx @lhci/cli autorun --collect.numberOfRuns=3` gegen `https://web.mentolder.de` gemessen: Performance-Score konstant **90/100** über alle 3 Läufe (FCP 2.0s, LCP 3.0–3.1s). Live-HTML bestätigt den Fix: `sidekick-panels.css` wird per `<link rel="preload" as="style" onload="this.rel='stylesheet'">` + `<noscript>`-Fallback geladen, keine blockierende `<link rel="stylesheet">`-Variante mehr im `<head>`. G-FE05 wechselt von Prio B/A nach Prio C (Green Gate).

**Baseline-Update 2026-07-21:** G-AGENTIC08 1→0 (toter Script-Pfad `scripts/openspec-validate.sh` in `openspec-propose/SKILL.md` zu `scripts/openspec.sh validate` korrigiert); G-DB04 1h→13h (Backup-Alter 13h, weiterhin im Target ≤26h); G-DEP04 2→0 (package.json engines korrigiert, Gate grün); G-CQ06 1→0 (@deprecated stripeServiceKey entfernt); G-CQ02 8→0 (any-Typen und comment-false-positives behoben); alle Prio-C-Gates grün via `scripts/health-goals-check.sh` verifiziert.

**Baseline-Update 2026-07-22 (T002063 — neue Scopes E2E/OPS/Restore):** Drei neue Goal-Scopes
aufgenommen, die die Laufzeit-Perspektive abdecken (bisher maßen nur die G-DB-Goals gegen
Live-Systeme): **G-E2E01** Nightly-E2E-Erfolgsrate `e2e.yml` — Baseline **0 % (0/14 grün)**,
direkte Prio A (aktive Verletzung; Fix läuft über `fix/e2e-auth-token-and-cron-secret`).
**G-E2E02** E2E-Testdaten-Leak (is_test_data-Rows in Prod) — Baseline 2 (je 1×
`public.inbox_items` in beiden Brand-DBs), Prio B. **G-OPS01** Pods nicht Running/Ready —
Baseline 3 (`[livekit-egress — removed T002184]` Pending, `test-pod` Failed/Debris, `oauth2-proxy-terminal`
Pending), Prio B. **G-OPS02** Container-Restarts <24h — 1 ≤ 3 ✓ (Green Gate). **G-OPS03**
Live-TLS-Cert-Restlaufzeit — 37 Tage ≥ 14 ✓ (Green Gate; erste Messung gegen
`web.korczewski.de` schlug transient fehl → Messung mit Retry). **G-DB11** Tage seit letztem
Restore-Verify — n/a (Marker-ConfigMap `recovery-verify-status` wird ab jetzt von
`backup-restore-lib.sh cmd_recovery_verify` bei Erfolg gestempelt; erster `verify`-Lauf
ausstehend), Prio B. Alle sechs in `scripts/health-goals-check.sh` verdrahtet
(kubectl/gh/openssl-Checks SKIPpen bei `--fast` oder fehlender Erreichbarkeit).
Der erste G-DB11-Verify-Lauf schlug direkt fehl (shared-db `/dev/shm` 64M zu klein für den
HNSW-Index-Build — website-Backup aktuell nicht vollständig restaurierbar, Bug **T002064**);
Nebenbefund Wegwerf-DB-Leiche bei Job-Abbruch via cleanup-`trap` gefixt.

**Baseline-Update 2026-07-22 (T002064 — G-DB11 Verify-Blocker gefixt):** G-DB11 n/a → **0 ✅**.
shared-db bekam via PR #3089 ein Memory-backed `/dev/shm` (512Mi, nur postgres-Container);
nach Deploy lief der Restore-Verify des Backups `20260722-000016` (website) vollständig durch
(93 Tabellen, inkl. `chunks_embedding_hnsw`-HNSW-Build) und stempelte `recovery-verify-status`.
Das website-Backup ist damit nachweislich wieder restaurierbar. Nebenbei entdeckt + gefixt
(T002066, PR #3091): `RECOVER_DOMAIN` war im Schema required, fehlte aber in allen vier
Brand-Env-Dateien — blockierte jeden `workspace:deploy`. OpenSpec-Change
`fix-t002064-shared-db-dev-shm` archiviert (Delta in `backup-pipeline`-SSOT gemergt).

**Baseline-Update 2026-07-22:** Prio-C-Tabellenwerte mit `health-goals-check.sh` synchronisiert:
G-DB04 8→22 (Backup-Alter steigt, weiterhin im Target ≤26h); G-OPS03 37→36 (TLS-Restlaufzeit
sinkt mit der Zeit korrekt); G-DB08 n/a→1 (Seq-Scan-Quote erstmals gemessen, 1 Tabelle >5 %
Seq-Scan-Anteil, 1 ≤3 ✓); G-OPS01 3→2 (Baseline-Korrektur: `test-pod` debris zwischenzeitlich
gelöscht, nur noch `[livekit-egress — removed T002184]` + `oauth2-proxy-terminal` Pending). **Regressionen:**
G-AGENTIC09 0→2 (Prio C → Prio A: zwei SKILL.md >500 Zeilen, Target=0) — Nachfolger TBD.
G-DB09 0→1 (Prio C → Prio A: eine Slow Query in pg_stat_statements, Target=0) — Nachfolger TBD.
`website/src/lib/goals-data.generated.json` via `node scripts/gen-goals-data.mjs` neu generiert.

**Baseline-Update 2026-07-26 (T002162 — erste automatisierte Messung):** Ab heute schreibt
`.github/workflows/health-goals.yml` (cron `0 1 * * *`) die Prio-C-Werte nächtlich fort. Bis
hierher lief die Messung ausschließlich manuell: `gen-goals-data.mjs` misst nichts, es parst
diese Datei — änderte sie niemand, erzeugte der nächtliche `freshness-regen`-Lauf bitgleiche
Ausgabe, sah keinen Diff und committete nichts. Die Pipeline war durchgehend grün und lieferte
trotzdem eingefrorene Zahlen. T002158 (PR #3206) hatte zuvor die *Publish*-Kette repariert
(`build-website.yml` triggert auf `.claude/lib/goals.md`, bedingtes `[skip ci]`); dieses Ticket
schließt die verbleibende Lücke davor — die Messung selbst.

Werte aus dem ersten vollständigen Lauf (`health-goals-update.sh --full`, gegen `fleet`):
**G-SIZE03 1939→311** — der auffälligste Posten. `website/src/lib/website-db.ts` wurde in
T002149/T002150 (PRs #3182, #3194) zweistufig zerlegt; das Dashboard zeigte tagelang weiter
1939. Ein ungemessenes Ziel verdeckt nicht nur Regressionen, sondern auch erreichte Ziele.
G-DOC02 190→200 (CLAUDE.md exakt am Target ≤200 — nächste Ergänzung kippt das Gate);
G-CI03 7→5 min p95; G-TEST05 85→86 %; G-OPS03 36→33 Tage TLS-Restlaufzeit.
**Regression:** G-DB04 22→35 h — das letzte erfolgreiche `db-backup`-Job liegt 35 h zurück und
verletzt damit Target ≤26 h. Erster Befund dieses Laufs, der ohne die Automatisierung
unentdeckt geblieben wäre; Ursachenklärung als eigenes Ticket, nicht in diesem Change.

Ebenfalls in T002162 behoben: `gen-goals-data.mjs` las `measured_at` aus dem **letzten**
`Baseline-Update`-Marker in Dokument-Reihenfolge. Die Marker stehen hier aber thematisch
sortiert (Prio-A-Abschnitt oben, Prio-B/C-Historie unten), nicht chronologisch — der
2026-07-25-Eintrag auf Zeile 108 verlor deshalb gegen die 2026-07-22-Einträge weiter unten,
und alle 95 Ziele trugen einen vier Tage alten Mess-Stichtag. Jetzt gewinnt das jüngste Datum.

**Baseline-Update 2026-07-27 (T002302 — Skill-Inventar-Bereinigung):**
- 11 getrackte Skills entfernt (6 STUBs, 1 Grabstein `llm-ops`, 4 ML-Vendor-Skills)
- G-AGENTIC06 Zähler in OVERVIEW.md von 39 auf 28 korrigiert (Soll: `git ls-files | grep -c SKILL.md`)
- Drei ML-Skill-Registrierungen (unsloth, gguf-quantization, speculative-decoding) aus OVERVIEW.md entfernt
- `skills-lock.json`: llama-cpp-Eintrag entfernt (nur lavish, vitest verbleiben)
- Skill-Deny-Liste in `.opencode/opencode.jsonc` um 12 Einträge bereinigt

**Baseline-Update 2026-07-27 (T002303 — Skill-Qualitäts-Pass):**
- **G-AGENTIC09 verschärft und von `target` auf `gate` hochgestuft:** Schwelle 500 → 250, Scope
  von „alle Skills" auf „projekteigene" (abgeleitet aus der Vendor-Sektion in `OVERVIEW.md`).
  Baseline 2 → 0. Die sechs Übergrößen wurden per Progressive Disclosure gekürzt, ohne einen
  Schritt zu verlieren: `dev-flow-execute` 486→248, `infra-ops` 476→176, `dev-flow-plan` 460→209,
  `ticket-ops` 334→131, `openspec-explore` 298→206, `git-workflow` 283→230.
- **G-AGENTIC08 Scope erweitert:** von `--include=SKILL.md` auf alle `.md` der projekteigenen
  Skills plus `references/`. Vorher blieben ausgelagerte Referenzdateien ungeprüft — genau die
  Lücke, die dieser Change sonst vergrößert hätte. Vendor-Skills bleiben ausgenommen, weil ihre
  relativen `scripts/`-Pfade skill-lokal korrekt sind und repo-relativ falsch gelesen würden.
- Neue gemeinsame Hilfsfunktion `project_owned_skills()` im Kopf von `health-goals-check.sh`.
- Nebenbefund, nicht gemessen: **sieben `description`-Frontmatter waren kein gültiges YAML**
  (unquotierter `: ` im Plain-Scalar), davon fünf Vorbestand. Alle projekteigenen descriptions
  sind jetzt gequotet; `brain-ingest` hatte überhaupt kein Frontmatter und war damit nie über
  Intent-Matching erreichbar.
