#!/usr/bin/env bash
# scripts/lib/ticket-help.sh — Hilfe fuer scripts/ticket.sh und seine Subkommandos.
#
# [T002843] Hilfe auf Kommando- und Optionsebene. Drei Funktionen:
#   ticket_help_wanted "$@"       0 zurueck, wenn das ERSTE Argument --help oder -h ist
#   ticket_help_subcommand <name> Hilfetext eines Subkommandos auf stdout
#   ticket_usage                  Kommandoliste auf oberster Ebene
#
# Gesourct von scripts/ticket.sh (Dispatcher) und — bedingt — von
# scripts/vda/ticket/create.sh (Standalone-Aufruf). Keine Top-Level-Seiteneffekte.
#
# Die Pflichtfelder je Subkommando sind NICHT frei erfunden, sondern aus der
# jeweiligen `if`-Bedingung hinter der Options-Schleife abgelesen (z. B.
# scripts/vda/ticket/create.sh: --type, --title, --description) und mit
# "(required)" markiert — konsistent zu den bestehenden
# "ERROR: … are required."-Meldungen.
#
# Absichtlich KEINE Sortierung/Umbenennung der Kommandoliste in ticket_usage:
# sie ist ein handgepflegter String und weicht bereits vom case-Block ab — das
# wird in dieser Aenderung unveraendert uebernommen, damit der Diff lesbar
# bleibt (T002843 Task 4).

ticket_help_wanted() {
  # Nur das ERSTE Argument: ein Ticket mit dem Titel `-h` (--title "-h") oder
  # --description "… -h …" darf nicht als Hilfeaufruf verstanden werden.
  [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]
}

ticket_usage() {
  echo "Usage: $0 <command> [options]"
  echo "Commands: create, update-status, update-fields, set-parent, add-comment, add-pr-link, grill, archive-plan, get-attachments, get, set-touched-files, set-scout-drift, set-pipeline-slot, release-slot, reclaim, touch, enqueue, stage-plan, release-hold, assert-phase-chain, retry-count, unfactory, factory-control, dryrun-mark, dryrun-check, feature-flag, phase, inject, get-injections, plan-meta, lastenheft, list, backfill-id, triage, link-tickets, get-ticket-links, get-timeline, rollup-container, find-similar"
}

ticket_help_subcommand() {
  local name="${1:-}"
  case "$name" in
    create)
      cat <<'HELP'
Usage: ticket.sh create --type <type> --title <title> --description <description> [options]
  --type <type>           Ticket-Typ (required): fix|feat|chore|project|docs|refactor|perf|test|ci|build
  --title <title>         Kurztitel (required)
  --description <desc>    Beschreibung (required)
  --brand <brand>         mentolder|korczewski (default: mentolder)
  --severity <sev>        critical|major|minor|trivial
  --priority <prio>       hoch|mittel|niedrig (default: mittel)
  --status <status>       Start-Status (default: triage; plan_staged ist gesperrt)
  --attention-mode <mode> auto|ai_ready|needs_human
  --areas <areas>         Komma-separierte Bereiche, z. B. auth,chat
  --product-id <id>       UUID oder external_id eines type='project'-Tickets (setzt parent_id)
  --is-test-data          Zeile als Testdaten markieren
HELP
      ;;
    update-status)
      cat <<'HELP'
Usage: ticket.sh update-status --id <external_id> --status <status> [options]
  --id <external_id>      Ticket-ID, z. B. T000123 (required, ^T[0-9]{6,}$)
  --status <status>       Ziel-Status (required): triage|planning|plan_staged|backlog|in_progress|in_review|qa_review|blocked|awaiting_deploy|done|archived
  --resolution <res>      Bei done/archived: fixed|shipped|obsolete
  --notes <notes>         Optionale Notiz
HELP
      ;;
    update-fields)
      cat <<'HELP'
Usage: ticket.sh update-fields --id <external_id> [--title <title>] [--description <desc>]
  --id <external_id>      Ticket-ID (required)
  --title <title>         Neuer Titel
  --description <desc>    Neue Beschreibung
  Mindestens eines von --title / --description ist erforderlich.
HELP
      ;;
    set-parent)
      cat <<'HELP'
Usage: ticket.sh set-parent --id <external_id> --product-id <uuid-or-ext-id> [--brand <brand>]
  --id <external_id>      Ticket-ID (required)
  --product-id <id>       UUID oder external_id des type='project'-Tickets (required)
  --brand <brand>         mentolder|korczewski
