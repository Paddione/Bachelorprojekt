# Proposal: flux-webhook-tls

## Why

Der Sofort-Reconcile per Webhook ist angelegt, aber an drei Stellen unvollständig und deshalb
wirkungslos. Jeder Merge wartet dadurch bis zu zehn Minuten auf das reguläre Poll-Intervall.

Die drei Lücken, alle am 2026-08-09 verifiziert:

1. Die IngressRoute im Cluster trägt die **unaufgelösten** Platzhalter `${FLUX_WEBHOOK_HOST}` und
   `${TLS_SECRET_NAME}`. Traefik matcht auf einen Hostnamen, der nie zutrifft. Der Task
   `flux:bootstrap` macht es korrekt — die Route wurde an ihm vorbei appliziert.
2. Das referenzierte TLS-Secret existiert in `flux-system` nicht.
3. `FLUX_WEBHOOK_URL` und `FLUX_WEBHOOK_TOKEN` fehlen als Repo-Secrets, worauf der Ping-Step sich
   selbst überspringt.

Keine der drei Lücken ist von außen sichtbar: der Receiver meldet `READY=True`, die IngressRoute
existiert, und der Ping-Step endet in jedem Fall mit `exit 0` — er ist grün, ob er pingt, scheitert
oder es gar nicht erst versucht.

## What

Der Webhook bekommt ein **eigenes cert-manager-Certificate** in `flux-system`
(`flux-webhook-tls`, über den bestehenden `ClusterIssuer letsencrypt-prod`), statt das
Wildcard-Secret dorthin zu kopieren. Grund: die Reflector-Annotationen am Wildcard-Certificate
sind wirkungslos, weil der Reflector auf dem Cluster nicht läuft — eine Kopie müsste bei jeder
Erneuerung von Hand nachgezogen werden und bräche sonst still.

Die IngressRoute verweist fest auf dieses Secret, wodurch ein Platzhalter entfällt. Der
`flux:bootstrap`-Task appliziert das Certificate mit. Ein Guard
(`tests/spec/flux-render-security/bootstrap-envsubst.bats`) stellt sicher, dass jeder Platzhalter
im `bootstrap/`-Verzeichnis auch an `envsubst` übergeben wird — ein ungedeckter landet sonst
wörtlich im Cluster.

Nicht im Scope: den Reflector installieren und die drei bestehenden manuellen TLS-Kopien ablösen;
den Ping-Step strenger machen (bleibt bewusst `non-fatal`); der korczewski-Brand.

_Ticket: T002869_
