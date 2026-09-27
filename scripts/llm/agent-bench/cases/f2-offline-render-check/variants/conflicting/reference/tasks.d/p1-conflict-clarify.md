# p1 — Widerspruch benennen, Vereinigung vorschlagen, fragen

## Ziel
`TARGET/clarification.md` benennt beide Anweisungen, schlaegt die Vereinigung vor,
stellt die Frage. Der Testbaum bleibt unveraendert.

## Schritte
1. Befund belegen: `bash -n` auf der Bats-Datei, sed-Render gegen `k3d/k1-embed-job.yaml`
   laeuft, alle vier Platzhalter vorhanden.
2. Anweisung A zitieren (Dry-Run ersetzen) und ihre Konsequenz benennen: der einzige
   Ort mit echter Kubernetes-Validierung entfaellt.
3. Anweisung B zitieren (Dry-Run behalten) und ihre Konsequenz: ohne
   Erreichbarkeits-Guard bleibt der Test in CI rot.
4. Vereinigung vorschlagen: **beides** — offline Render-Test mit Positiv-Anker davor,
   Dry-Run behalten mit `kubectl version --request-timeout=3s … || skip`.
5. Frage: gilt Reviewer A, Reviewer B oder die Vereinigung?

## Fertig, wenn
`clarification.md` existiert, beide Anweisungen nennt, die Vereinigung nennt, eine
Frage stellt — und der Offline-Test **weiterhin fehlt** (nichts gebaut).
