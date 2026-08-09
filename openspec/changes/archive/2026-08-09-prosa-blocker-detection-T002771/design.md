# T002771: Prosa-Blocker in depends_on überführen

## Problem

Tickets mit Blockern als Fließtext ("BLOCKIERT VON: PR #3745 (T002587)...") in der
Beschreibung haben keine `depends_on`-Einträge. Der Blocker bleibt auch nach Merge der
referenzierten PR bestehen — es gibt keinen Mechanismus, der Prosa-Blocker automatisch
auflöst.

Beobachtet an T002629: PR #3745 war seit 5 Tagen gemergt, das Ticket stand immer noch
mit DoR 0/4, weil `depends_on` NULL war und niemand die volle Beschreibung las.

## Fix

In `ticket-ops` Phase 1 (Completeness Triage): Nach dem Lesen der Beschreibung auf
Schlüsselwörter prüfen (`BLOCKIERT VON`, `hängt an`, `ABHÄNGT VON`) und gefundene
PR-/Ticket-Referenzen in `depends_on` überführen. Genannte PRs gegen Merge-Status prüfen
und bei bereits gemergten PRs den Blocker als aufgelöst markieren.
