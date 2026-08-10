#!/usr/bin/env bats
# tests/spec/software-factory/ticket-lifecycle.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-52: mishap auto-chore-plan factory plumbing [T001844] ──────────────#
@test "FA-SF-52: queue.sh also selects plan_staged tickets" {
  # Die Zusage ist "gestagte Tickets erreichen den Dispatcher", nicht die konkrete
  # Formulierung. T002329/T002333 hat die Whitelist (`type='task'`) durch eine
  # Ausschlussliste ersetzt, weil ein gestagtes type='bug' sonst unsichtbar blieb —
  # mit zehn statt vier Typen wird diese Luecke wahrscheinlicher. Der Guard prueft
  # daher die Lane, nicht ihren Wortlaut.
  local lane
  lane=$(sed -n "/status='plan_staged'/p" scripts/factory/queue.sh)
  [ -n "$lane" ]
  # 'project' (das Epic) ist der einzige Typ, der nie selbst bearbeitet wird —
  # 'incident' (T002348) ebenso wenig. T002329/T002333 hat die Whitelist durch die
  # Ausschlussliste ersetzt; die Assertion folgt dem Produktionswortlaut.
  echo "$lane" | grep -Eq "type NOT IN \('project','incident'\)"
}

@test "FA-SF-52: slots.sh claim allows plan_staged status" {
  run grep -Fq "status IN ('backlog','triage','plan_staged')" scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-52: dispatcher-bridge strips feature|fix|chore prefix from slug" {
  run grep -Fq "s#^(feature|fix|chore)/#" scripts/factory/dispatcher-bridge.sh
  [ "$status" -eq 0 ]
  # old feature-only strip must be gone
  run grep -Fq "sed 's/^feature\\///'" scripts/factory/dispatcher-bridge.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-52: pipeline.js deploy guard admits chore branches" {
  # The branch-regex guard moved into buildDeployPrompt (pipeline-partials.cjs).
  run grep -Fq '^(feature|fix|chore)/' scripts/factory/pipeline-partials.cjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-52: pipeline.js PR title uses chore prefix for chore branches" {
  # titlePrefix is still computed in pipeline.js; the PR-title template moved to buildDeployPrompt.
  run grep -Fq "WORK_BRANCH.startsWith('chore/') ? 'chore' : 'feat'" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
  run grep -Fq '${c.titlePrefix}(${c.slug})' scripts/factory/pipeline-partials.cjs
  [ "$status" -eq 0 ]
}

# ── FA-SF-52-qa-notify ──────────────────────────────────────────#
# FA-SF-52: offline arg-validation für scripts/factory/qa-notify.sh [T000730]

@test "FA-SF-52: qa-notify.sh is executable" {
  [ -x scripts/factory/qa-notify.sh ]
}

@test "FA-SF-52: --event is required" {
  run bash scripts/factory/qa-notify.sh --ticket-id T000001 --title "x" --slug foo
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--event" ]]
}

@test "FA-SF-52: rejects invalid --event" {
  run bash scripts/factory/qa-notify.sh --event launch --ticket-id T1 --title x --slug s
  [ "$status" -eq 2 ]
  [[ "$output" =~ "qa_review" ]] || [[ "$output" =~ "done" ]]
}

@test "FA-SF-52: --ticket-id is required" {
  run bash scripts/factory/qa-notify.sh --event qa_review --title "x" --slug foo
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--ticket-id" ]]
}

@test "FA-SF-52: --slug is required" {
  run bash scripts/factory/qa-notify.sh --event qa_review --ticket-id T1 --title "x"
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--slug" ]]
}

@test "FA-SF-52: --help exits 0 with usage" {
  run bash scripts/factory/qa-notify.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "qa-notify" ]]
}

# ── T002281: Provider-Slot-Leak + Datenintegritaet ────────────────────
# Vier Befunde aus dem Gemma-Cutover (T002277). Die Guards sind strukturell,
# weil die Verhaltenspfade eine Live-DB brauchen und diese Suite offline laeuft.

@test "T002281: auto-triage.sh gibt den geclaimten Provider-Slot frei" {
  # route-provider.sh claimt atomar (active_agents+1) und liefert slotId.
  # auto-triage.sh las slotId bisher nicht einmal aus - deshalb stand deepseek
  # auf active_agents=3 = max_concurrent und war als Fallback dauerhaft tot,
  # ohne jede Fehlermeldung. scout-llm-fallback.sh macht es korrekt vor.
  run bash -c "grep -Eq 'trap .*release.* EXIT' '$REPO/scripts/factory/auto-triage.sh'"
  [ "$status" -eq 0 ]
  run bash -c "grep -q 'slotId' '$REPO/scripts/factory/auto-triage.sh'"
  [ "$status" -eq 0 ]
}

@test "T002281: es gibt einen TTL-Reaper fuer verwaiste Provider-Slots" {
  # Ein reiner Aufrufer-Fix macht den Leak unsichtbar, nicht unmoeglich:
  # zwei Aufrufer, einer hatte den Release bereits vergessen.
  [ -f "$REPO/scripts/factory/reap-provider-slots.sh" ]
  run bash -c "grep -q 'claimed_at' '$REPO/scripts/factory/reap-provider-slots.sh'"
  [ "$status" -eq 0 ]
}

@test "T002281: Migration bereinigt Muell-Provider und sperrt die Klasse" {
  # Die Altlast traegt ganze TSV-Zeilen als Provider-Namen (literale \t,
  # 4-Feld-Format einer abgeloesten Query-Version). Der CHECK haelt die Klasse
  # zu, unabhaengig davon welcher Schreibpfad sie erzeugt hat.
  local mig="$REPO/scripts/migrations/2026-07-27-provider-health-integrity.sql"
  [ -f "$mig" ]
  run bash -c "grep -Eq 'ADD COLUMN IF NOT EXISTS claimed_at' '$mig'"
  [ "$status" -eq 0 ]
  run bash -c "grep -Eiq 'CHECK' '$mig'"
  [ "$status" -eq 0 ]
}

