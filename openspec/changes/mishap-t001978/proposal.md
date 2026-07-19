# Proposal: mishap-t001978

## Why

qwen35-iq4 empty subagent output ist das 3. Mal in 3 Sessions reproduziert
worden (T001961, T001962, T001969 inkl. aktueller ticket-ops session
2026-07-19). T001969 hat den Timeout-Default bereits von 15 min auf 25 min
erhöht (PR #2974), aber das adressiert nicht die Root Cause: das Modell
liefert bei langen/komplexen Prompts leeren Output, vermutlich wegen
Token-Truncation oder Model-Glitch.

## What

`background-agents.ts` um eine **Empty-Output-Detection + automatischen
Fallback-Retry** mit `qwen35-hq` erweitern. Wenn `qwen35-iq4` mit leerem
Output returned, wird einmal automatisch mit `qwen35-hq` (höhere
Kontext-Toleranz) wiederholt. Erst wenn auch der Fallback leer zurückgibt,
gilt die Delegation als fehlgeschlagen.

_Ticket: T001978_
