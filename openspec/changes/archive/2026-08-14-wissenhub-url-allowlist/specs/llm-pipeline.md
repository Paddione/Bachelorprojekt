# llm-pipeline — Delta-Spec

## Purpose

Sicherheits-Hardening des Wissensquellen-Webcrawl-Config: `crawl_config.startUrl` wird
client- und serverseitig auf das http(s)-Schema beschränkt, damit ein `javascript:`-Wert
weder als Link-Href im Admin-Panel gerendert noch als gültige Start-URL gespeichert werden
kann (T005901, Security-Review-Befund vom 2026-08-14).

## ADDED Requirements

### Requirement: startUrl-Schema-Allowlist (http/https)

`crawl_config.startUrl` muss ein http(s)-URL-Schema tragen. Der PATCH-Endpoint
`/api/admin/knowledge/collections/<id>/crawl-config` lehnt Werte mit anderem Schema mit
HTTP 400 ab; die Admin-UI rendert einen `startUrl`-Wert nur bei http(s)-Schema als Link.

#### Scenario: javascript:-startUrl wird mit 400 abgelehnt

**GIVEN** ein Admin-Benutzer sendet einen PATCH auf
`/api/admin/knowledge/collections/<id>/crawl-config` mit `startUrl: 'javascript:alert(1)'`
**WHEN** der Endpoint die Konfiguration validiert
**THEN** antwortet er mit HTTP 400 und speichert den Wert nicht.

#### Scenario: gültige https-startUrl wird akzeptiert

**GIVEN** ein Admin-Benutzer sendet einen PATCH mit `startUrl: 'https://mentolder.de/docs'`
**WHEN** der Endpoint die Konfiguration validiert
**THEN** antwortet er mit HTTP 200 und speichert die Konfiguration.

#### Scenario: Admin-Panel rendert unsicheres Schema nicht als Link

**GIVEN** eine Collection mit `source: 'web_crawl'` und
`crawl_config.startUrl: 'javascript:alert(1)'`
**WHEN** die Admin-UI die Sammlungsliste rendert
**THEN** wird der Wert als Text ohne `<a href>` dargestellt, während ein `https:`-Wert
weiterhin als Link gerendert wird.
