# p2 — Erreichbarkeits-Vorbedingung im Dry-Run-Test

## Ziel
Der Client-Dry-Run bleibt, wird aber dort uebersprungen, wo er nicht laufen kann.

## Schritte
1. `kubectl`-Verfuegbarkeit wie bisher pruefen.
2. Neu: `kubectl version --request-timeout=3s >/dev/null 2>&1 || skip 'kein
   Kubernetes-API-Server erreichbar'` — mit Begruendung `[T900505]`.
3. **Kein** pauschales `skip` und **kein** Loeschen des Tests.
4. `bash -n` auf der Bats-Datei.

## Fertig, wenn
Dry-Run-Anweisung noch vorhanden, Erreichbarkeits-`skip` vorhanden, kein pauschales
`skip 'kein Cluster'`.
