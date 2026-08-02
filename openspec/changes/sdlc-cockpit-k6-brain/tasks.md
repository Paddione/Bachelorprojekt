---
title: "sdlc-cockpit-k6-brain — Implementation Plan"
ticket_id: T002465
domains: [cockpit, website, infra]
status: active
file_locks:
  - website/src/pages/api/admin/cockpit/brain.ts
  - website/src/lib/brain-links.ts
shared_changes: false
batch_id: null
parent_feature: T002458
depends_on_plans: []
---

# sdlc-cockpit-k6-brain — Implementation Plan

_Ticket: T002465 (K6) · Epic T002458 · Auth-Schnitt festgelegt in `cockpit-auth-schnitt` (T002463)_

## File Structure

```
k3d/network-policies.yaml                              (M) + allow-website-to-brain-ingress
website/src/lib/brain-links.ts                         (N) reine Ableitung Quellpfad -> Wiki-Slug
website/src/lib/brain-links.test.ts                    (N) Vitest fuer die Ableitung
website/src/pages/api/admin/cockpit/brain.ts           (N) GET, isAdmin, cluster-interner Lesezugriff
.lavish/kit/adapter.js                                 (M) + brainLinks() + eine Zeile im return
.lavish/kit/panel-epic-canvas.js                       (M) fuellt den Kontext-Slot
tests/spec/sdlc-cockpit/brain-ingress-policy.bats      (N) Manifest-Struktur (offline)
tests/spec/sdlc-cockpit/brain-link-derivation.bats     (N) Ableitungsregel gegen die Pipeline (offline)
website/src/data/test-inventory.json                   (R) regeneriert
```

`(N)` neu · `(M)` geändert · `(R)` regeneriert.

### S1-Budgets der bestehenden Dateien

| Datei | Ist | Budget |
|---|---|---|
| `.lavish/kit/adapter.js` | 356 | 444 |
| `.lavish/kit/panel-epic-canvas.js` | 232 | 568 |
| `.lavish/kit/panel.js` | 278 | 522 |

Alle drei sind **nicht** gebaselinet; wirksame Schwelle ist das statische
`.js`-Limit (800). `k3d/network-policies.yaml` fällt nicht unter S1 — für
`.yaml` führt `docs/code-quality/gates.yaml` kein Limit. Die neuen Dateien
werden mit deutlicher Reserve unter ihren Limits geschnitten (`.ts` 900,
Zielgröße je unter 150 Zeilen).

`panel.js` steht in der Tabelle, weil Task 7 sie prüft — geändert wird sie nur,
falls Task 7 einen echten Mangel an `setContext` findet.

<!-- vitest: neue Tests in website/src/lib/brain-links.test.ts (Task 4) und für den Handler (Task 5) -->

### Kollision mit K4 — bewusst in Kauf genommen

K4 (T002463) arbeitet parallel an `.lavish/kit/adapter.js` (Endpunkt-Karte statt
der `BASE`-Konstante in Zeile 7, Entfernen der Schreib-Stubs Zeile 307–336).
Der Eingriff hier bleibt deshalb minimal: **ein Funktionsblock plus eine Zeile
im `return`-Objekt** (Zeile 338–353). Wer zuerst merged, gewinnt; der zweite
rebased und behält beide Blöcke.

## Annahmen, die dieser Plan ausdrücklich trifft

1. **URL-Form der Wiki-Seite.** Belegt ist, wohin die Pipeline *schreibt*
   (`<brain-repo>/wiki/<slug>.md`), nicht, unter welchem Pfad der Quartz-Build
   (`ghcr.io/paddione/brain-site`, `SERVER_ROOT=/public`) sie *ausliefert*. In
   Frage kommen `/<slug>` (Content-Root ist `wiki/`) und `/wiki/<slug>`
   (Content-Root ist das Repo-Root). Task 8 klärt das am laufenden Dienst; bis
   dahin probiert der Endpunkt beide Kandidaten in fester Reihenfolge und nimmt
   den, der antwortet. Diese Probe ist kein Notbehelf, sondern zugleich der
   Existenznachweis pro Link.