HELP
      ;;
    add-comment)
      cat <<'HELP'
Usage: ticket.sh add-comment --id <external_id> --body <body> [options]
  --id <external_id>      Ticket-ID (required)
  --body <body>           Kommentartext, Markdown (required)
  --author <label>        Author-Label (default: claude-code)
  --visibility <vis>      internal|public (default: internal)
HELP
      ;;
    add-pr-link)
      cat <<'HELP'
Usage: ticket.sh add-pr-link --id <external_id> --pr <pr_number>
  --id <external_id>      Ticket-ID (required)
  --pr <pr_number>        PR-Nummer als Integer (required)
HELP
      ;;
    link-tickets)
      cat <<'HELP'
Usage: ticket.sh link-tickets --from <external_id> --to <external_id> --kind <kind>
  --from <external_id>    Quell-Ticket (required)
  --to <external_id>      Ziel-Ticket (required)
  --kind <kind>           pr|relates_to|blocks|blocked_by|duplicate_of|fixes|fixed_by|child_of (required)
HELP
      ;;
    get-ticket-links)
      cat <<'HELP'
Usage: ticket.sh get-ticket-links --id <external_id>
  --id <external_id>      Ticket-ID (required)
  Ausgabe: JSON mit blocks, blocked_by, relates, child_of, pr.
HELP
      ;;
    grill)
      cat <<'HELP'
Usage: ticket.sh grill --id <external_id> --questionnaire <name> <genau EINE Antwortquelle>
  --id <external_id>        Ticket-ID (required)
  --questionnaire <name>    Fragebogen (required, default: coaching-sessions-v1)
  Antwortquelle — genau eine:
  --json <json>             Antworten als JSON-String
  --answers-file <pfad>     Datei mit qid=text-Zeilen
  --answer "qid=text"       Einzelantwort (mehrfach wiederholbar)
  Weitere Optionen: --grilling-doc <pfad>, --dry-run-json, --no-comment, --brand <brand>
HELP
      ;;
    archive-plan)
      cat <<'HELP'
Usage: ticket.sh archive-plan --id <external_id> --slug <slug> --branch <branch> --plan-file <plan_file> [--pr <pr_number>]
  --id <external_id>      Ticket-ID (required)
  --slug <slug>           OpenSpec-Change-Slug (required)
  --branch <branch>       Feature/Fix-Branch (required)
  --plan-file <pfad>      Pfad zur Plan-Datei (required)
  --pr <pr_number>        Optionale PR-Nummer
HELP
      ;;
    get-attachments)
      cat <<'HELP'
Usage: ticket.sh get-attachments --id <external_id> --out-dir <out_dir>
  --id <external_id>      Ticket-ID (required)
  --out-dir <dir>         Zielverzeichnis (required, wird angelegt)
HELP
      ;;
    get)
      cat <<'HELP'
Usage: ticket.sh get --id <external_id>
  --id <external_id>      Ticket-ID (required; positionales Argument erlaubt)
  Ausgabe: Ticket-Zeile im Tabellenformat.
HELP
      ;;
    set-touched-files)
      cat <<'HELP'
Usage: ticket.sh set-touched-files --id <external_id> --files <paths>
  --id <external_id>      Ticket-ID (required)
  --files <paths>         Komma- oder whitespace-getrennte Pfade (required)
HELP
      ;;
    set-scout-drift)
      cat <<'HELP'
Usage: ticket.sh set-scout-drift --id <external_id> --drift <numeric>
  --id <external_id>      Ticket-ID (required)
  --drift <numeric>       Drift-Wert (required)
HELP
      ;;
    set-pipeline-slot)
      cat <<'HELP'
Usage: ticket.sh set-pipeline-slot --id <external_id> --slot <integer|null>
  --id <external_id>      Ticket-ID (required)
  --slot <slot>           Pipeline-Slot oder "null" zum Leeren (required)
HELP
      ;;
    release-slot)
      cat <<'HELP'
Usage: ticket.sh release-slot --id <external_id>
  --id <external_id>      Ticket-ID (required)
  Gibt den pipeline_slot des Tickets frei.
HELP
      ;;
    release-hold)
      cat <<'HELP'
Usage: ticket.sh release-hold --id <external_id>
  --id <external_id>      Ticket-ID (required)
  Setzt readiness.execution_released=true und weckt factory.service.
HELP
      ;;
    touch)
      cat <<'HELP'
