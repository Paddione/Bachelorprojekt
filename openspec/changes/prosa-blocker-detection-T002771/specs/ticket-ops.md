# Delta: ticket-ops
## ADDED: Prosa-Blocker-Erkennung in Phase 1
Die Completeness Triage MUSS Ticket-Beschreibungen auf Schlüsselwörter wie
"BLOCKIERT VON", "hängt an" scannen und gefundene Referenzen in `depends_on`
überführen. Bereits gemergte PRs werden als aufgelöster Blocker erkannt.