2. **Herkunft der Quellpfade.** Weder die Daemon-Payload noch die bestehenden
   Cockpit-Endpunkte liefern heute `touched_files`
   (`grep -rn "touched_files" .lavish/kit/ website/src/pages/api/admin/cockpit/`
   findet nichts). Der Endpunkt nimmt die Pfade deshalb als Parameter entgegen;
   das aufrufende Panel liefert, was es kennt. Die Ableitung aus Ticket-Feldern
   ist damit vorbereitet, aber nicht Teil dieses Vorgangs — sie wird möglich,
   sobald `touched_files` in einer Cockpit-Antwort steht.

---

## Task 1 — Ableitungsregel belegen, bevor Code darauf gebaut wird

Nicht raten, sondern die Pipeline selbst befragen. Die Regel steht in
`slugify()` in `scripts/brain-ingest-worklist.sh` (Endung ab, führender Punkt
ab, `tr '/_ ' '---'`, lowercase), das Ziel in `process_page()` in
`scripts/brain-ingest.sh` (`$BRAIN_REPO/wiki/$slug.md`). Beides ausführen statt
lesen:

```bash
bash scripts/brain-ingest-worklist.sh --root . --manifest scripts/brain/ingest-sources.yaml \
  | grep -E '^(openspec/specs/sdlc-cockpit\.md|CLAUDE\.md|docs/superpowers/references/gotchas-footguns\.md)'
```

Erwartet: drei Zeilen der Form `<pfad>\t<slug>\t<gruppe>`, darunter
`openspec/specs/sdlc-cockpit.md` → `openspec-specs-sdlc-cockpit` (Gruppe
`ssot-specs`) und `CLAUDE.md` → `claude` (Gruppe `core-docs`).

Danach die **Grenze** der Regel ebenso belegen — sie ist der bekannte Preis
dieser Entscheidung und gehört gemessen, nicht behauptet:

```bash
bash scripts/brain-ingest-worklist.sh --root . --manifest scripts/brain/ingest-sources.yaml \
  | cut -f1 | grep -cE '^(website|k3d|scripts|tests)/'   # erwartet: 0
bash scripts/brain-ingest-worklist.sh --root . --manifest scripts/brain/ingest-sources.yaml \
  | cut -f1 | grep -c '^openspec/specs/'                 # Positiv-Anker: > 0
```

Der zweite Befehl ist der Positiv-Anker zum ersten: eine Null im ersten Befehl
beweist nur dann etwas, wenn die Liste überhaupt Zeilen enthält.

Festzuhalten sind zwei Befunde, die die Zuordnung einschränken und in Task 4 als
Datenlage eingehen:

- `website/`, `k3d/`, `scripts/`, `tests/` werden im `find`-Aufruf des
  Worklist-Skripts **weggeprunt**. Für Dateien dort gibt es keine Wiki-Seite —
  unabhängig vom Manifest.
- Im Matcher (`scripts/brain-group-match.sh`) wird `*` zu `[^/]*` übersetzt,
  also ein einzelnes Pfadsegment. Das Muster `docs/agent-guide/*.md` trifft
  deshalb **nicht** `docs/agent-guide/maps/agents-map.md`. Die
  Agent-Guide-Karten haben aktuell keine Wiki-Seite; das Worklist-Skript meldet
  das auf stderr als Drift-Warnung. Dieser Plan repariert das Manifest nicht —
  er bildet nur ab, was tatsächlich ingestiert wird.

**Ergebnis dieses Tasks:** die Beobachtungen als Kommentarblock im Kopf von
`website/src/lib/brain-links.ts` (Task 4) festhalten, mit dem Datum des Laufs.

## Task 2 — NetworkPolicy `allow-website-to-brain-ingress` (der Risikoträger)

