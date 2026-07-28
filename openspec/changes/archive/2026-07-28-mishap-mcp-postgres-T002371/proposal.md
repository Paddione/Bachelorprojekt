# Proposal: mishap-mcp-postgres-T002371

## Why

Ein `kubectl port-forward` zu `workspace/shared-db` (svc) liefert korrupte Daten: Beim
MCP-Read-Tool `mcp__mcp-postgres__query` wurde eine Zeile mit falscher `external_id`
zurückgegeben (T002358 statt T002367). Das daraufhin gesetzte UPDATE-Flag landete auf einer
nicht existierenden ID — der Write meldete Erfolg (weil `0 rows affected` vom MCP-Tool nicht
als Fehler erkannt wird), traf aber nichts.

Die Ursache liegt im instabilen `kubectl port-forward` zur shared-db — die Read-Session kann
unter Last Daten aus benachbarten Verbindungen mischen. Das MCP-Read-Tool ist nicht
reparierbar, solange es auf Port-Forward aufsetzt.

## What

Der Change dokumentiert die Port-Forward-Instabilität als dauerhafte architektonische Grenze
und setzt drei Schutzmaßnahmen um:

1. **Read-Integritäts-Guard (`scripts/verify-ticket-id.sh`):** Ein neues Skript, das vor
   jedem Write auf Basis eines port-forward-basierten Reads die gelesene `external_id` gegen
   eine zweite Quelle (direkter `kubectl exec … psql`) verifiziert. Exit 0 = gefunden, Exit 1
   = nicht gefunden (Write-Abbruch). Nur über `kubectl exec` (kein Port-Forward).

2. **Gegenprüfungs-Regel in `mcp-tool-guide.md`:** Die bestehende "Gegenprüfung"-Regel (Ein
   Read, dessen Ergebnis eine Write-Operation steuert, wird gegengeprüft) wird um den
   konkreten Skript-Aufruf ergänzt.

3. **`--field-selector`-Lücke in `scripts/ticket-attach.sh`:** Dieses Skript filtert den
   shared-db-Pod noch nicht auf `status.phase=Running`, kann also einen completed Pod
   erwischen. Obwohl dieser Eintrag nicht direkt mit dem Mishap korrespondiert (der Fehler
   liegt im Port-Forward, nicht in der Pod-Selektion), wird er im selben Zug behoben, da
   der identische Bug-Typ (`kubectl get pod` ohne Phasen-Filter) in T002386 nachweislich
   die gesamte korczewski-Brand lahmgelegt hat.

4. **Status-Transition-Guard in `scripts/vda/ticket/update-status.sh`:** Die
   `-c`-Flag-Übergabe an `psql` wurde durch einen Heredoc ersetzt, der die
   Port-Forward-Instabilität umgeht (der gesamte Befehl läuft über `kubectl exec`). Zusätzlich
   schützt eine Prüfung vor Terminal→Nicht-Terminal-Übergängen (`done`→`archived` erlaubt,
   `done`→alles andere verboten), die auf der Gegenprüfung der gelesenen ID aufsetzt.

_Ticket: T002371 — Mishap-Bundle: infra/mcp-postgres (1 Eintrag)_