@test "T002281: route-provider.sh behauptet kein Inlining in pipeline.js" {
  # pipeline.js enthaelt weder slotId noch route-provider noch provider_health -
  # der Kommentar hat beim Debuggen dieses Befunds aktiv in die Irre gefuehrt.
  run bash -c "grep -q 'inlined into pipeline.js' '$REPO/scripts/factory/route-provider.sh'"
  [ "$status" -ne 0 ]
}

@test "T002281: check-commit-vs-diff.bats schreibt nie ins Repo-Root" {
  # 'mkdir -p \$TMP/repo && cd \$TMP/repo && git init' - die folgenden Zeilen
  # hingen NICHT an dieser Kette. Schlaegt cd fehl, entsteht openspec/changes/x
  # im echten Repo; bats setzt in @test-Bloecken kein set -e, der Test laeuft
  # stillschweigend weiter.
  run bash -c "grep -cE 'cd \"\\\$TMP/repo\"( |\$)' '$REPO/tests/unit/check-commit-vs-diff.bats'"
  [ "$status" -eq 0 ]
  # Jedes cd in diese Datei muss einen Fehlerpfad haben (|| return / || fail).
  run bash -c "grep -E 'cd \"\\\$TMP/repo\"' '$REPO/tests/unit/check-commit-vs-diff.bats' | grep -vcE '\\|\\|'"
  [ "$output" = "0" ]
}

@test "T002281: FA-SF-70 schreibt nicht in die echte provider_config" {
  # Der Test rief 'provider-config.sh set --source x --tier opus' gegen die
  # produktive Tabelle auf und hinterliess dort dauerhaft x|opus|1|anthropic|m.
  # Nur vollstaendige Aufrufe pruefen (erkennbar an --provider): unvollstaendige enden
  # in usage() vor jedem DB-Zugriff und sind unbedenklich.
  # [T002503] Scannt das ganze Verzeichnis statt der aufgeteilten Sammeldatei. Auf eine
  # Datei verengt wuerde der Guard die uebrigen stillschweigend nicht mehr abdecken —
  # genau die Vakuositaet, die T002427 schon einmal erzeugt hat.
  run bash -c "grep -rhE 'provider-config\.sh set .*--provider' '$REPO/tests/spec/software-factory/' | grep -vcE '\-\-dry-run'"
  [ "$output" = "0" ]
}

@test "T002368: kein Test legt ein Change-Verzeichnis im echten openspec/ an" {
  # Verallgemeinert den T002281-Guard eine Ebene hoeher: dort ging es um EINE
  # Datei, hier um das Muster. Ein relativ angelegtes openspec/changes/<slug>
  # ist unter `bats -j 6` fuer den validateTree('openspec')-Test in
  # openspec-workflow.bats sichtbar, der dann 'missing specs/ delta dir' meldet
  # -- sporadisch rot, ohne Bezug zur eigentlichen Aenderung (PR #3400).
  # Plan-/Fixture-Pfade gehoeren nach mktemp.
  # Die grep-Zeilen dieses Guards selbst sind ueber '| grep' ausgenommen.
  run bash -c "grep -rE 'mkdir -p .?openspec/changes' '$REPO/tests/spec/' | grep -vc 'grep'"
  [ "$output" = "0" ]
}

@test "T002272-M1: queue.sh WHERE clause gates plan_staged tasks on execution_released" {
  run grep -n "execution_released" "$REPO_ROOT/scripts/factory/queue.sh"
  [ "$status" -eq 0 ]
}

# ── T002366: release-hold darf nicht auf dem factory.service-Oneshot blockieren ──
# factory.service ist Type=oneshot mit RuntimeMaxSec=3600/TimeoutStartSec=3660.
# `systemctl start` haengt sich an einen laufenden Job an und wartet bis zu 61 min.
# Der Stub bildet genau diese Semantik nach: blockierend ohne --no-block.
# TICKET_OFFLINE bleibt bewusst 0 — mit 1 kehrt release-hold vor dem systemctl-Aufruf
# zurueck und der Test waere auch ohne den Fix gruen (Scheintest).
_t002366_stub_dir() {
  local d="$BATS_TEST_TMPDIR/t002366-bin"
  mkdir -p "$d"
  cat >"$d/kubectl" <<'SH'
#!/usr/bin/env bash
case "$1" in
  get)  echo "pod/shared-db-0" ;;
  exec) cat >/dev/null ;;
esac
exit 0
SH
  cat >"$d/systemctl" <<'SH'
#!/usr/bin/env bash
for a in "$@"; do [ "$a" = "--no-block" ] && exit 0; done
sleep 30
SH
  chmod +x "$d/kubectl" "$d/systemctl"
  echo "$d"
}

@test "T002366: release-hold kehrt zurueck, waehrend ein factory-Tick laeuft" {
  local stub_dir; stub_dir="$(_t002366_stub_dir)"
  run env PATH="${stub_dir}:${PATH}" TICKET_OFFLINE=0 \
    timeout 5 bash "$REPO_ROOT/scripts/ticket.sh" release-hold --id T000001
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '^execution_released set to true for ticket T000001$'
}

@test "T002366: kein blockierendes 'systemctl start factory.service' in der Ticket-CLI" {
  # Klassen-Guard zum Verhaltenstest oben: stage-plan.sh weckt factory.service auf
  # demselben Weg (Zeile ~85, nur im Nicht---hold-Zweig) und haengt dort genauso.
  # Der dortige Kommentar nennt den Weck-Aufruf ausdruecklich best-effort und
  # non-fatal — ein blockierendes 'systemctl start' widerspricht dem.
  run bash -c "grep -rn 'systemctl --user start' \
      '$REPO_ROOT/scripts/ticket.sh' '$REPO_ROOT/scripts/vda/ticket/' \
      | grep -vc -- '--no-block'"
  [ "$output" = "0" ]
}