Dieser Task geht zuerst. Solange die Policy fehlt, ist jeder Endpunkt-Test ein
Timeout, und ein Timeout unterscheidet nicht zwischen „Zuordnungslogik falsch"
und „Netz blockiert".

Verifiziert: `k3d/network-policies.yaml` ist die richtige Datei — sie enthält
`allow-intra-namespace-ingress` (Zeile 149, leerer `podSelector`, wirkt als
Default-Deny) und die vier bestehenden Website-Policies (`-shared-db-` 327,
`-pocket-id-` 348, `-nextcloud-` 369, `-vaultwarden-` 389). Sie ist als
Ressource in `k3d/kustomization.yaml` (Zeile 104) referenziert, also kein
Orphan (S4).

**Zwei Abweichungen vom Manifest in `cockpit-auth-schnitt` sind notwendig** und
hier begründet:

- Der Namespace-Selektor verwendet `${WEBSITE_NAMESPACE}`, nicht das Literal
  `website`. Alle vier Vorbild-Policies in der Datei tun das; die Variable steht
  in den `envsubst`-Listen von `Taskfile.yml`. Ein Literal wäre die einzige
  Ausnahme in der Datei und bräche die Namespace-Wahl pro Umgebung.
- Der `namespace:`-Schlüssel unter `metadata` entfällt: keine andere Policy in
  dieser Datei trägt ihn, der Namespace kommt aus der Kustomization.

Der `docuseal`-Teil der Aufzählung im Auth-Schnitt trifft nicht zu — eine
`allow-website-to-docuseal-ingress` existiert im Repo nicht
(`grep -rn "allow-website-to-docuseal" --include=*.yaml .` liefert nichts).
Vier Vorbilder, nicht fünf.

Einzufügen unmittelbar nach dem `allow-website-to-vaultwarden-ingress`-Block,
im Stil der Datei (mehrzeilige `policyTypes`-Liste, kein Inline-Array):

```yaml
---
# brain: ingress from the website namespace on the container port (T002465)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-website-to-brain-ingress
spec:
  podSelector:
    matchLabels:
      app: brain
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: ${WEBSITE_NAMESPACE}
    ports:
    - port: 8787
      protocol: TCP
```

Port 8787 ist der **Container**-Port (`k3d/brain.yaml`: `containerPort: 8787`,
Service `port: 80` → `targetPort: 8787`). NetworkPolicies filtern auf dem
Container-Port, nicht auf dem Service-Port.

Anschließend:

```bash
task workspace:validate
```

## Task 3 — RED: die beiden BATS-Tests schreiben und scheitern sehen

Ablage nach T002416: ein Verzeichnis pro SSOT-Spec, **eine Datei pro Vorgang**.
`tests/spec/sdlc-cockpit/` existiert bereits mit 18 Dateien aus K1/K5/K9 — die
beiden neuen Namen kollidieren mit keiner davon.

`tests/spec/sdlc-cockpit/brain-ingress-policy.bats` — Prüfmodus im
Header-Kommentar vermerken: **Manifest-Struktur**, also die dokumentierte
Ausnahme von der Output-Regel. Geprüft wird der *gerenderte* Kustomize-Output,
nicht der Dateitext:

- Positiv-Anker zuerst: der gerenderte Baum enthält
  `allow-website-to-vaultwarden-ingress` genau einmal. Ohne diesen Anker
  beweist ein Treffer für `brain` nichts über die Renderbarkeit des Baums.
- Dann: der Output enthält `allow-website-to-brain-ingress`, deren
  `podSelector` auf `app: brain` zeigt und deren Port `8787` ist.
- Dann die Negativaussage mit eigenem Anker: die neue Policy trägt **kein**
  `egress` (sie ist reine Ingress-Erlaubnis); der Anker ist, dass ihr Block
  überhaupt gefunden wurde.

