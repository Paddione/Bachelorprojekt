# Proposal: plan-qa-livez-probe

## Why

`scripts/plan-qa-check.sh` prüft die Erreichbarkeit des llm-proxy mit `curl -sf … /health`.
`/health` ist jedoch **Readiness**, nicht **Liveness**: der Proxy antwortet mit 503, sobald ein
Prio-1-Backend fehlt. Wegen `-f` wertet curl den 503 als Fehlschlag, und die advisory Plan-QA
überspringt sich selbst mit der Meldung „Gateway not reachable".

Gemessen am 2026-08-09 auf dem lokalen Host:

| Pfad | Antwort |
|---|---|
| `/livez` | 200 |
| `/health` | 503, Body `{"status":"degraded","ready":false,…}` |
| `/v1/models` | 200, drei Loadouts gelistet |

Der Proxy lief also, die systemd-Unit war aktiv, und die API antwortete — die Probe meldete
trotzdem „nicht erreichbar". Die Diagnose weist damit in die falsche Richtung: sie legt nahe,
den Dienst zu starten, obwohl er läuft.

Dieselbe Verwechslung war in `taskfiles/Taskfile.llm.yml` für `proxy:start` und `proxy:status`
bereits aufgetreten und wurde unter T002336 behoben, dort mit dem Kommentar „livez, NICHT
health — hier geht es um Port-Belegung, nicht um Bedienbarkeit". `plan-qa-check.sh` hat diese
Lehre nicht mitbekommen.

Der Effekt bleibt unauffällig, weil die QA advisory ist und nie bricht: sie läuft im
Normalbetrieb praktisch nie, ohne dass es jemandem auffällt.

## What

`scripts/plan-qa-check.sh` prüft die Erreichbarkeit künftig gegen `/livez` statt `/health`.
Ein BATS-Nachweis hält fest, dass ein lebender Proxy mit degradierter Readiness nicht mehr als
„not reachable" gemeldet wird.

**Bewusst nicht enthalten:** die nachgelagerte Modell-Verfügbarkeit. Ist das QA-Modell durch
einen `exclusive_conflict` blockiert, antwortet der Proxy mit HTTP 409 und nennt im Body den
nötigen Stop-Befehl; das bestehende Skript gibt diesen Body bereits aus. Nach dieser Änderung
lautet die Meldung also „Gateway returned HTTP 409: {exclusive_conflict …}" statt „not
reachable" — eine ehrliche, handlungsleitende Diagnose. Die QA in diesem Zustand automatisch
durchlaufen zu lassen (Modell-Fallback) wäre eine Verhaltensänderung an der Prüfqualität und
gehört in einen eigenen Vorgang.

Der Anlass des Guards bleibt gewahrt: `-f` wurde unter T002595 gesetzt, damit ein 503 nicht als
Erfolg durchgeht und der Fehler erst im POST auffällt. Gegen `/livez` behält `-f` genau diese
Wirkung — es unterscheidet weiterhin „Prozess antwortet" von „niemand da", nur eben ohne die
Readiness eines einzelnen Backends mit der Erreichbarkeit des Proxys zu verwechseln.

_Ticket: T002641_
