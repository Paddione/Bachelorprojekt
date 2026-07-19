---
ticket_id: T001996
plan_ref: openspec/changes/pocket-id-seed-pagination/tasks.md
status: active
date: 2026-07-19
---

# pocket-id-client-seed: Pagination-Fix für find_client_id()

## Root Cause

`find_client_id()` in `k3d/pocket-id-client-seed.yaml` ruft `GET /api/oidc/clients` ohne
Pagination-Parameter ab. Pocket-ID v2.9.0 paginiert diese Antwort serverseitig mit einem
**hart gedeckelten** `itemsPerPage=20` (live verifiziert — `pagination[itemsPerPage]=100`
in der Query wird vom Server ignoriert, es bleiben immer 20 Items pro Seite; nur
`pagination[page]` wird respektiert und liefert unterschiedliche Daten je Seite).

Sobald eine Brand mehr als 20 `oidc_clients`-Zeilen ansammelt (z.B. durch wiederholte
fehlgeschlagene Seed-Läufe, siehe T001992), sieht `find_client_id()` nur noch Seite 1 und
findet für Clients, deren Zeile durch Duplikate auf Seite 2+ verdrängt wurde, keine
existierende ID mehr — der Job legt dann per POST eine **neue** Zeile mit neu generiertem
Secret an, das zwar zurück ins `workspace-secrets`-Secret geschrieben wird, aber die von
oauth2-proxy/der App tatsächlich referenzierte (ursprüngliche, meist `id==name`) Zeile
bleibt mit dem alten Secret zurück → Login bricht, und der nächste Lauf erzeugt eine
weitere Zombie-Zeile. Live beobachtet auf `workspace-korczewski`: 131 `oidc_clients`-Zeilen
(erwartet: ~19), 45 davon nachweislich Zombies (T001992-Nachtrag).

## Fix-Ansatz

`find_client_id()` iteriert über `pagination[page]=1..totalPages` (aus der Response
gelesen), bis die gesuchte `name` gefunden wird oder die letzte Seite ohne Treffer
durchsucht ist. Kein Versuch, `itemsPerPage` zu erhöhen (serverseitig ignoriert, siehe
oben) — die Schleife ist der einzige robuste Weg mit der vorhandenen v2.9.0-API.

## Edge Cases

- `totalPages` fehlt in der Response (z.B. leere Clientliste) → Schleife bricht nach
  Seite 1 ohne Treffer ab (bestehendes Verhalten: leerer Rückgabewert = "nicht gefunden").
- Name kommt auf einer späteren Seite vor, als es vorher je gesehen wurde → wird jetzt
  gefunden statt fälschlich neu angelegt zu werden.
- Sehr viele Seiten (>20 Zombie-Ansammlung wie bei T001992) → mehr HTTP-Roundtrips pro
  Client, aber Job läuft nicht mehr in einer Kubernetes-CronJob-Deadline-Größenordnung,
  die das relevant macht (19 Clients × wenige Seiten).

## Nicht im Scope

- Der Early-Abort-bei-401-Guard (verhindert die *Entstehung* von Zombie-Zeilen) ist
  T001995 — eigenes, unabhängiges Ticket.
- Die bereits bestehenden 45 Zombie-Zeilen auf korczewski wurden bereits live bereinigt
  (T001992). `recovery`/`session-hub` (43 Zeilen ohne identifizierbaren Live-Consumer)
  bleiben als offener Punkt in T001996 dokumentiert, unabhängig von diesem Pagination-Fix.