`tests/spec/sdlc-cockpit/brain-link-derivation.bats` — Prüfmodus:
**Output-Verifikation**. Der Test ruft die Ableitung auf, statt sie zu greppen.
Da die Ableitung in TypeScript liegt, prüft er die *Übereinstimmung* zwischen
Pipeline und Implementierung: er lässt `scripts/brain-ingest-worklist.sh`
laufen, zieht drei bekannte Zeilen heraus und vergleicht deren Slug mit dem, was
die TypeScript-Regel für denselben Pfad liefert. Weicht eine der beiden Seiten
ab, ist der Test rot — das ist der eigentliche Zweck: die TypeScript-Kopie der
Regel darf nicht von der Bash-Quelle wegdriften.

Rot-Lauf:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/sdlc-cockpit/brain-ingress-policy.bats
tests/unit/lib/bats-core/bin/bats --count tests/spec/sdlc-cockpit/brain-link-derivation.bats
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/brain-ingress-policy.bats \
                                  tests/spec/sdlc-cockpit/brain-link-derivation.bats
# expected: FAIL — brain-link-derivation ist rot, weil website/src/lib/brain-links.ts
# noch nicht existiert. brain-ingress-policy wird durch Task 2 grün und war davor rot.
```

`--count` statt `bash -n`: `@test "…" { … }` ist keine gültige Bash-Syntax, und
`bash -n` meldet dafür einen irreführenden Fehler.

## Task 4 — `website/src/lib/brain-links.ts`: die Ableitung als reines Modul

Ein Modul ohne Netz, ohne Datenbank, ohne Rück-Import auf API-Schichten (S2).
Exportiert:

- `slugForSource(path: string): string` — die Regel aus Task 1, Zeichen für
  Zeichen: Endung ab, führender Punkt ab, `[/_ ]` zu `-`, lowercase.
- `isIngestedSource(path: string): boolean` — `true` nur für Pfade, die das
  Manifest aufnimmt. Die Präfixliste wird aus den Gruppen von
  `scripts/brain/ingest-sources.yaml` abgeleitet und als Konstante im Modul
  geführt, mit Verweis auf die Manifest-Datei als Quelle. Die vier weggeprunten
  Bäume (`website/`, `k3d/`, `scripts/`, `tests/`) sind explizit
  ausgeschlossen, damit die Grenze im Code steht und nicht im Kopf.
- `candidateHrefs(slug: string): string[]` — die beiden URL-Kandidaten aus
  Annahme 1, in fester Reihenfolge.
- `labelForSource(path: string): string` — der Anzeigetext des Links: der
  Dateiname ohne Endung, damit der Bezug zur Quelle sichtbar bleibt.

Vollständig typisiert, kein `any` — CQ02 darf durch diesen Vorgang nicht
steigen.

`website/src/lib/brain-links.test.ts` (Vitest, co-lokiert wie
`website/src/lib/mediaviewer-bridge.test.ts`) deckt ab: die drei belegten
Slug-Paare aus Task 1, einen weggeprunten Pfad unter `website/` (kein Link),
einen Pfad mit Unterstrich und einen mit führendem Punkt
(`.claude/lib/goals.md` → `claude-lib-goals`).

```bash
cd website && npx vitest run src/lib/brain-links.test.ts
```

## Task 5 — `website/src/pages/api/admin/cockpit/brain.ts`

`GET`, Auth wortgleich nach dem Muster aus
`website/src/pages/api/admin/cockpit/feature-action.ts` (Zeilen 9–11):

```ts
const session = await getSession(request.headers.get('cookie'));
if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
```

Eingabe: `?paths=<komma-getrennte, repo-relative Quellpfade>`. Fehlt der
Parameter, ist die Antwort `400` mit `error` — nicht eine leere Liste, die wie
ein Ergebnis aussähe.

Ablauf je Pfad: `isIngestedSource` → bei `false` in `uncovered[]` statt in
`links[]`; sonst `slugForSource`, dann pro Kandidat aus `candidateHrefs` eine
`HEAD`-Probe gegen die Basis-URL. Der erste `200` gewinnt und wird als
`{href, label}` aufgenommen; antwortet keiner, geht der Slug nach `missing[]`.

Basis-URL aus `process.env.BRAIN_INTERNAL_URL`, Vorgabe der cluster-interne
Service-Name des `brain`-Dienstes im `workspace`-Namespace. Keine Marken-Domain
im Code (S3) und kein Weg über den `oauth2-proxy`.

Antwortform:

```json
{ "links": [], "uncovered": [], "missing": [], "fetchedAt": "…", "error": "…" }
```

`error` wird gesetzt, wenn der Dienst gar nicht antwortet (Netz, DNS, Timeout) —
dann bleibt `links` leer **und** `error` gefüllt, sodass beides unterscheidbar
ist (D13). Wenige Sekunden Timeout pro Probe über `AbortSignal.timeout`, damit
ein hängender Dienst kein Panel blockiert.

Vitest für den Handler mit gemocktem `fetch`: `403` ohne Session, `400` ohne
`paths`, `error` bei unerreichbarem Dienst, sauberer Link bei `200`.

## Task 6 — `.lavish/kit/adapter.js`: `brainLinks()`

**Einmalabruf, kein Poll.** Begründung: Brain-Verweise ändern sich nur, wenn ein
Ingest-Lauf neue Seiten veröffentlicht — ein Poll hätte zwischen zwei
Ingest-Läufen nichts zu tun und löste bei jedem Tick eine Kette von
`HEAD`-Proben im Cluster aus. Das Muster ist dasselbe wie bei `styles()`
(Zeile 275) und `epicChangesSince()` (Zeile 253), nicht `createPoll` (Zeile 60).

`fetchEndpoint()` (Zeile 41–57) wird wiederverwendet: es hält D12 (`fetchedAt`
immer gesetzt) und D13 (Fehler als `error`-Feld, nie `null`) bereits ein.

```js
/**
 * K6 Brain-Verweise (T002465) — Wiki-Seiten zu den Quellpfaden eines Panels.
 *
 * Einmalabruf statt Poll: die Verweise aendern sich nur bei einem Ingest-Lauf.
 *
 * @param {string[]} paths repo-relative Quellpfade
 * @returns {Promise<{links?: Array, uncovered?: string[], missing?: string[], error?: string, fetchedAt: string}>}
 */
