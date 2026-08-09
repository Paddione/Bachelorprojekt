---
title: Flux-Webhook betriebsbereit machen — eigenes Zertifikat statt Platzhalter
ticket_id: T002869
domains: [infra, ci]
status: active
---

# Flux-Webhook betriebsbereit machen — eigenes Zertifikat statt Platzhalter

## Purpose

Der Sofort-Reconcile per Webhook ist angelegt, aber an drei Stellen unvollständig und deshalb
wirkungslos. Jeder Merge wartet dadurch bis zu zehn Minuten auf das reguläre Poll-Intervall,
statt in Sekunden ausgerollt zu werden. Dieser Change macht die Kette funktionsfähig und sichert
die Stelle ab, an der sie still gerissen ist.

## Symptom vs. Ursache

**Beobachtetes Symptom (Fakt):** Nach einem erfolgreichen Renderer-Lauf am 2026-08-09 zog Flux
das neue Artefakt nicht sofort. Ein erzwungenes `flux reconcile` holte es unmittelbar.

**Zunächst vermutet, dann widerlegt:** „Flux pollt nicht." Falsch — `status.artifact.lastUpdateTime`
ändert sich nur bei einem *neuen* Artefakt, nicht bei jedem Poll. Der alte Wert belegte lediglich,
dass es nichts Neues gab, was zutraf, solange der Renderer rot war. Die Prüfung erfolgte zudem drei
Minuten nach dem Push, also innerhalb des regulären `interval: 10m`.

**Verifizierte Ursache — drei Lücken:**

1. **Die IngressRoute im Cluster trägt unaufgelöste Platzhalter.** `kubectl get ingressroute
   flux-webhook -o jsonpath='{.spec.routes[0].match}'` liefert wörtlich ``Host(`${FLUX_WEBHOOK_HOST}`)``,
   das TLS-Feld wörtlich `${TLS_SECRET_NAME}`. Traefik matcht damit auf einen Hostnamen, der nie
   zutrifft. Der Task `flux:bootstrap` macht es richtig (`envsubst` vor dem Apply) — die Route im
   Cluster wurde also an ihm vorbei per direktem `kubectl apply -f` gesetzt.
2. **Das referenzierte TLS-Secret existiert in `flux-system` nicht.** `workspace-wildcard-tls`
   liegt in `workspace`, `website`, `coturn` und `workspace-office`, nicht in `flux-system`.
3. **Die GitHub-Secrets fehlen.** `gh secret list` kennt weder `FLUX_WEBHOOK_URL` noch
   `FLUX_WEBHOOK_TOKEN`. Der Ping-Step erkennt das selbst und überspringt sich.

Funktionsfähig sind bereits: DNS (`flux-webhook.mentolder.de` löst über den Wildcard auf), der
`Receiver` samt `flux-webhook-token`, und der `notification-controller`-Service.

## Warum es unbemerkt blieb

Jede der drei Lücken ist von außen unsichtbar. Der `Receiver` meldet `READY=True`, weil die
Ressource gültig ist — nicht, weil sie erreichbar wäre. Die IngressRoute existiert, nur eben mit
einem Host, der nie matcht. Und der Ping-Step endet in **jedem** Fall mit `exit 0`:

```bash
if [[ -z "${FLUX_WEBHOOK_URL:-}" ]]; then
  echo "FLUX_WEBHOOK_URL not configured — skipping receiver ping …"
  exit 0
fi
… || { echo "Receiver ping failed (non-fatal) …"; exit 0; }
```

Das ist als „non-fatal" gewollt — der Deploy soll nicht an einer Benachrichtigung scheitern —
macht den Step aber als Signal wertlos. Er ist grün, wenn er pingt, wenn der Ping scheitert und
wenn er gar nicht erst versucht wird.

## Entscheidung

**Ein eigenes Certificate in `flux-system`**, statt das Wildcard-Secret dorthin zu kopieren.

Das Wildcard-Certificate trägt zwar `reflector.v1.emberstack.eu`-Annotationen für eine
automatische Spiegelung — **der Reflector läuft auf dem Cluster jedoch nicht** (kein Pod). Die
vorhandenen Kopien sind manuell entstanden. Eine vierte manuelle Kopie anzulegen hieße, sich an
einen Mechanismus zu hängen, den niemand betreibt; das Zertifikat müsste bei jeder Erneuerung von
Hand nachgezogen werden, und ein Versäumnis bräche den Webhook still — also genau der Fehlermodus,
den dieser Change beseitigt.

