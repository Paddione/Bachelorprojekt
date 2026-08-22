# Design: e2e-suite-entskippen

## Goals

1. Ein grüner Nightly bedeutet wieder etwas: jeder Test, der im Nightly läuft, kann dort auch
   grün werden.
2. Jeder verbleibende Skip hat einen im Report sichtbaren Grund.
3. Kein Test verschwindet stillschweigend — Löschung, Verschiebung und Reaktivierung sind
   nachvollziehbar zugeordnet.

## Non-Goals

- Die datenabhängigen Skips (~65) reparieren.
- Neue Testabdeckung schaffen.
- Die Playwright-Projektstruktur umbauen. Die bestehenden Projekte (`website`, `mentolder`,
  `services`, `brett-*`, `smoke`, `ios`, `android`) bleiben, wie sie sind.

## Decisions

### D1 — Gruppen-Modifier werden pro Test gesetzt, nicht pro Datei

Die zwölf Zeilen aus F2 werden entfernt. Die Teiltests, die sie eigentlich meinten, tragen ihren
Modifier künftig an ihrem eigenen `test()`.

**Warum nicht die Zeile einfach löschen:** Die Information, dass etwa T4–T5 von `nfa-08`
kubectl-Zugriff brauchen, ist richtig und soll erhalten bleiben. Falsch ist nur ihr
Geltungsbereich. Wo der gemeinte Teiltest gar nicht als `test()` existiert — bei `nfa-08`
beschreibt die Zeile Arbeit, die nie implementiert wurde — entfällt sie ersatzlos, weil ein
Modifier ohne zugehörigen Test nichts markiert.

**Trade-off:** Danach laufen ~23 Tests wieder, die seit Monaten stillstanden. Einige davon
werden beim ersten Lauf rot sein. Das ist beabsichtigt und der Zweck des Change — ein
Testergebnis, das man vorher nicht kannte, ist der Gewinn, nicht das Problem. Rote Tests aus
dieser Gruppe werden als eigene Bug-Tickets erfasst (Bug-Triage-Konvention, G-DORA03), nicht
durch erneutes Skippen stillgelegt.

### D2 — Ein Guard, der immer greift, gehört nicht in den Nightly

`guardSdlc` bleibt bestehen, wechselt aber den Ort: Die 14 Specs, die daran hängen, werden aus
den Nightly-Projekten in einen eigenen Projekteintrag in `playwright.local.config.ts` verschoben.

Zusätzlich wird der Guard fail-loud statt fail-silent: Läuft er lokal gegen eine Instanz, die die
SDLC-Routen haben sollte, und findet sie nicht, ist das ein Fehler, kein Skip. Das folgt der im
SSOT-Spec bereits verankerten Linie („Brett auth setups are explicitly unsupported, not silently
empty").

**Warum nicht löschen:** Die SDLC-Cockpit-Tests prüfen real existierende Funktionalität — sie
existiert nur nicht im Prod-Build. Gegen eine Dev-Instanz sind sie wertvoll.

### D3 — Repo-Asserts werden entfernt, ihre E2E-Anteile umgeschrieben

Die Datei-Asserts aus F4 werden gelöscht. Wo dieselbe Datei daneben echte E2E-Prüfungen enthält,
werden diese in die thematisch zuständige Spec überführt statt mitgelöscht:

| Quelle | Anteil | Ziel |
|---|---|---|
| `nfa-08`, `nfa-09` | vollständig Repo-Assert | Datei entfällt |
| `ak-04` | 5 Repo-Asserts | entfallen |
| `ak-04` | T5a/T5b (Google Fonts, Analytics) | Dublette zu `nfa-01` — entfällt, `nfa-01` deckt es ab |
| `nfa-07` | 2 Repo-Asserts | entfallen |
| `nfa-07` | „Website gibt keine proprietären Lizenzhinweise aus" | bleibt in `nfa-07` |
| `ak-03` | 5 Erreichbarkeitstests, keine Repo-Asserts | Dubletten zu `nfa-03` — zusammengeführt |

**Warum die Dubletten zusammenführen statt beide zu behalten:** `ak-03` und `nfa-03` prüfen
wortgleich dieselben drei Hosts. Zwei Reports für denselben Sachverhalt kosten Laufzeit und
erzeugen bei einem Ausfall zwei Fehlermeldungen für einen Defekt.

**Warum die Repo-Asserts nicht nach BATS wandern:** Sie sind nicht bloß am falschen Ort, sie sind
falsch — der Pfad zeigt neben das Repo. Ein Test, der nie etwas geprüft hat, wird nicht durch
Umzug wertvoll. Was von ihnen inhaltlich gebraucht wird (Existenz von `prod/`, `k3d/`), deckt der
bestehende Kustomize-Strukturtest in `task test:all` bereits ab.

### D4 — Runner-Auth folgt dem etablierten Muster, nicht einem neuen

Drei Auth-Domänen, die im Repo bereits klar getrennt sind:

```
CRON_SECRET ────────► Website-Backend (X-Cron-Secret, Token für e2e-login)
                      Im Matrix-Job gesetzt. Funktioniert.

FLEET_KUBECONFIG ───► kubectl → pocket-id one-time-access-token → OIDC-Session
                      Für alles hinter oauth2-proxy: Brett, Nextcloud.
                      In sso-e2e (e2e.yml:288) und fünf weiteren Workflows
                      in Gebrauch. Fehlt im Matrix-Job.

LLM_ROUTER_URL ─────► kein Auth. Netzwerkerreichbarkeit im wg-mesh.
```

Der Matrix-Job bekommt `FLEET_KUBECONFIG` nach demselben Muster wie `sso-e2e`: kubectl
installieren, Kubeconfig aus dem Secret schreiben, `chmod 600`. Fehlt das Secret, bleibt das
bisherige Verhalten (fail-closed `fixme`) unverändert — der Lauf degradiert sichtbar, statt
falsch grün zu werden.

**Warum nicht CRON_SECRET für Brett:** Brett steht hinter oauth2-proxy und wertet OIDC-Claims
(`leiter`, `beobachter`, `isAdmin`) aus. Ein Service-Secret transportiert keine Rolle und keine
Identität; die Brett-Tests prüfen aber genau rollenabhängiges Verhalten.

**Warum die LLM-Specs kein Secret bekommen:** Ihr Skip-Gate (`test.skip(!LLM_URL, …)`) ist
korrekt. Sie wandern nach D2 in den lokalen Lauf.

### D5 — Der Helper-Fix vor allem anderen

F1 wird zuerst behoben, weil er allein 22 der 31 Failures erzeugt und die Wirkung aller weiteren
Schritte sonst im Rauschen untergeht.

## Risks

**R1 — Reaktivierte Tests sind rot.** Wahrscheinlich, siehe D1. Behandlung: als Bug-Tickets
erfassen, nicht erneut skippen.

**R2 — `FLEET_KUBECONFIG` im Matrix-Job weitet dessen Rechte aus.** Der Job bekommt
Cluster-Zugriff, den er bisher nicht hatte. Der `sso-e2e`-Job hat ihn bereits und läuft im selben
Workflow auf demselben Runner-Typ; das Risiko ist damit nicht neu, aber es verdoppelt die Zahl
der Jobs, die eine Fleet-Kubeconfig entpacken. `umask 077` und `chmod 600` werden aus dem
Vorbild übernommen.

**R3 — Der Gruppen-Modifier ist ein wiederkehrendes Muster.** Ohne Guard entsteht er erneut,
sobald jemand einen nicht automatisierbaren Teiltest dokumentieren will. Deshalb der BATS-Guard
in Task 6.
