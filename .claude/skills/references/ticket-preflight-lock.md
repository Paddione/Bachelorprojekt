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

### Schritt −1.2: Ticket atomic claimen (check-and-claim) [T002038-M2]
Verwendet das `check-and-claim` Kommando, das atomisch prüft (kein TOCTOU) und den Claim setzt:
```bash
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
bash scripts/agent-lock.sh check-and-claim ticket "$TICKET_ID" \
  --branch "$CURRENT_BRANCH" \
  --label dev-flow-execute
RET=$?
case $RET in
  0) echo "✅ Ticket $TICKET_ID erfolgreich geclaimed." ;;
  1) echo "🛑 Ticket $TICKET_ID wird bereits von einer anderen Session bearbeitet." >&2
     echo "   → Mit paralleler Session koordinieren:" >&2
     echo "     bash scripts/agent-msg.sh read --mine --unread" >&2
     exit 1 ;;
  2) echo "🛑 Ticket $TICKET_ID ist bereits done/merged — Status-Check verweigert Claim." >&2
     exit 1 ;;
esac
```

### Schritt −1.3: Ankündigung broadcasten [T002038-M3]
Poste eine Benachrichtigung an alle Sessions über die Chat-Bridge:
```bash
bash scripts/agent-msg.sh post "dev-flow-execute startet Arbeit an Ticket $TICKET_ID (Branch $CURRENT_BRANCH)" --to all
```