Ein eigenes Certificate über den bestehenden `ClusterIssuer letsencrypt-prod` erneuert sich
selbst. Es macht die IngressRoute zugleich unabhängig von `TLS_SECRET_NAME` und reduziert damit
die Platzhalter von zwei auf einen.

Verworfen: **Wildcard-Secret kopieren** (siehe oben). **Reflector installieren** — löste zusätzlich
die drei bestehenden Handkopien, ist aber ein eigener Eingriff mit eigener Prüfung und gehört
nicht in einen Webhook-Fix.

## Änderung

1. **Neu** `flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml` — Certificate für
   `flux-webhook.${PROD_DOMAIN}`, `secretName: flux-webhook-tls`, `issuerRef` auf den bestehenden
   `ClusterIssuer letsencrypt-prod`.
2. **Geändert** `flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml` — `secretName`
   fest auf `flux-webhook-tls`. Damit entfällt `${TLS_SECRET_NAME}`; `${FLUX_WEBHOOK_HOST}` bleibt,
   weil der Host brandabhängig ist.
3. **Geändert** `Taskfile.yml`, Task `flux:bootstrap` — das Certificate wird mitappliziert (mit
   `envsubst` für `PROD_DOMAIN`), und die `envsubst`-Liste der IngressRoute schrumpft auf
   `$FLUX_WEBHOOK_HOST`.

## Guard

`tests/spec/flux-render-security/bootstrap-envsubst.bats`, offline:

1. **Positiv-Anker:** Es gibt im `bootstrap/`-Verzeichnis überhaupt Dateien mit `${…}`-Platzhaltern.
   Ohne ihn wäre die Aussage bei leerer Kandidatenmenge vakuos erfüllt (T002356-M1).
2. **Eigentliche Aussage:** Jeder Platzhalter, der in einer `bootstrap/`-Datei vorkommt, wird im
   `flux:bootstrap`-Task auch an `envsubst` übergeben. Ein Platzhalter ohne zugehörige
   `envsubst`-Variable landet sonst wörtlich im Cluster — exakt der eingetretene Fehler.

Der Guard prüft Repo-Dateien und Taskfile-Text; ein Laufzeit-Output existiert dafür nicht
(CLAUDE.md §Test-Resultats-Konvention, Ausnahme für CI- und Deploy-Konfiguration).

Der Guard fängt die *Wiederholung*, nicht den einmaligen Bedienfehler: Wer `kubectl apply -f`
direkt aufruft, umgeht ihn weiterhin. Das ist bewusst — ein Schutz gegen jede denkbare manuelle
Aktion am Cluster ist mit Repo-Tests nicht zu haben.

## Operative Schritte (nicht Teil des Merges)

Nach dem Merge einmalig auszuführen und im Ticket zu belegen:

1. Certificate und korrigierte IngressRoute applizieren (`task flux:bootstrap ENV=fleet-mentolder`
   oder gezielt die beiden Dateien mit `envsubst`).
2. Warten, bis das Certificate `READY=True` meldet.
3. `FLUX_WEBHOOK_URL` (Host plus `status.webhookPath` des Receivers) und `FLUX_WEBHOOK_TOKEN`
   (aus `flux-webhook-token`) als Repo-Secrets setzen.
4. Wirkungskontrolle: einen Renderer-Lauf auslösen und prüfen, dass die OCIRepository-Revision
   innerhalb von Sekunden folgt statt erst nach bis zu zehn Minuten.

## Restrisiko

Der Webhook-Endpunkt wird öffentlich erreichbar. Der Receiver validiert jede Anfrage über die
HMAC-Signatur `X-Signature` gegen `flux-webhook-token`; ohne gültige Signatur löst er nichts aus.
Ein unsignierter Aufruf kann also keine Reconciliation erzwingen. Die Angriffsfläche beschränkt
sich auf den Endpunkt selbst.

## Nicht im Scope

- Den Reflector installieren und die drei bestehenden manuellen TLS-Kopien ablösen.
- Den Ping-Step strenger machen (er bleibt bewusst `non-fatal`). Sein fehlendes Signal ist
  dokumentiert; ein harter Fehlschlag würde Deploys an einer Benachrichtigung scheitern lassen.
- Der korczewski-Brand. Dessen Webhook-Kette ist hier nicht untersucht.
