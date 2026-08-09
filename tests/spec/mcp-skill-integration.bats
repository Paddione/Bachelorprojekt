#!/usr/bin/env bats
# tests/spec/mcp-skill-integration.bats
# SSOT: openspec/specs/mcp-skill-integration.md
#
# Covers: ticket-mcp adapter completeness, Go binary, mishap buffer tools.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── ticket-mcp tool coverage ──────────────────────────────────────────

@test "ticket-mcp server exists in .mcp.json" {
  run grep -q 'ticket-mcp' "$REPO/.mcp.json"
  [ "$status" -eq 0 ]
}

@test "ticket-mcp server exists in .opencode/opencode.jsonc" {
  run grep -q 'ticket-mcp' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
}

# ── Go binary ─────────────────────────────────────────────────────────

@test "ticket-mcp Go source directory exists" {
  [ -d "$REPO/scripts/ticket-mcp" ]
}

@test "ticket-mcp Go tools directory exists" {
  [ -d "$REPO/scripts/ticket-mcp/go" ] || [ -d "$REPO/scripts/ticket-mcp/go/internal/tools" ] || skip "Go source not yet extracted"
}

# ── Mishap buffer tools ───────────────────────────────────────────────

@test "mishap-tracker skill references report_mishap" {
  run grep -q 'report_mishap\|report-mishap' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "mishap-tracker skill references get_mishap_buffer" {
  run grep -q 'get_mishap_buffer\|get-mishap-buffer' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "mishap-tracker skill references flush_mishap_buffer" {
  run grep -q 'flush_mishap_buffer\|flush-mishap-buffer' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── T002383: Mishap-Emissionsrate ─────────────────────────────────────
# Gemessen am 2026-07-28: bis zum 25.07. wurde jedes erzeugte Mishap-Bundle am
# selben Tag geschlossen. Am 27.07. entstanden 32 Bundles, 19 blieben offen;
# 17 der 29 triage-Tickets waren Mishap-Bundles.
#
# Der Mechanismus ist selbstverstaerkend: Jeder dev-flow-Zyklus endet mit einem
# mishap-tracker-Aufruf, der bei MISHAP_TRIGGER Eintraegen ein Ticket erzeugt —
# und dieses Ticket braucht seinerseits einen Zyklus. Bei >= 1 Bundle pro Zyklus
# ist der Rueckstand per Konstruktion nicht abbaubar (Eigenmessung: 2 Zyklen,
# 2 Bundles).
#
# Eine hoehere Schwelle senkt die Emissionsrate unter 1 Bundle/Zyklus, ohne
# einen einzigen Mishap zu verlieren.

@test "T002383: MISHAP_TRIGGER is raised above the per-cycle emission rate" {
  local src="$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  run grep -Eq '^const MISHAP_TRIGGER = 10$' "$src"
  [ "$status" -eq 0 ]
}

@test "T002383: the skill no longer forces a session-end flush below the trigger" {
  # Der Buffer liegt in .git/mishap-buffer.json (mishapBufferPath()) — er ist
  # dateibasiert und ueberlebt Sessionwechsel. Die bisherige Begruendung, am
  # Session-Ende ginge sonst etwas verloren, ist damit sachlich falsch; genau
  # dieser erzwungene Flush erzeugte Ein-Eintrag-Bundles wie T002382.
  local skill="$REPO/.claude/skills/mishap-tracker/SKILL.md"
  run grep -q 'am Session-Ende nichts verloren geht' "$skill"
  [ "$status" -ne 0 ]
}

@test "T002383: bundling is driven periodically from the factory tick" {
  # Ohne periodischen Schnitt waechst der Buffer bei niedriger Aktivitaet
  # unbegrenzt alt — die angehobene Schwelle allein wuerde ihn nie leeren.
  run grep -q 'flush-stale-mishaps' "$REPO/scripts/factory/wakeup.sh"
  [ "$status" -eq 0 ]
}

@test "T002383: the mishap buffer path resolves the shared git dir" {
  # In einem git-Worktree ist .git eine DATEI — filepath.Join(root, ".git", …)
  # laeuft dort in ENOTDIR und writeBuffer verwarf den Fehler still.
  local src="$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  run grep -q 'git-common-dir' "$src"
  [ "$status" -eq 0 ]
}

@test "T002383: the skill documents that the buffer survives a session" {
  # Gegenprobe zum Test darueber: Der Flush darf nicht ersatzlos verschwinden,
  # sondern muss durch die Aussage ersetzt sein, dass Liegenbleiben sicher ist.
  # Ohne das laesst der geloeschte Absatz den Leser ratlos zurueck.
  local skill="$REPO/.claude/skills/mishap-tracker/SKILL.md"
  run grep -Eq 'mishap-buffer\.json|ueberlebt|überlebt|persistent' "$skill"
  [ "$status" -eq 0 ]
}

# ── Skill-critical verb coverage ──────────────────────────────────────

@test "ticket-mcp guide lists skill-critical verbs" {
  [ -f "$REPO/.claude/skills/references/mcp-tool-guide.md" ]
}

@test "mcp-tool-guide.md mentions create verb" {
  run grep -q 'create' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide.md mentions get verb" {
  run grep -q 'get\b' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide.md mentions add-comment verb" {
  run grep -q 'add-comment\|add_comment' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

# ── [T002407-M4] Incident-Typen umgehen den Buffer ────────────────────────────#
# Der Go-Code in mishap.go hat zwei Pfade: incident-Typen erzeugen sofort ein
# Ticket, nicht-kritische Typen sammeln im Buffer. Die Tests assertieren den
# Quelltext-Pfad (statisch, kein Go-Kompilat nötig).

@test "T002407-M4a: isIncidentType erkennt incident" {
  run grep -Fq 'return mtype == "incident" || mtype == "broken" || mtype == "security"' \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407-M4b: isIncidentType erkennt broken (Alias)" {
  # broken ist ein Alias für incident — beide erzeugen sofort ein Ticket.
  # Die isIncidentType-Funktion muss beide abdecken, nicht nur den Primärtyp.
  # Die Funktion steht auf einer Zeile, daher mit grep -A Kontext prüfen.
  run grep -A3 'func isIncidentType' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [[ "$output" == *'"broken"'* ]]
}

@test "T002407-M4c: isIncidentType erkennt security (Alias)" {
  run grep -A3 'func isIncidentType' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [[ "$output" == *'"security"'* ]]
}

@test "T002407-M4d: incident erzeugt createIncidentTicket-Aufruf (Sofort-Ticket)" {
  # Im report_mishap-Handler: wenn isIncidentType() → createIncidentTicket aufrufen.
  # Der Test sucht nach dem if-Zweig, der das Ticket erzeugt.
  run grep -Fq "createIncidentTicket(entry, brand)" \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ] || { echo "createIncidentTicket-Aufruf fehlt"; false; }
  run grep -Fq 'Incident-Ticket angelegt' \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407-M4e: nicht-kritische Typen (degraded) gehen in den Buffer" {
  # Der else-Pfad (nicht incident) schreibt in den Buffer.
  # Ein degraded-Mishap darf KEIN sofortiges Ticket auslösen.
  run grep -Fq "buffer = append(buffer, entry)" \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
  run grep -Fq 'Mishap gespeichert' \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

# ── [T002407-M5] Erzeugte Tickets tragen nie type=task ────────────────────────#
# incident-Tickets werden mit --type incident angelegt, non-incident-Rollup
# mit --type chore. Der Wert 'task' kommt in keinem Pfad vor. [T002329]

@test "T002407-M5a: buildIncidentTicketArgs verwendet --type incident" {
  run grep -Fq '"create", "--type", "incident"' \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407-M5b: buildIncidentTicketArgs verwendet --attention-mode needs_human" {
  run grep -Fq '"--attention-mode", "needs_human"' \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407-M5c: buildRollupContainerArgs verwendet rollup-container (T002783)" {
  # T002783: Die gemeinsame Container-Aufloesung verwendet ticket.sh rollup-container.
  run grep -Fq '"rollup-container"' \
    "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ] || { echo "rollup-container fehlt in buildRollupContainerArgs"; false; }
}

@test "T002407-M5d: findOrCreateRollupTicket nutzt rollup-container, nicht list/create (T002783)" {
  # T002783: Vorher wurde der Container ueber list/create geloest. Jetzt ueber
  # das gemeinsame rollup-container-Kommando, das beides in ticket.sh kapselt.
  run bash -c "grep -A10 'findOrCreateRollupTicket' \
    '$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go' 2>/dev/null \
    | grep -c 'rollup-container'"
  [ "$output" != "0" ]
}

@test "T002407-M5e: kein Pfad in mishap.go erzeugt type=task" {
  # Die Migration von Bundle zu incident/chore darf nirgendwo task verwenden.
  # task ist ein Legacy-Typ, der in T002331 entfernt wird. [T002329]
  run bash -c "grep -F '\"task\"' '$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go' \
    | grep -v '//.*\"task\"' | grep -v 'legacy.*task\|TODO\|FIXME' | wc -l"
  [ "$output" = "0" ]
}

# ── [T002407-M6] Rollup-Container wird in plan_staged angelegt ────────────────#
# findOrCreateRollupTicket erzeugt den Container mit status=plan_staged, nie triage.
# Das ermöglicht dem Rollup-Treiber, direkt auf den Plan zuzugreifen.

@test "T002407-M6a: Rollup-Container-Status wird von ticket.sh rollup-container verwaltet (T002783)" {
  # T002783: Der Go-Code traegt keinen eigenen --status mehr. ticket.sh rollup-container
  # verwaltet den Status intern (plant_staged bei Neuanlage).
  run bash -c "grep -A5 'buildRollupContainerArgs' \
    '$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go' 2>/dev/null \
    | grep -c 'status'"
  [ "$output" = "0" ] || { echo "buildRollupContainerArgs darf keinen --status hartcodieren — ticket.sh managed das"; false; }
}

@test "T002407-M6b: rollup-container legt den Container als triage an [T003027]" {
  # Pruefmodus: Quelltext-Pruefung. cmd_rollup_container loest seinen Pod ueber
  # _pgpod auf und braucht damit eine lebende DB — in der Offline-CI nicht
  # ausfuehrbar. Das ist die in CLAUDE.md (T002448-M4) dokumentierte Ausnahme fuer
  # Querschnittstests, nicht die bequeme Abkuerzung: eine Output-Verifikation waere
  # hier schlicht nicht lauffaehig.
  #
  # Sachlage (T003027): Bis T002876 legte rollup-container den Container direkt als
  # plan_staged an. Seit T002876 lehnt update-status.sh genau das fail-closed ab —
  # plan_staged ohne FACTORY-PLAN-REF ist ein widerspruechlicher Zustand. Der
  # Container entsteht deshalb als triage; stage-plan hebt ihn spaeter zusammen mit
  # dem Plan-Ref auf plan_staged.
  local block
  block=$(awk '/^cmd_rollup_container\(\)/,/^\}/' "$REPO/scripts/ticket.sh")

  # Positiv-Anker 1 — ohne ihn liefe alles Folgende auf leerem Text vakuos durch.
  [ -n "$block" ] || { echo "cmd_rollup_container nicht in scripts/ticket.sh gefunden"; false; }

  # Positiv-Anker 2: der Anlage-Pfad setzt ueberhaupt einen expliziten Status.
  local status_flag
  status_flag=$(printf '%s\n' "$block" | grep -oE '\-\-status[[:space:]]+[a-z_]+' | head -1)
  [ -n "$status_flag" ] || { echo "cmd_rollup_container legt den Container ohne explizites --status an"; false; }

  # Zusicherung: dieser Status ist triage (und damit nicht plan_staged).
  printf '%s' "$status_flag" | grep -q 'triage' \
    || { echo "rollup-container muss den Container als triage anlegen, gefunden: $status_flag"; false; }

  # Der Wiederfinde-Pfad muss plan_staged weiterhin als offenen Status fuehren —
  # sonst legt jeder Lauf neben dem bereits gestagten Container einen neuen an.
  printf '%s\n' "$block" | grep -q "status IN.*plan_staged" \
    || { echo "SELECT im Wiederfinde-Pfad fuehrt plan_staged nicht mehr als offenen Status"; false; }
}

@test "T002407-M6c: ROLLUP_TICKET_TITLE ist definiert" {
  run bash -c "grep -q 'ROLLUP_TICKET_TITLE' \
    '$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go'"
  [ "$status" -eq 0 ]
}

@test "T002407-M6d: SKILL.md verweist auf mishap-rollup.sh statt auto-chore-plan.sh" {
  local skill="$REPO/.claude/skills/mishap-tracker/SKILL.md"
  run grep -q 'mishap-rollup.sh' "$skill"
  [ "$status" -eq 0 ] || { echo "mishap-rollup.sh fehlt in SKILL.md"; false; }
  # Step-3.5-Sektion darf auto-chore-plan nicht mehr im Titel/Lead erwähnen
  run bash -c "grep -A3 'Step 3.5' '$skill' | grep -c 'auto-chore-plan'"
  [ "$output" = "0" ] || { echo "Step 3.5 erwähnt noch auto-chore-plan"; false; }
}