Usage: ticket.sh touch --id <external_id>
  --id <external_id>      Ticket-ID (required)
  Bumpt updated_at (Lebenszeichen fuer den Watchdog).
HELP
      ;;
    retry-count)
      cat <<'HELP'
Usage: ticket.sh retry-count <action> --id <external_id>
  <action>                get|incr|reset (required)
  --id <external_id>      Ticket-ID (required)
HELP
      ;;
    unfactory)
      cat <<'HELP'
Usage: ticket.sh unfactory --id <external_id> [--attempts <n>]
  --id <external_id>      Ticket-ID (required)
  --attempts <n>          Anzahl fehlgeschlagener Runden (Zahl oder CLASS-N, z. B. INFRA-3)
  Setzt status=blocked, attention_mode=needs_human, readiness.factory_excluded=true.
HELP
      ;;
    factory-control)
      cat <<'HELP'
Usage: ticket.sh factory-control <action> --key <key> [options]
  <action>                get|set (required)
  --key <key>             Control-Key (required)
  --brand <brand>         Optionaler Brand (NULL = global)
  --value <value>         Wert (required bei set)
  --set-by <label>        Setzer-Label
HELP
      ;;
    dryrun-mark)
      cat <<'HELP'
Usage: ticket.sh dryrun-mark --id <external_id>
  --id <external_id>      Ticket-ID (required)
  Markiert den Dryrun des Tickets als done.
HELP
      ;;
    dryrun-check)
      cat <<'HELP'
Usage: ticket.sh dryrun-check --id <external_id>
  --id <external_id>      Ticket-ID (required)
  Exit 0 wenn der Dryrun als done markiert ist, sonst Exit 1.
HELP
      ;;
    feature-flag)
      cat <<'HELP'
Usage: ticket.sh feature-flag <action> --brand <brand> [options]
  <action>                set|get|list (required)
  --brand <brand>         mentolder|korczewski (required)
  --key <key>             Flag-Key (required bei set/get)
  --enabled <bool>        true|false (required bei set)
  --set-by <label>        Setzer-Label
HELP
      ;;
    phase)
      cat <<'HELP'
Usage: ticket.sh phase <ext_id> <phase> <state> [--detail "…"] [--driver factory|devflow]
  <ext_id>                Ticket-ID (required, positionales Argument)
  <phase>                 scout|design|plan|implement|verify|deploy (required)
  <state>                 entered|done|blocked (required)
  --detail "…"            Optionaler Detailtext
  --driver <d>            factory|devflow (default: factory)
HELP
      ;;
    inject)
      cat <<'HELP'
Usage: ticket.sh inject --id <external_id> --kind <kind> [options]
  --id <external_id>      Ticket-ID (required)
  --kind <kind>           context|note|asset (required)
  --phase <phase>         scout|design|plan|implement|verify|deploy
  --title <title>         Titel
  --content <content>     Inhalt
  --target-files <list>   Komma-separierte Zielpfade
  --file <pfad>           Datei fuer kind=asset (oder --nc-path)
  --nc-path <pfad>        Netcat-Pfad statt Datei-Inhalt
  --by <label>            Absender (default: admin)
HELP
      ;;
    get-injections)
      cat <<'HELP'
Usage: ticket.sh get-injections --id <external_id> [options]
  --id <external_id>      Ticket-ID (required)
  --phase <phase>         Filter: scout|design|plan|implement|verify|deploy
  --consume               Injektionen als konsumiert markieren
  --format <fmt>          text|json
HELP
      ;;
    plan-meta)
      cat <<'HELP'
Usage: ticket.sh plan-meta <subaction> --id <external_id> [options]
  <subaction>             set|get (required)
  --id <external_id>      Ticket-ID (required)
  --value-prop <text>     Kern-Nutzen des Features
  --effort <e>            klein|mittel|gross
  --areas <list>          Komma-separierte Bereiche
  --depends-on <list>     Komma-separierte Ticket-IDs
  --rank <n>              Planungs-Rang (niedrig = hoehere Prio)
  --readiness <kv>        Komma-separiert, z. B. spec_skizziert=true
  --requirements <list>   '|'-separierte Pflichtenheft-Liste
HELP
      ;;
    lastenheft)
      cat <<'HELP'
Usage: ticket.sh lastenheft <subaction> --id <external_id>
  <subaction>             lock|unlock (required)
  --id <external_id>      Ticket-ID (required)
  lock  setzt readiness.lastenheft_locked=true und stuft triage/planning/plan_staged auf backlog.
  unlock hebt die Sperre auf (Status bleibt).