async function brainLinks(paths) {
  if (!paths || paths.length === 0) {
    return { links: [], uncovered: [], missing: [], fetchedAt: new Date().toISOString() };
  }
  return fetchEndpoint(`/api/admin/cockpit/brain?paths=${encodeURIComponent(paths.join(','))}`);
}
```

Plus **eine** Zeile `brainLinks,` im `return`-Objekt (Zeile 338–353). Mehr
nicht — das ist die gesamte Kollisionsfläche mit K4.

Der Endpunkt liegt auf der Website, nicht auf dem Daemon. Trägt K4 seine
Endpunkt-Karte vor diesem Vorgang ein, wird `brainLinks` dort als „Website"
geführt; merged dieser Vorgang zuerst, trägt K4 den Eintrag beim Rebase nach.
Bis dahin adressiert `fetchEndpoint` weiter `BASE` — dann liefert die Kit-Seite
im Standalone-Betrieb einen Fehler im `error`-Feld statt eines stillen leeren
Kontext-Slots, was genau das gewünschte Verhalten ist.

## Task 7 — Kontext-Slot füllen

Zuerst `.lavish/kit/panel.js` Zeile 222–236 prüfen: `setContext(links)` leert
den Slot, iteriert über `links` und hängt je ein `<a href target="_blank">` mit
`link.label` an. Das genügt für diesen Vorgang unverändert — die Erwartung
`{href, label}` deckt sich mit der Antwortform aus Task 5. Zeigt sich beim
Ausprobieren ein echter Mangel (etwa ein fehlendes `rel="noopener noreferrer"`
bei `target="_blank"`), wird genau der behoben und sonst nichts; das Budget von
522 Zeilen trägt das mühelos.

`setContext` hat heute **keinen einzigen Aufrufer**
(`grep -rn "setContext" .lavish/` findet nur die Definition). Dieser Vorgang
liefert den ersten: `.lavish/kit/panel-epic-canvas.js` (232 Zeilen) ist das
einzige konkrete Panel im Kit und kennt sein Subjekt — ein Epic mit zugehörigem
`openspec/changes/`-Bezug. Es ruft nach dem Laden einmal `data.brainLinks([…])`
mit den Quellpfaden, die es kennt, und übergibt `result.links` an `setContext`.

Drei Zustände, keiner davon still:

- `result.error` gesetzt → ein einzelner Kontext-Eintrag benennt den Fehler,
  statt den Slot leer zu lassen (D13).
- `result.links` leer, `result.uncovered` nicht leer → ein Eintrag sagt, dass
  die Quellen dieses Panels nicht ingestiert werden. Das ist der bekannte Preis
  der deterministischen Zuordnung, und er gehört sichtbar.
- `result.links` gefüllt → die Links.

## Task 8 — Verifikation gegen den Cluster (nicht offline, nicht in `task test:all`)

Die Tasks 3 bis 7 sind offline prüfbar: Manifest-Struktur, Slug-Ableitung,
Handler mit gemocktem `fetch`. Was einen Cluster braucht, ist die eine Frage,
die Task 2 überhaupt motiviert hat — ob das Paket ankommt. Diese Prüfung läuft
manuell und geht ausdrücklich **nicht** in die Offline-Suite:

```bash
# 1. Policy ist im Cluster angekommen
kubectl --context fleet -n workspace get networkpolicy allow-website-to-brain-ingress

