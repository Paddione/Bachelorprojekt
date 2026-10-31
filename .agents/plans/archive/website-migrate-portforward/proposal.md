# website-migrate-portforward — Proposal (T901789)

## WARUM

Seit PR #6504 (T901750) ist jeder post-merge-Lauf rot: `website:migrate`
stirbt, weil der Port-Forward im Runner sofort und lautlos endet. Der
Fail-Closed-Guard tut seine Pflicht (keine blinde Migration), aber er
meldet nur den Tod, nicht die Ursache — jeder Merge endet im Blindflug.
Offen ist zusätzlich, ob post-merge der einzige Prod-Migrate-Weg ist; falls
ja, läuft seit #6504 keine einzige Prod-Migration mehr.

## WAS

- Diagnose-Härtung im Task: Exit-Code, kubectl-Version, Service-Auflösung
  und markierte PF-Log-Ausgabe bei jedem Forward-Tod (Fail-Closed bleibt).
- Befund-gestützter Forward-Fix nach lokaler Ursachen-Repro gegen fleet.
- Inventar aller Prod-Migrate-Wege + Gap-Prüfung seit #6504, Ergebnis ans
  Ticket; Eskalationspfad, falls post-merge der einzige Weg ist.
- Regressionsschutz: Stub-Harness, der den Runner-Vorfall hermetisch
  nachspielt (liegt als RED-Test im Branch).
