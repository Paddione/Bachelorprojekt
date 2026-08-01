---
title: "cockpit-auth-schnitt — Entwurfsentscheidung"
ticket_id: T002463
domains: [cockpit, website, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002458
depends_on_plans: []
---

# cockpit-auth-schnitt — Entwurfsentscheidung

_Ticket: T002463 (K4) · betrifft zusätzlich T002465 (K6)_

## Was dieser Change ist — und was nicht

Er trägt eine **Entscheidung**, keine Implementierung. Kein Code, keine Tests,
keine Dateien. Er hält fest, wie die Auth-Frage von K4 und K6 aufgelöst wird,
damit beide Kinder planbar werden; die Umsetzung erfolgt in ihren eigenen
Plänen.

Er bleibt bis dahin **offen**, nicht archiviert: nur so liest `plan-context.sh`
ihn und injiziert die Entscheidung in den Kontext jedes Agenten, der an K4 oder
K6 arbeitet. Archiviert wird er, wenn K4 umgesetzt ist — dann wandert das Delta
in die SSOT `openspec/specs/sdlc-cockpit.md`.

## Die Entscheidung in drei Sätzen

1. Schreibaktionen, die im Cluster laufen können (Ticket-Status, PR mergen),
   laufen über die **bestehende** Admin-Auth der Website. Kein neuer Mechanismus.
2. Schreibaktionen, die nur lokal laufen können (Agent killen, Worktree
   entfernen, Lock brechen, Terminal), bleiben vorerst der Kommandozeile
   vorbehalten. Nicht aus Schwierigkeit, sondern weil es keinen Netzwerkweg vom
   Cluster zu einem Entwicklerrechner gibt.
3. Brain wird **cluster-intern** gelesen, nicht durch den `oauth2-proxy` und
   nicht vom lokalen Daemon.

Begründung und Belege: siehe `proposal.md`. Die verbindlichen Zusagen stehen in
`specs/sdlc-cockpit.md`.

## Folgeschritte in den Kind-Tickets

**K4 (T002463)** — setzt Klasse A um:

- Website-API für die cluster-seitigen Schreibaktionen, Muster
  `admin/cockpit/feature-action.ts` (Session → `isAdmin` → sonst `403`)
- Bestätigungsabstufung nach Umkehrbarkeit (D5/D6) und mobile Sonderregel
- Audit-Log als Strom-Panel
- Aktions-Slot mit den vier Zuständen (D4)
- Entscheidung über die beiden Daemon-Write-Stubs: entfernen oder für Klasse B
  reservieren

**K6 (T002465)** — setzt die Brain-Anbindung um:

- Website-API liest `brain.workspace.svc.cluster.local`, erzwingt `isAdmin`
- Kontext-Slot der Panels mit Brain-Verweisen füllen
- **Vorbedingung:** der interne Weg ist heute nicht durchgängig (Egress erlaubt,
  Verbindung scheitert dennoch — Port 80 „refused", 8787 Timeout, Pod läuft).
  Ursache cluster-seitig klären, bevor K6 dispatched wird.

**K7-Nachtrag (T002466, bereits gemergt)** — der offene Punkt 4 bekommt hiermit
seine Antwort: der Adapter löst seine Basis-Adresse aus dem Host-Kontext auf,
statt `http://127.0.0.1:49152` fest zu verdrahten. Umzusetzen mit K4.

## Verify

Dieser Change hat keinen Code und deshalb keinen RED→GREEN-Schritt. Prüfbar ist
allein die Konsistenz des Dokuments:

```bash
bash scripts/openspec.sh validate   # das fail-closed CI-Gate — muss OK sein
```

> **`plan-lint.sh` ist auf diesen Change NICHT anwendbar** und meldet
> erwartungsgemäß `STRUCT1/2/3`. Der Linter prüft *Implementierungspläne* auf
> File Structure, einen Failing-Test-Step und die drei CI-Gates — alles Dinge,
> die ein Entwurf ohne Code nicht haben kann. Ihn hier trotzdem zu fordern,
> hieße die Struktur pro forma zu füllen und ein grünes Ergebnis ohne
> Gegenstand zu erzeugen. Auf `main` liegen mindestens acht weitere Changes
> ohne `File Structure`; das CI-Gate ist `openspec validate`, nicht plan-lint.

Die Zusagen aus `specs/sdlc-cockpit.md` werden dort getestet, wo sie umgesetzt
werden — in K4 und K6.