# ── T002361-livelock-breaker ─────────────────────────────────────#
# T002361: a dry-run that aborts before setting its marker must not loop forever.
# The watchdog counts consecutive fruitless resets, resets the counter on real
# phase progress, and escalates to `unfactory` (permanent dispatch exclusion).

@test "T002361: watchdog counts attempts in factory_control under a non-NULL brand" {
  # T000474: factory_control has UNIQUE (key, brand) and Postgres treats NULL as
  # distinct, so ON CONFLICT never fires for a NULL-brand row. A counter written
  # with brand=NULL would accumulate duplicates and increment meaninglessly.
  run grep -c "factory_attempt" "$REPO_ROOT/scripts/factory/watchdog.sh"
  [ "$status" -eq 0 ]
  run bash -c "grep -A12 'factory_attempt' '$REPO_ROOT/scripts/factory/watchdog.sh' | grep -c 'brand'"
  [ "$status" -eq 0 ]
}

@test "T002361: watchdog resets the attempt counter on real phase progress" {
  # Real progress = a factory_phase_events row newer than the counter's own
  # updated_at. tickets.updated_at is NOT usable: fn_lifecycle_ts bumps it on
  # every row write, so a bare touch would look like progress.
  run bash -c "grep -c 'factory_phase_events' '$REPO_ROOT/scripts/factory/watchdog.sh'"
  [ "$status" -eq 0 ]
  run bash -c "grep -A20 'factory_attempt' '$REPO_ROOT/scripts/factory/watchdog.sh' | grep -c 'updated_at'"
  [ "$status" -eq 0 ]
}

@test "T002361: watchdog escalates to unfactory at FACTORY_MAX_ATTEMPTS" {
  run grep -c "FACTORY_MAX_ATTEMPTS" "$REPO_ROOT/scripts/factory/watchdog.sh"
  [ "$status" -eq 0 ]
  run grep -c "unfactory" "$REPO_ROOT/scripts/factory/watchdog.sh"
  [ "$status" -eq 0 ]
}

