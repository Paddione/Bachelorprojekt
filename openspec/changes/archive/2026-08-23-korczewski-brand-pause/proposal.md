# Proposal: korczewski-brand-pause

## Why

SA-FC-01 aus `tmp/claude-scratch/system-audit-multi-2026-08-23.md` bestätigt,
dass die korczewski-Brand absichtlich pausiert ist: `flux-korczewski`,
`flux-korczewski-jobs` und `flux-website-korczewski` sind suspendiert. Diese
Entscheidung ist bereits in den Flux-Manifests kommentiert, wird aber im
Audit-Kontext nicht als explizite Ticketentscheidung festgehalten.

Gleichzeitig hängen in `workspace-korczewski` die von
`admin-actions-cleanup` und `admin-actions-prune` erzeugten Jobs seit dem
28./29. Juli mit `active=1`. Die hängenden Job-Objekte bleiben trotz der
bewussten Brand-Pause sichtbar und müssen gezielt bereinigt werden. Damit die
CronJobs während der bewussten Pause keine neuen Läufe erzeugen, dürfen genau
diese beiden CronJobs im Zielnamespace zusätzlich suspendiert werden.

## What

Der Change dokumentiert die bewusste Suspension als Betriebsentscheidung und
legt eine eng begrenzte Bereinigung fest: Zuerst werden ausschließlich die
beiden genannten CronJobs in `workspace-korczewski` suspendiert. Danach werden
aktuelle Jobs ihrer Owner erneut eingelesen; vor jeder Löschung werden
Namespace, CronJob-Owner und `active>0` geprüft. Gelöscht werden ausschließlich
diese verifizierten Jobs. Die Flux-Suspensions und die Suspension des
OCI-Mirrors (`fleet-manifests-gitlab`) bleiben unverändert; der Mirror wird
weder repariert noch entfernt.

_Ticket: T014537_
