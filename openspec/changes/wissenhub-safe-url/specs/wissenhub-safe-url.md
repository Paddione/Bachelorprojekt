## ADDED Requirements

### Requirement: Nur http/https-Links für crawl_config.startUrl

Das WissenHub-Admin SHALL den `crawl_config.startUrl` einer web_crawl-Sammlung nur dann als
klickbaren Link rendern, wenn der Wert eine gültige `http:`- oder `https:`-URL ist. Alle
anderen Werte (`javascript:`, `data:`, unparsebare Strings, non-strings) SHALL als Plain-Text
dargestellt werden und SHALL NOT als `<a href>` gerendert werden.

#### Scenario: Gültige https-URL wird als Link gerendert

- **GIVEN** eine web_crawl-Sammlung mit `crawl_config.startUrl = "https://example.com/docs"`
- **WHEN** die Sammlungszeile im WissenHub-Admin gerendert wird
- **THEN** die Start-URL wird als Anker mit `href="https://example.com/docs"` gerendert
- **AND** der Anker trägt `rel="noopener noreferrer"`

#### Scenario: javascript-Schema wird nicht als Link gerendert

- **GIVEN** eine web_crawl-Sammlung mit `crawl_config.startUrl = "javascript:alert(1)"`
- **WHEN** die Sammlungszeile im WissenHub-Admin gerendert wird
- **THEN** die Start-URL wird nicht als Anker gerendert
- **AND** der Wert wird als Plain-Text angezeigt

### Requirement: http/https-Only in der crawl-config-API

Die crawl-config-API SHALL einen `startUrl` nur persistieren, wenn er eine gültige `http:`-
oder `https:`-URL ist. Andere parsebare Schemata SHALL mit HTTP 400 abgelehnt werden, und der
Wert SHALL NOT persistiert werden.

#### Scenario: API lehnt javascript-Schema ab

- **GIVEN** ein authentifizierter Admin
- **WHEN** ein PATCH an die crawl-config-API mit `startUrl = "javascript:alert(1)"` gesendet wird
- **THEN** die API antwortet mit HTTP 400
- **AND** die crawl_config wird nicht aktualisiert

#### Scenario: API akzeptiert https-URL

- **GIVEN** ein authentifizierter Admin
- **WHEN** ein PATCH an die crawl-config-API mit `startUrl = "https://example.com"` gesendet wird
- **THEN** die API antwortet mit HTTP 200
- **AND** die crawl_config wird mit der Start-URL persistiert