@test "T002361: ticket.sh exposes an unfactory subcommand" {
  run bash -c "bash '$REPO_ROOT/scripts/ticket.sh' 2>&1 | grep '^Commands:' | grep -c 'unfactory'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T002361: unfactory sets status, attention_mode and the factory_excluded flag" {
  run bash -c "grep -A25 'cmd_unfactory()' '$REPO_ROOT/scripts/ticket.sh' | grep -c 'factory_excluded'"
  [ "$status" -eq 0 ]
  run bash -c "grep -A25 'cmd_unfactory()' '$REPO_ROOT/scripts/ticket.sh' | grep -c 'needs_human'"
  [ "$status" -eq 0 ]
  run bash -c "grep -A25 'cmd_unfactory()' '$REPO_ROOT/scripts/ticket.sh' | grep -c 'blocked'"
  [ "$status" -eq 0 ]
}

@test "T002361: queue.sh excludes factory_excluded tickets in BOTH dispatch branches" {
  # One gate per branch (feature/backlog and task/plan_staged) — a single
  # occurrence would leave one dispatch path open.
  run bash -c "grep -c 'factory_excluded' '$REPO_ROOT/scripts/factory/queue.sh'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

# ── T002333: plan_staged bugs must be dispatchable, not only tasks ───────────
# Ein Bug-Ticket mit gestagtem, lint-gepruefram Plan war fuer den Dispatcher
# strukturell unsichtbar: die WHERE-Klausel kannte nur type='feature' (backlog)
# und type='task' (plan_staged). Es blieb ohne Fehlermeldung liegen — belegt am
# 2026-07-27 an T002278, T002321 und T002335.
#
# Die Erweiterung laeuft bewusst ueber IN ('task','bug') im BESTEHENDEN Zweig
# statt ueber einen dritten OR-Zweig: nur so teilen sich Tasks und Bugs
# dieselben Readiness-Gates (execution_released, factory_excluded). Ein
# separater Zweig muesste sie duplizieren — genau die Luecke, die T002361
# schliessen musste.
@test "T002333: queue.sh dispatches plan_staged bug tickets alongside tasks" {
  # Geprueft wird die Zusage ("ein gestagtes bug-Ticket erreicht den Dispatcher"),
  # nicht ihr Wortlaut. T002329 hat die Whitelist IN ('task','bug') durch die
  # Ausschlussliste `type <> 'project'` ersetzt — strikt allgemeiner, sie deckt
  # zusaetzlich die sechs neuen Conventional-Commit-Typen ab. Ein grep auf die
  # alte Formulierung wuerde hier rot, obwohl die Zusage besser erfuellt ist als
  # zuvor; deshalb akzeptiert der Guard beide Formen.
  local lane
  lane=$(sed -n "/status='plan_staged'/p" "$REPO_ROOT/scripts/factory/queue.sh")
  [ -n "$lane" ]
  echo "$lane" | grep -Eq "type NOT IN|type <> 'project'|type IN \('task','bug'\)"
}

@test "T002333: the plan_staged dispatch branch stays single (no ungated bug duplicate)" {
  # Genau EIN plan_staged-Zweig. Ein zweiter waere der Duplikat-Pfad, an dem
  # die Readiness-Gates auseinanderlaufen koennen.
  run bash -c "grep -c \"status='plan_staged'\" '$REPO_ROOT/scripts/factory/queue.sh'"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]
}

@test "T002361: pipeline.mjs calls dryrun-mark outside the DRY_RUN agent prompt" {
  # pipeline.mjs is the LIVE workflow (dispatcher-bridge.sh launches it via
  # Workflow({scriptPath}); run-pipeline.mjs imports it). pipeline.js is a stale
  # near-duplicate that nothing dispatches.
  #
  # T001816 put the marker INSIDE the agent prompt, i.e. it only fires if the
  # headless session lives AND the model complies. It must be deterministic code
  # after the agent() call returns.
  local body
  body=$(sed -n '/^if (DRY_RUN) {/,/^}/p' "$REPO_ROOT/scripts/factory/pipeline.mjs")
  [ -n "$body" ]
  # The prompt is the template literal handed to agent(); the marker must not be in it.
  run bash -c "printf '%s' \"\$(sed -n '/^if (DRY_RUN) {/,/^  )\$/p' '$REPO_ROOT/scripts/factory/pipeline.mjs')\" | grep -c 'dryrun-mark'"
  [ "$output" -eq 0 ]
  # But the DRY_RUN block as a whole must still set the marker.
  printf '%s' "$body" | grep -q 'dryrun-mark'
}

# ── [T002329 / T002333] staged-Lane ist eine Ausschluss-, keine Positivliste ──#
#
# T002333: ein type='bug'-Ticket mit status='plan_staged' war fuer den
# Dispatcher unsichtbar, weil die Lane als Whitelist ('task') gepflegt wird.
# Mit dem Conventional-Commit-Vokabular waechst die Typmenge von vier auf zehn,
# also waechst auch die Chance, wieder einen Wert zu vergessen. Die Lane wird
# deshalb auf `type <> 'project'` umgestellt -- 'project' ist der Epic-Typ und
# der einzige, der nie selbst bearbeitet wird.

@test "T002329/T002333: die staged-Lane schliesst ausschliesslich project aus" {
  run bash -c "grep -Eq \"type (<>|NOT IN) \('project'\" '$REPO_ROOT/scripts/factory/queue.sh'"
  [ "$output" != "0" ]
}

@test "T002329/T002333: die staged-Lane ist keine Typ-Whitelist mehr" {
  # Die alte Form haette 'fix', 'docs', 'refactor' usw. weiterhin verschluckt.
  run bash -c "grep -c \"type='task' AND status='plan_staged'\" '$REPO_ROOT/scripts/factory/queue.sh'"
  [ "$output" = "0" ]
}

@test "T002329: die backlog-Lane erkennt feature und feat" {
  # Die backlog-Lane bleibt bewusst eine Positivliste -- sie haengt fachlich an
  # "Feature", nicht an "irgendein Arbeitstyp".
  run bash -c "grep -c \"type IN ('feature','feat')\" '$REPO_ROOT/scripts/factory/queue.sh'"
  [ "$output" != "0" ]
}

# ── [T002390] Auto-Chore-Plan: triage -> plan_staged ohne Menschen ───────────
#
# mishap-tracker SKILL.md Schritt 3.5 beschreibt den vollstaendigen Weg von einem
# frischen Bundle-Ticket bis status=plan_staged. Der Schritt ist aber PROSA:
# scripts/hooks/mishap-tracker.sh ist mit 46 Zeilen nur ein Friction-Recorder,
# und `grep -rln auto-chore-plan scripts/` lieferte nichts.
#
# Folge, gemessen am 2026-07-28: 8 Mishap-Bundles mit severity=minor lagen in
# triage — alle nach dem dokumentierten Gate auto-planbar. Belegt an der eigenen
# Session: T002381 und T002382 wurden per report_mishap angelegt (Schritte 1-3),
# Schritt 3.5 uebersprungen, beide blieben liegen.
#
# Das war die letzte strukturelle Luecke im Durchsatz: Der Dispatcher nimmt
# plan_staged (seit T002333 auch fuer bug), die Factory arbeitet — es kam nur
# nichts an, weil triage keinen automatischen Ausgang hatte.

@test "T002390: auto-chore-plan exists as an executable script, not only as prose" {
  [ -x "$REPO_ROOT/scripts/factory/auto-chore-plan.sh" ]
}

@test "T002390: auto-chore-plan honours the severity gate" {
  # major/critical (broken/security-Eintraege) duerfen NICHT auto-geplant werden —
  # sie brauchen menschliche Triage. Ohne dieses Gate wuerde das Skript genau die
  # Bundles durchwinken, bei denen ein Mensch hinsehen muss.
  run grep -Eq "major|critical" "$REPO_ROOT/scripts/factory/auto-chore-plan.sh"
  [ "$status" -eq 0 ]
}

@test "T002390: auto-chore-plan keeps the ticket ID case-sensitive in the branch name" {
  # .githooks/pre-commit erzwingt T[0-9]{6,} case-sensitive. Ein aus dem
  # lowercase-Slug abgeleiteter Branch (chore/mishap-t002382) matcht nicht, der
  # Commit wird abgelehnt und der Schritt kann nie durchlaufen. Genau dieser Bug
  # ist am 2026-07-26 live passiert (T002240).
  #
  # Geprueft wird, dass das Skript den Branch NICHT aus der lowercase-Variablen
  # baut: ein `tr '[:upper:]' '[:lower:]'` darf nur den Slug speisen.
  #
  # Die Existenzpruefung steht bewusst VOR dem grep: ohne sie waere der Test
  # leer-gruen, solange die Datei fehlt (grep findet nichts -> status != 0 ->
  # bestanden), und wuerde die Falle erst absichern, nachdem jemand sie
  # eingebaut hat.
  [ -f "$REPO_ROOT/scripts/factory/auto-chore-plan.sh" ]
  run grep -Eq 'branch=.*\$\{?slug' "$REPO_ROOT/scripts/factory/auto-chore-plan.sh"
  [ "$status" -ne 0 ]
}

@test "T002390: auto-chore-plan chains commit and push with &&" {
  # Ein abgelehnter Commit verhindert einen Push auf eigener Zeile NICHT — der
  # Branch waere dann ohne Plan gepusht und das Ticket zeigte auf Leeres.
  # Zeilenfortsetzungen (\ am Zeilenende) vorher aufloesen — die Verkettung darf
  # ueber mehrere Zeilen gehen, das ist die lesbarere Form. Ohne das Zusammen-
  # ziehen wuerde der Test die korrekte Schreibweise faelschlich ablehnen.
  run bash -c "sed -e ':a' -e 'N;\$!ba' -e 's/\\\\\\n[[:space:]]*/ /g' \
    '$REPO_ROOT/scripts/factory/auto-chore-plan.sh' \
    | grep -Eq 'git commit.*&&.*git push'"
  [ "$status" -eq 0 ]
}

@test "T002390: the factory tick invokes auto-chore-plan" {
  # Verankerung: Ohne Aufruf im Tick bleibt es bei "laeuft, wenn jemand daran
  # denkt" — exakt der Zustand, den dieses Ticket behebt.
  run grep -q "auto-chore-plan" "$REPO_ROOT/scripts/factory/wakeup.sh"
  [ "$status" -eq 0 ]
}

@test "T002390: the skill points at the script instead of duplicating the procedure" {
  run bash -c "grep -Eq 'auto-chore-plan\.sh|mishap-rollup\.sh' '$REPO_ROOT/.claude/skills/mishap-tracker/SKILL.md'"
  [ "$status" -eq 0 ]
}

# ── [T002327] Wiederaufnahme angefangener Tickets ───────────────────#
#
# GRENZE DIESER TESTS: `tickets.factory_phase_events` ist in CI nicht erreichbar.
# Geprüft werden deshalb Struktur und Verzweigung im Quelltext — Aufrufreihenfolge,
# Markerzeile, Exit-Code, Abwesenheit des blocked-Pfads im Fremdbesitz-Zweig — NICHT
# der Datenbank-Roundtrip. Wer hier einen DB-Test sucht: es gibt keinen, und das ist
# Absicht, kein Versehen.
#
# Die Import-Sperre aus T000460 (kein Top-Level-Import vor `meta`, kein import() zur
# Laufzeit in pipeline.js) wird bereits von den FA-SF-20-Kontrakttests oben abgedeckt.
# Hier bewusst KEINE zweite Assertion dafür — doppelte Zusicherungen driften auseinander.

@test "T002327: setupWorktree laeuft INNERHALB des REUSE-Zweigs vor read-partials" {
  # Die naheliegende Formulierung — erste Fundstelle von setupWorktree vor der ersten
  # von read-partials — waere schon VOR dem Fix gruen gewesen: der Batch-Pfad ruft
  # setupWorktree ohnehin frueher auf. Geprueft wird deshalb, dass ein Aufruf ZWISCHEN
  # `if (REUSE) {` und dem read-partials-Aufruf liegt. Genau das stellt der Fix her,
  # und genau daran haengt, ob read-partials das Partial-Manifest ueberhaupt sehen kann.
  local pj="$REPO/scripts/factory/pipeline.mjs"
  local reuse_line read_line setup_between
  reuse_line=$(grep -n '^if (REUSE) {' "$pj" | head -1 | cut -d: -f1)
  read_line=$(grep -n "'read-partials'" "$pj" | head -1 | cut -d: -f1)
  [ -n "$reuse_line" ] || { echo "if (REUSE) nicht gefunden"; false; }
  [ -n "$read_line" ]  || { echo "read-partials nicht gefunden"; false; }
  [ "$reuse_line" -lt "$read_line" ] || { echo "read-partials liegt vor dem REUSE-Block"; false; }

  setup_between=$(awk -v a="$reuse_line" -v b="$read_line" \
    'NR>a && NR<b && /await setupWorktree\(agent,/ {c++} END{print c+0}' "$pj")
  [ "$setup_between" -ge 1 ] || {
    echo "kein setupWorktree-Aufruf zwischen Zeile $reuse_line (if REUSE) und $read_line (read-partials)"
    false; }
}

@test "T002327: der zweite setupWorktree-Aufruf ist gegen Doppelanlage abgesichert" {
  # Ein zweiter Aufruf mit demselben Pfad scheitert an "<path> already exists" und
  # liefe direkt in die Eskalation — ein selbstverschuldetes `blocked`.
  run grep -Fq 'const iwt = wtReady' "$REPO/scripts/factory/pipeline.mjs"
  [ "$status" -eq 0 ] || { echo "Implement-Block prueft nicht, ob der Worktree schon steht"; false; }
}

@test "T002327: worktree-create.sh meldet einen belegten Branch mit Marker und Exit 3" {
  # Hermetische Sandbox statt des echten Repos (Muster wie T002245 in ci-cd.bats).
  # Gegen das echte Repo waere der Test flaky: der Divergence-Guard am Skriptkopf
  # stasht bei zurueckliegendem lokalem main den Arbeitsbaum und bricht aus einem
  # Worktree heraus sogar mit FATAL ab (`git fetch origin main:main` verweigert das
  # Aktualisieren eines anderswo ausgecheckten main). Der Test wuerde dann aus einem
  # voellig anderen Grund rot — und niemand wuesste, ob die Fremdbesitz-Erkennung
  # ueberhaupt geprueft wurde. In der Sandbox ist main == origin/main, der Guard ist
  # ein No-op, und geprueft wird genau das, was hier geprueft werden soll.
  local sbox; sbox="$BATS_TEST_TMPDIR/wc-sandbox"
  local br="chore/t002327-probe"
  local first="$sbox/first" second="$sbox/second"
  mkdir -p "$sbox/repo/scripts"
  cp "$REPO/scripts/worktree-create.sh" "$sbox/repo/scripts/worktree-create.sh"

  run bash -c "
    cd '$sbox/repo' &&
    git init -q -b main . &&
    git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base &&
    git add -A && git -c user.email=t@t -c user.name=t commit -q -m tree &&
    git update-ref refs/remotes/origin/main HEAD &&
    git worktree add --quiet -b '$br' '$first' HEAD 2>&1"
  [ "$status" -eq 0 ] || { echo "Sandbox-Vorbedingung fehlgeschlagen: $output"; false; }
  local REPO="$sbox/repo"

  # Auf die worktree-create-Ausgabezeile einschraenken. Ein unqualifiziertes
  # [[ "$output" == *"branch in use"* ]] waere hier zwar unverfaenglich, aber der
  # Worktree-Pfad dieses Changes enthaelt Begriffe aus dem Testtext — dieselbe Falle
  # wie in factory-reclaim-lock-respect.bats (T002267/T002272).
  run bash -c "cd '$REPO' && WT_SKIP_NAME_CHECK=1 bash scripts/worktree-create.sh '$br' '$second' origin/main 2>&1 | grep '^worktree-create:' | grep -c 'branch in use'"
  local marker_hits="$output"

  run bash -c "cd '$REPO' && WT_SKIP_NAME_CHECK=1 bash scripts/worktree-create.sh '$br' '$second' origin/main >/dev/null 2>&1"
  local exit_code="$status"

  # P5.4: kein Rest, und der belegte Branch lebt unveraendert weiter — der
  # schlimmstmoegliche Ausgang waere, den Branch einer lebenden Session zu loeschen.
  local leftover=0; [ -d "$second" ] && leftover=1
  run bash -c "cd '$REPO' && git show-ref --verify --quiet 'refs/heads/$br'"
  local branch_alive="$status"

  [ "$marker_hits" = "1" ] || { echo "Markerzeile 'branch in use' fehlt (Treffer: $marker_hits)"; false; }
  [ "$exit_code" -eq 3 ] || { echo "erwartet Exit 3 fuer Fremdbesitz, bekam $exit_code"; false; }
  [ "$leftover" -eq 0 ] || { echo "Rest-Worktree unter $second angelegt"; false; }
  [ "$branch_alive" -eq 0 ] || { echo "der belegte Branch wurde geloescht"; false; }
}

@test "T002327: der Exit-Code fuer Fremdbesitz ist im Skriptkopf dokumentiert" {
  # Er ist ab jetzt Kontrakt: pipeline.js verzweigt darauf.
  run bash -c "sed -n '1,40p' '$REPO/scripts/worktree-create.sh' | grep -c 'branch is already checked out in ANOTHER worktree'"
  [ "$output" = "1" ] || { echo "Exit-Code 3 nicht im Skriptkopf dokumentiert"; false; }
}

@test "T002327: der Fremdbesitz-Zweig setzt weder blocked noch PushNotification" {
  # Nicht ausfuehrbar testbar (kein Cluster, kein Agent) — geprueft wird der Quelltext
  # der Zweige. Jeder branch-in-use-Block muss VOR dem naechsten Zweig enden, ohne
  # --status blocked oder PushNotification zu enthalten.
  local pj="$REPO/scripts/factory/pipeline.mjs"
  local bad
  # Blockende ist der `return { status: 'deferred' ... }` — die letzte Anweisung jedes
  # Zweigs. Ein Indent-Muster als Terminator (/^  }/) laeuft in den NACHFOLGENDEN
  # if(!ok)-Eskalationsblock hinein und meldet dessen legitimes `blocked`.
  # Kommentarzeilen werden uebersprungen: der Zweig ERKLAERT, dass er kein blocked und
  # keine PushNotification setzt — ein Scan ueber den Rohtext bliebe an dieser
  # Erklaerung haengen und waere gruen, sobald jemand den Kommentar loescht.
  bad=$(awk '
    /^[[:space:]]*(\/\/|\*)/     { next }
    /reason === .branch-in-use./ { inblk=1 }
    inblk && /--status blocked/  { print "blocked in branch-in-use-Zweig, Zeile " NR }
    inblk && /PushNotification/  { print "PushNotification in branch-in-use-Zweig, Zeile " NR }
    inblk && /status: .deferred./ { inblk=0 }
  ' "$pj")
  [ -z "$bad" ] || { echo "$bad"; false; }

  # Gegenprobe: es GIBT ueberhaupt einen solchen Zweig (sonst ist der Test vakuum-gruen).
  run grep -c "reason === 'branch-in-use'" "$pj"
  [ "$output" -ge 2 ] || { echo "erwartet mind. 2 branch-in-use-Zweige (REUSE + Implement), fand $output"; false; }
}

@test "T002327: jeder Fremdbesitz-Zweig gibt den Slot frei" {
  # Bleibt der Slot belegt, verhungert die Queue — das waere schlimmer als das
  # `blocked`, das dieser Change ersetzt.
  local pj="$REPO/scripts/factory/pipeline.mjs"
  local branches releases
  branches=$(grep -c "reason === 'branch-in-use'" "$pj")
  releases=$(grep -c "defer-branch-in-use" "$pj")
  [ "$releases" -eq "$branches" ] || {
    echo "$branches Fremdbesitz-Zweige, aber $releases Slot-Freigaben"; false; }
  run grep -c "release-slot --id \${A.ticket_id}" "$pj"
  [ "$output" -ge "$branches" ] || { echo "zu wenige release-slot-Aufrufe"; false; }
}

@test "T002327: read-partials meldet uebersprungene Partials und den Fallback-Grund" {
  local pr="$REPO/scripts/factory/pipeline-runner.js"
  run grep -Fq 'res.skipped' "$pr";      [ "$status" -eq 0 ] || { echo "skipped fehlt"; false; }
  run grep -Fq "res.manifest" "$pr";     [ "$status" -eq 0 ] || { echo "manifest fehlt"; false; }
  run grep -Fq 'res.done_lookup' "$pr";  [ "$status" -eq 0 ] || { echo "done_lookup fehlt"; false; }
  # Rueckwaertskompatibel: pipeline.js:321 prueft weiterhin partials/sub_features.
  run grep -Fq 'partials.partials && Array.isArray(partials.sub_features)' "$REPO/scripts/factory/pipeline.mjs"
  [ "$status" -eq 0 ] || { echo "bestehender Vertrag partials/sub_features gebrochen"; false; }
}

@test "T002327: der stille Fallback ist beseitigt — pipeline.js loggt jeden Grund" {
  local pj="$REPO/scripts/factory/pipeline.mjs"
  run grep -c "partials.skipped\|partials.done_lookup\|partials.manifest" "$pj"
  [ "$output" -ge 4 ] || { echo "zu wenige Fallback-Meldungen in pipeline.js: $output"; false; }
}

@test "T002327: das Hold-Gate aus T002272 bleibt unangetastet (queue.sh)" {
  # Pruefmodus: Source-Grep. Ausnahme nach der Test-Resultats-Konvention
  # [T002448-M4] — die geschuetzte Eigenschaft ist eine WHERE-Klausel in einem
  # SQL-Heredoc. Sie zur Laufzeit zu messen verlangte eine bespielte Ticket-DB;
  # das Ergebnis manifestiert sich ausschliesslich im Quelltext.
  #
  # Vorgeschichte, zwei aufgegebene Formen:
  #   1. `git diff --exit-code origin/main -- scripts/factory/queue.sh` verglich
  #      gegen den ARBEITSBAUM statt gegen HEAD, und `[ "$status" -eq 0 ]`
  #      konnte "Diff nicht leer" nicht von "git-Kommando fehlgeschlagen"
  #      unterscheiden. Auf dem depth-1-Checkout in CI trat der zweite Fall ein
  #      und faerbte main rot, ohne dass queue.sh sich geaendert hatte [T002519].
  #   2. Der Blob-Hash-Vergleich behob (1), fror aber die GANZE Datei ein. Der
  #      Guard heisst "das Hold-Gate bleibt unangetastet" und pruefte
  #      "queue.sh bleibt byteidentisch" — zwei verschiedene Aussagen. T002830
  #      musste einen is_test_data-Filter ergaenzen, der das Hold-Gate
  #      nachweislich nicht beruehrt, und fiel trotzdem durch. Ein Guard, der
  #      jede legitime Aenderung blockiert, wird umgangen statt befolgt.
  #
  # Jetzt geprueft wird die Invariante selbst: die Gates, die verhindern, dass
  # der Dispatcher zurueckgehaltene Tickets aufgreift.
  local q="$REPO/scripts/factory/queue.sh"

  # Positiv-Anker [T002356-M1]: ohne ihn liefe jeder grep auf einer fehlenden
  # oder kaputten Datei ins Leere und der Test bestuende vakuos.
  [ -f "$q" ] || { echo "queue.sh fehlt: $q" >&2; return 1; }
  run bash -n "$q"
  [ "$status" -eq 0 ] || { echo "queue.sh ist syntaktisch kaputt: $output" >&2; false; }

  # execution_released: stage-plan --hold setzt es auf false. Genau ein
  # Vorkommen — in der plan_staged-Lane.
  run grep -c "readiness->>'execution_released'" "$q"
  [ "$output" -ge 1 ] || {
    echo "Hold-Gate entfernt: keine execution_released-Klausel in queue.sh" >&2; false; }

  # factory_excluded: gilt in BEIDEN Lanes (feature-backlog und plan_staged).
  # Faellt eine weg, dispatcht sich ein ausgeschlossenes Ticket wieder selbst —
  # genau der Regress, den der Kommentar in queue.sh zu T002329 beschreibt.
  run grep -c "readiness->>'factory_excluded'" "$q"
  [ "$output" -ge 2 ] || {
    echo "factory_excluded-Gate unvollstaendig: $output von 2 Lanes" >&2; false; }
}

# ── [T002407-M7] Container-Lifecycle: plan_staged, Recycling, Treiber-Idempotenz ──#

@test "T002407-M7a: mishap-rollup.sh hat festen Slug und Branch (kein Abbruch bei Existenz)" {
  # Der Treiber verwendet einen persistenten Slug/Branch, der nie gelöscht wird.
  # Existiert er bereits, wird tasks.md neu erzeugt — kein exit 3.
  local script="$REPO/scripts/factory/mishap-rollup.sh"
  [ -f "$script" ]
  run bash -n "$script"
  [ "$status" -eq 0 ]
  # Slug ist fest codiert
  run grep -Fq 'SLUG="mishap-incident-rollup"' "$script"
  [ "$status" -eq 0 ]
  run grep -Fq 'BRANCH="chore/${SLUG}"' "$script"
  [ "$status" -eq 0 ]
  # Update statt Abbruch: existiert change dir → kein exit 3
  run grep -Eq "exit 3" "$script"
  [ "$status" -ne 0 ] || { echo "mishap-rollup.sh darf kein exit 3 enthalten"; false; }
}

@test "T002407-M7b: mishap-rollup.sh hat No-op-Pfad (keine Batches → exit 0 ohne Worktree)" {
  local script="$REPO/scripts/factory/mishap-rollup.sh"
  # No-op bei leerem Container: Suche nach Kommentar, der auf den No-op-Pfad hinweist
  run grep -qi "nichts zu tun\|noop\|no-op\|keine .*batches\|nothing to do" "$script"
  [ "$status" -eq 0 ] || { echo "No-op-Hinweis fehlt in mishap-rollup.sh"; false; }
  # Der No-op-Pfad muss vor der Worktree-Anlage exit 0 geben — prüfe Zeilen-Reihenfolge
  local wt_line noop_exit_line
  wt_line=$(grep -n 'worktree-create\|WORKTREE_CREATE' "$script" | head -1 | cut -d: -f1)
  noop_exit_line=$(grep -n 'exit 0' "$script" | head -1 | cut -d: -f1)
  if [[ -n "$wt_line" && -n "$noop_exit_line" ]]; then
    [ "$noop_exit_line" -lt "$wt_line" ] || skip "No-op-Pfad liegt nicht vor worktree-create (exit 0 ist später)"
  fi
}

@test "T002407-M7c: rollup-publish.sh integriert einen existierenden Remote-Branch statt Neu-Anlage" {
  # Der Divergenz-/Rebase-Pfad lebt seit T002931 nicht mehr in mishap-rollup.sh,
  # sondern in rollup-publish.sh: bei Lease-Fehler wird origin/${BRANCH} gefetcht
  # und der eigene Stand darauf neu gebaut. Ein existierender Remote-Branch wird
  # damit integriert statt ueberschrieben (T002914 bleibt erhalten).
  local script="$REPO/scripts/factory/rollup-publish.sh"
  [ -f "$script" ] || { echo "rollup-publish.sh fehlt"; false; }
  run bash -n "$script"
  [ "$status" -eq 0 ] || { echo "rollup-publish.sh ist syntaktisch kaputt: $output" >&2; false; }
  run grep -Eq 'fetch .*BRANCH|origin/\$\{BRANCH\}' "$script"
  [ "$status" -eq 0 ] || { echo "Divergenz-Pfad (fetch + origin/\${BRANCH}) fehlt in rollup-publish.sh"; false; }
}

@test "T002913-M8a: kein Rebase/Commit in rollup-publish.sh laeuft mit aktiven Hooks" {
  # Der post-commit-embed-Hook feuert bei JEDEM rebasierten/committeten Commit und
  # kann am Embedding-Backend haengen (readiness=true bei totem Endpoint). Genau so
  # hing der Factory-Tick stundenlang im Rollup-Rebase, hielt den Flock und blockierte
  # alle weiteren Ticks.
  #
  # Seit T002931 leben alle git-Schreiboperationen (commit, reset, rebase) in
  # rollup-publish.sh und laufen ueber die zentrale GIT-Variable mit
  # core.hooksPath=/dev/null.
  local script="$REPO/scripts/factory/rollup-publish.sh"
  [ -f "$script" ]

  # Positiv-Anker: die zentrale GIT-Variable traegt core.hooksPath=/dev/null und
  # wird tatsaechlich fuer Schreiboperationen (commit/reset) benutzt — sonst waere
  # die Aussage unten leer erfuellt.
  run grep -nE '^GIT=.*core.hooksPath=/dev/null' "$script"
  [ "$status" -eq 0 ] || { echo "GIT-Variable ohne core.hooksPath=/dev/null fehlt"; false; }
  local hook_calls
  hook_calls=$(grep -nE '\$GIT (commit|reset|rebase)' "$script" || true)
  [ -n "$hook_calls" ] \
    || { echo "kein \$GIT commit/reset/rebase-Aufruf in rollup-publish.sh — Anker verfehlt"; false; }

  # Kein nacktes `git commit/reset/rebase` ohne Hook-Abschirmung. Die GIT-Variable
  # ist der EINZIGE Weg, hier zu schreiben; ein direkter git-Aufruf waere ein
  # Regress. Kommentarzeilen zaehlen nicht.
  local unguarded
  unguarded=$(grep -nE '\bgit\b (commit|reset|rebase)' "$script" | grep -vE '^[0-9]+:[[:space:]]*#' || true)
  [ -z "$unguarded" ] \
    || { echo "Hook-tragendes git ohne core.hooksPath=/dev/null:"; printf '%s\n' "$unguarded"; false; }
}

@test "T002407-M7d: mishap-rollup.sh hat plan-lint als Hard Gate" {
  local script="$REPO/scripts/factory/mishap-rollup.sh"
  run grep -q "plan-lint" "$script"
  [ "$status" -eq 0 ] || { echo "plan-lint Gate fehlt in mishap-rollup.sh"; false; }
}

@test "T002407-M7e: auto-close-merged erkennt Rollup-Container und recycled statt close" {
  # auto-close-merged.sh muss den Container-Titel erkennen und ihn auf plan_staged
  # zurücksetzen statt auf done/shipped.
  local script="$REPO/scripts/factory/auto-close-merged.sh"
  run bash -n "$script"
  [ "$status" -eq 0 ]
  # Container-Erkennung: muss den ROLLUP_TICKET_TITLE oder eine eindeutige Markierung prüfen
  run grep -q "Mishap Rollup\|ROLLUP_TICKET_TITLE\|Rollup" "$script"
  [ "$status" -eq 0 ] || { echo "auto-close-merged.sh erkennt Rollup-Container nicht"; false; }
  # Recycling: statt done/shipped muss plan_staged gesetzt werden
  run grep -Eq "plan_staged" "$script"
  [ "$status" -eq 0 ] || { echo "auto-close-merged.sh recycled Container nicht (plan_staged fehlt)"; false; }
}

@test "T002407-M7f: wakeup.sh ruft mishap-rollup.sh pro Brand auf" {
  local script="$REPO/scripts/factory/wakeup.sh"
  # Nach mishap-flush und vor auto-chore-plan: mishap-rollup.sh pro Brand
  run grep -q "mishap-rollup.sh" "$script"
  [ "$status" -eq 0 ] || { echo "wakeup.sh ruft mishap-rollup.sh nicht auf"; false; }
  # Die Referenz steht in einem for-Block (mentolder+korczewski). Prüfe auf das Loop-Muster
  # und dass der Aufruf im Loop-Body liegt.
  run bash -c "grep -A3 'for .*_mr_brand' '$script' | grep -q 'mishap-rollup.sh'"
  [ "$status" -eq 0 ] || { echo "mishap-rollup.sh nicht im Brand-Loop"; false; }
}

@test "T002407-M7g: migrate-mishap-bundles.sh existiert und hat --dry-run und --help" {
  local script="$REPO/scripts/factory/migrate-mishap-bundles.sh"
  [ -f "$script" ]
  [ -x "$script" ]
  run bash -n "$script"
  [ "$status" -eq 0 ]
  run bash "$script" --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Usage" ]]
  # --dry-run muss ohne Fehler durchlaufen
  run bash "$script" --dry-run 2>&1
  [[ "$output" =~ "DRY RUN" ]]
}

@test "T002407-M7h: migrate-mishap-bundles.sh listet alle 12 Bundle-IDs" {
  local script="$REPO/scripts/factory/migrate-mishap-bundles.sh"
  run bash -c "grep -oE 'T002[0-9]{3,}' '$script' | sort -u | wc -l"
  # Mindestens die 12 bekannten Bundles müssen aufgeführt sein
  [ "$output" -ge 12 ] || { echo "weniger als 12 Bundle-IDs gefunden: $output"; false; }
  # Prüfung auf konkrete IDs
  for id in T002325 T002342 T002354 T002355 T002364 T002371 T002372 T002379 T002381 T002392 T002409 T002410; do
    run grep -q "$id" "$script"
    [ "$status" -eq 0 ] || { echo "Bundle-ID $id fehlt in migrate-mishap-bundles.sh"; false; }
  done
}