HELP
      ;;
    list)
      cat <<'HELP'
Usage: ticket.sh list [options]
  --brand <brand>            mentolder|korczewski
  --status <status>          Filter nach Status
  --type <type>              Filter nach Typ
  --attention-mode <mode>    auto|ai_ready|needs_human
  --missing-id               Nur Tickets ohne external_id
  --limit <n>                Max. Zeilen (default 200)
  --sort <spalte>            Sortierung
  --include-test-data        Testdaten einschliessen
HELP
      ;;
    backfill-id)
      cat <<'HELP'
Usage: ticket.sh backfill-id [--brand <brand>]
  --brand <brand>         mentolder|korczewski
  Setzt die naechste Sequenznummer fuer Tickets ohne external_id.
HELP
      ;;
    triage)
      cat <<'HELP'
Usage: ticket.sh triage --id <external_id> [options]
  --id <external_id>       Ticket-ID (required)
  --priority <p>           hoch|mittel|niedrig
  --severity <s>           critical|major|minor|trivial
  --status <status>        Ziel-Status
  --component <c>          Betroffene Komponente
  --type <type>            fix|feat|chore|project|docs|refactor|perf|test|ci|build
  --attention-mode <m>     auto|ai_ready|needs_human
  --suggest                Vorschlag ausgeben, nicht anwenden
  --apply                  Vorschlag anwenden
  --no-comment             Keinen Timeline-Kommentar
HELP
      ;;
    get-timeline)
      cat <<'HELP'
Usage: ticket.sh get-timeline --id <external_id> [--brand <brand>]
  --id <external_id>      Ticket-ID (required)
  --brand <brand>         mentolder|korczewski
  Ausgabe: chronologisches JSON aus Kommentaren, Phasen-Events, PR-Links und Plaenen.
HELP
      ;;
    rollup-container)
      cat <<'HELP'
Usage: ticket.sh rollup-container [--brand <brand>]
  --brand <brand>         mentolder|korczewski
  Findet oder erstellt den offenen Mishap-Rollup-Container. Ausgabe: nur die external_id.
HELP
      ;;
    enqueue)
      cat <<'HELP'
Usage: ticket.sh enqueue --id <external_id> [--branch <branch>] [--plan <tasks.md>]
  --id <external_id>      Ticket-ID (required)
  --branch <branch>       Optionaler Branch (FACTORY-PLAN-REF)
  --plan <tasks.md>       Optionaler Plan-Pfad (FACTORY-PLAN-REF)
HELP
      ;;
    stage-plan)
      cat <<'HELP'
Usage: ticket.sh stage-plan --id <external_id> --branch <branch> --plan <tasks.md> --partials <1..9> [--hold]
  --id <external_id>      Ticket-ID (required)
  --branch <branch>       Feature/Fix-Branch (required)
  --plan|--plan-file <p>  Pfad zur Plan-Datei (required, muss im Git-Tree liegen)
  --partials <1..9>       Partial-Anzahl (required, auch fuer einen einzelnen Plan)
  --hold                  Ticket NICHT sofort factory-greifbar machen
HELP
      ;;
    assert-phase-chain)
      cat <<'HELP'
Usage: ticket.sh assert-phase-chain --id <external_id> [--json]
  --id <external_id>      Ticket-ID (required)
  --json                  Ausgabe als JSON
HELP
      ;;
    find-similar)
      cat <<'HELP'
Usage: ticket.sh find-similar <titel-oder-text> [--corpus <quelle>]
  Positionale Anfrage (Titel/Beschreibung) plus optional --corpus.
  Findet semantisch aehnliche OpenSpec-Changes/Tickets.
HELP
      ;;
    reclaim)
      cat <<'HELP'
Usage: ticket.sh reclaim <T000123> [--force]
  Gibt den pipeline_slot frei, setzt status=plan_staged und claimt das Ticket
  fuer diese Session. Bricht ab, wenn noch ein Worker laeuft (--force erzwingt).
HELP
      ;;
    *)
      # Rueckfall statt stiller Leerlauf: Optionen sind nicht fuer jedes
      # Subkommando hinterlegt. Der argumentlose Aufruf nennt die Flags.
      echo "Keine Detail-Hilfe fuer '$name' hinterlegt."
      echo "  Aufruf ohne Argumente zeigt die erwarteten Flags: ticket.sh $name"
      ;;
  esac
}