# 2. Aus dem Website-Pod heraus den Brain-Dienst erreichen (vor Task 2: Timeout)
kubectl --context fleet -n website exec deploy/website -- \
  wget -q -S -O /dev/null http://brain.workspace.svc.cluster.local/ 2>&1 | head -5

# 3. URL-Form klaeren (Annahme 1) — welcher Kandidat antwortet mit 200?
kubectl --context fleet -n website exec deploy/website -- sh -c \
  'for p in "/openspec-specs-sdlc-cockpit" "/wiki/openspec-specs-sdlc-cockpit"; do
     echo -n "$p -> "; wget -q -S -O /dev/null "http://brain.workspace.svc.cluster.local$p" 2>&1 | grep -m1 HTTP
   done'
```

Ergibt Schritt 3 einen eindeutigen Gewinner, wird die Kandidatenliste in
`candidateHrefs` auf diesen Wert verkürzt und der Befund als Kommentar dort
vermerkt. Antworten beide oder keiner, bleibt die Liste zweigliedrig — die
Probe je Link fängt das ohnehin ab.

Der Vorgang gilt auch dann als abgeschlossen, wenn Schritt 2 und 3 mangels
Cluster-Zugang nicht laufen: die Policy ist dann strukturell geprüft (Task 3),
und die Kandidatenliste bleibt zweigliedrig. Das ist die eine Stelle, an der
dieser Plan bewusst eine Restunsicherheit trägt, statt sie zu verstecken.

## Task 9 — Abschließende Verifikation

```bash
task test:inventory     # neue BATS- und Vitest-Dateien ins Inventar aufnehmen
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil dieser Vorgang Manifeste anfasst und `website/src` erweitert:

```bash
task workspace:validate
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/sdlc-cockpit-k6-brain/tasks.md
```

`website/src/data/test-inventory.json` wird mit den Testdateien zusammen
committet — CI vergleicht es gegen einen frischen Lauf und schlägt sonst fehl.
