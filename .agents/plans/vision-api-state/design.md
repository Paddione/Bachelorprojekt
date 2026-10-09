---
title: Vision-State Snapshot Adapter
ticket_id: T901677
---
# Design

`tests/e2e/agent/read-state.mjs` exportiert `async readState(page, flow, base)`. Das Modul importiert weder Runner noch Playwright, sondern nutzt ausschließlich die übergebene Page-Schnittstelle. URL und Body-Text bleiben wie bisher; ohne apiEquals in `flow.goal_checks ?? flow.checks` erfolgt kein Request. `readState(page)` bleibt für lokale assert-Aktionen zulässig.

Mit apiEquals muss die aktuelle Page-Origin der konfigurierten Base-Origin entsprechen. Fremde Origin oder Auth-Redirect ist ein Fehler, auch wenn der Start-URL einen Raum enthält. Raum zuerst aus dem aktuellen `room`-Query-Parameter lesen. Nur bei fehlendem Raum die Start-URL relativ zur Base auflösen und ebenfalls ihre Origin prüfen. Leerer/fehlender Raum scheitert vor dem Request.

GET über `page.context().request.get` auf `${baseOrigin}/api/sessions/${encodeURIComponent(room)}/snapshot`, Timeout höchstens 10000 ms, `maxRedirects: 0`. So werden Cookies aus dem authentifizierten Kontext genutzt und weder Cookies noch Request an eine fremde Origin weitergeleitet. Nicht-2xx, Redirect, abweichende Response-URL, ungültiges JSON oder falsches Format werden als verständliche Error geworfen. Erwartete Hülle: nicht-null Objekt, `state` nicht-null Objekt und kein Array, `recordedAt` nichtleerer String. Volle Hülle als apiState weitergeben; das unveränderte Oracle liest `state.figures`.

Am finalen Oracle-Aufruf übergibt Runner `readState(page, flow, BASE)`. Entfernen der lokalen Implementierung verkleinert Runner; Fehler erreichen den bestehenden catch, setzen rec.error, behalten pass=false und oracle=null. Keine stille Rückgabe leerer API-Daten. Keine Anpassung der Figuren-Erwartungen oder Trainingsergebnisse.

pytest startet kleine Node-Probes mit Fake-Page/Fake-APIResponse: erfolgreiches Oracle, Authfehler, malformed JSON, fehlerhafte Hülle, fehlender Raum, Origin-Schutz, Auth-Redirect, Encoding, Current-Room-Priorität, Start-Room-Fallback und keine Requests bei Textprüfungen. Integration führt die tatsächliche runFlow-Funktion mit kontrollierten Browser/Modell-Grenzen aus und prüft Argumentübergabe sowie Fehlerbericht. Keine Browser- oder Dienstabhängigkeit; Node-Verfügbarkeit wird schon in RED geprüft.
