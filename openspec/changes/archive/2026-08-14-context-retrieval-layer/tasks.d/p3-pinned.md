# p3 — Pinned-Set laden

**Rolle:** impl · **Dateien:** `scripts/knowledge/lib-context-pinned.mjs`

Pures Modul, neue Datei, `.mjs`-Limit 800 Zeilen, veranschlagt rund 250.

## Warum ein Pinned-Set

Relevanz-Ranking und Sicherheitsrelevanz sind unkorreliert. Ein Hinweis wie „`prod-fleet/*`
verwenden, nie bares `prod/`" ist zu keiner einzelnen Aufgabe besonders ähnlich — er ist zu
allen relevant. Ein reiner Similarity-Ranker rankt ihn systematisch weg, **gerade weil** er
allgemein formuliert ist. Genau der Kontext, der nie fehlen darf, ist der, den Retrieval als
erstes verliert.

Ein Score-Bonus verschiebt diese Grenze nur und gibt keine prüfbare Garantie: bei einem eng
passenden Korpus reicht der Bonus nicht, und der Block sieht trotzdem gefüllt aus. Ein separates
Budget macht die Garantie als Test formulierbar.

## Exportierte Funktionen

1. **`loadPinned(role)`** liest `docs/agent-guide/registry/guardrails.yaml` sowie die Einträge mit
   `tier: caution` oder `tier: danger` aus `docs/agent-guide/registry/capabilities.yaml`,
   gefiltert auf die übergebene Rolle einschliesslich `roles: [all]`.

2. Die **Rollen-Allowlist wird nicht dupliziert**, sondern aus derselben Quelle gelesen, die
   `scripts/toolset-context.sh` verwendet. Eine unbekannte Rolle führt zu einem **Fehler**, nicht
   zu einem stillen Rückfall auf „alle" — `scripts/plan-context.sh` zeigt in T002322, wohin der
   stille Fallback führt: der Filter wirkt nicht und niemand bemerkt es.

3. **`renderPinned(entries)`** erzeugt den Pinned-Block. Sein Umfang wird gegen `--budget` **nicht**
   verrechnet und in der Bilanz separat als `pinned` ausgewiesen.

## Fertig wenn

`loadPinned('bachelorprojekt-infra')` liefert die Guardrail-Einträge dieser Rolle;
`loadPinned('<unbekannt>')` wirft. Der Nachweis läuft über p6.
