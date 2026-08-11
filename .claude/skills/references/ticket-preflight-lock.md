# Schritt −1: Pre-Flight — Ticket-Lock & Status (vor allen Git-Operationen) [T002038]

Bevor irgendeine Git-Operation oder Worktree-Erzeugung läuft, MUSS die Session das Ticket als erstes sichern. Dieses frühe Claimen verhindert die Race zwischen dev-flow-execute und der Factory-Pipeline: die Factory PREP prüft `agent-lock.sh check` auf "held" und überspringt das Ticket, wenn eine interaktive Session es bereits claimed hat — ABER nur wenn der Claim VOR dem ersten Factory-Check platziert ist. [T002038-M1]

### Schritt −1.0: Ticket aus dem Branch-Namen oder Kontext ermitteln
Falls `TICKET_ID` noch nicht bekannt ist (steht normalerweise im Branch-Namen oder im Kontext): Query `plan_staged` Tickets aus der DB oder frage den User.

### Schritt −1.1: Ticket-Status aus der DB prüfen (vor dem Claim)
```bash
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID" 2>/dev/null || echo '{}')
TICKET_STATUS=$(echo "$TICKET_JSON" | jq -r '.status // empty')
case "$TICKET_STATUS" in
  done|archived|merged)
    echo "🛑 Ticket $TICKET_ID ist bereits $TICKET_STATUS — kein dev-flow-execute nötig." >&2
    exit 1
    ;;
  in_progress)
    echo "⚠️ Ticket $TICKET_ID ist bereits in_progress. Ein anderes Cluster arbeitet evtl. parallel."
    echo "   Fortsetzung auf eigenes Risiko. Abbruch: exit 1"
    ;;
  plan_staged)
    echo "✅ Ticket $TICKET_ID ist plan_staged — fortfahren."
    ;;
  *)
    echo "⚠️ Ticket $TICKET_ID hat Status '$TICKET_STATUS' — unerwartet, aber nicht blockierend."
    ;;
esac
```

### Schritt −1.2: Branch atomic claimen [T002038-M2, T003102]
Verwendet `claim branch` — bewusst NICHT den ticket-Scope: ein ticket-scoped Lock
der auftraggebenden Session blockt den späteren Abschluss durch Subagent, `ticket-mcp`
und den post-merge-Poller (drei Prozesse desselben Vorgangs, je eigene SID). Der
branch-scoped Claim schützt den Worktree, den die Session betritt, blockt den
Status-Schreibpfad aber nicht. Die Factory sieht ihn über die Ticket-ID im
Branch-Namen (`factory-prep.sh` prüft beide Scopes). Der Ticket-Status-Check in
Schritt −1.1 ersetzt den atomaren Status-Check von `check-and-claim`.
```bash
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
bash scripts/agent-lock.sh claim branch "$CURRENT_BRANCH" --worktree "$(pwd)" --label dev-flow-execute
RET=$?
case $RET in
  0) echo "✅ Branch $CURRENT_BRANCH erfolgreich geclaimed." ;;
  1) echo "🛑 Branch $CURRENT_BRANCH wird bereits von einer anderen Session bearbeitet." >&2
     echo "   → Mit paralleler Session koordinieren:" >&2
     echo "     bash scripts/agent-msg.sh read --mine --unread" >&2
     exit 1 ;;
  2) echo "🛑 Branch $CURRENT_BRANCH bereits geclaimed — Status-Check verweigert." >&2
     exit 1 ;;
esac
```

### Schritt −1.3: Ankündigung broadcasten [T002038-M3]
Poste eine Benachrichtigung an alle Sessions über die Chat-Bridge:
```bash
bash scripts/agent-msg.sh post "dev-flow-execute startet Arbeit an Ticket $TICKET_ID (Branch $CURRENT_BRANCH)" --to all
```
