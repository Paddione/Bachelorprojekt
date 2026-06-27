---
ticket_id: T001172
plan_ref: openspec/changes/decouple-tickets-db/tasks.md
status: active
date: 2026-06-27
---

# Decouple `tickets-db.ts` from `website-db.ts` (G-CQ07) — Design-Spec

**Datum:** 2026-06-27
**Branch:** `feature/decouple-tickets-db`
**Betrifft:** `website/src/lib/tickets-db.ts`, `website/src/lib/website-db.ts`, neuer Modul-Schnitt
**Goal-Ref:** G-CQ07 — S2 Import-Zyklen 4 → 0 (Scope: cycle #1 only)
**Ticket:** T001172

---

## Kontext

Das Repo-Inventar (`docs/code-quality/subsystems.yaml` + Linter-Output) listet **vier** S2-Import-Zyklen
in `website/src/`:

```
1) lib/tickets-db.ts > lib/website-db.ts
2) lib/website-db.ts > lib/tickets/transition.ts > lib/tickets/reporter-link.ts
3) lib/website-db.ts > lib/tickets/transition.ts
4) lib/invoice-pdf.ts > lib/native-billing.ts
```

Quelle: `npx --yes madge --circular --extensions ts,tsx website/src` (Stand 2026-06-27).

Ziel-Ref G-CQ07 steht im S2-Zyklus-Cycle mit `Baseline 4 → Target 0`. **Dieses PR** behebt
**ausschließlich Zyklus #1** (`tickets-db.ts ↔ website-db.ts`). Die anderen drei Zyklen bleiben
separate Folge-PRs, um Review-Risiko und Merge-Konflikte niedrig zu halten — Zyklus #1 hat den
höchsten Hebel, weil er die Voraussetzung für G-SIZE03 (god-file split von `website-db.ts`)
schafft.

### Aktueller Zyklus #1

| Datei | Importiert aus | Was |
|---|---|---|
| `website-db.ts` (Z. 9) | `./tickets-db` | `initTicketsSchema` |
| `tickets-db.ts` (Z. 2) | `./website-db` | `pool`, `ensureSchemaOnce` |

`tickets-db.ts` braucht `pool` / `ensureSchemaOnce` ausschließlich in den Bodies von
`initTicketsSchema` (92 `pool.*`-Aufrufe, 2 `ensureSchemaOnce`-Aufrufe) und `isFeatureEnabled`
(1 `pool.query`-Aufruf). Die übrigen ~1090 Zeilen der Datei sind SQL-DDL innerhalb des
`initTicketsSchema`-Closures — keine weiteren Runtime-Abhängigkeiten zu `website-db.ts`.

`website-db.ts` greift **nur an einer einzigen Stelle** statisch auf `tickets-db.ts` zu:
den Top-Level-Import `initTicketsSchema` (Z. 9). Danach folgen ~25 Aufrufe
`await initTicketsSchema()` an verteilten Stellen, die aber alle denselben Identifier aus
Z. 9 referenzieren.

### Re-Export-Kette in `tickets-db.ts`

`tickets-db.ts` re-exportiert zusätzlich `MixedEmbeddingModelError` aus `./knowledge-db` (Z. 8).
Das ist **kein** Bestandteil des Zyklus, muss aber mit umziehen, damit `tickets-embed.ts` und
die zugehörigen Tests (Z. 11, 27, 29) weiterhin nur ein Modul importieren müssen.

### Public-API-Oberfläche von `tickets-db.ts` heute

Aus `grep -nE "^export "` (2026-06-27):

```ts
export { MixedEmbeddingModelError };                // re-export aus knowledge-db
export function ticketEmbeddingModel(): EmbeddingModel;
export async function initTicketsSchema(): Promise<void>;
export async function isFeatureEnabled(brand: string, key: string): Promise<boolean>;
```

Alle vier müssen **stabil** bleiben — Aufrufer dürfen ihre Imports nicht anpassen müssen.

### S1-Budget

- `tickets-db.ts` ist **baselined** (1096 Zeilen, frozen auf commit `8b581ebe` per
  `docs/code-quality/baseline.json`). Das wirksame Budget ist **0** — jede Netto-Zeile
  trippt das CI-Ratchet. Der Refactor muss die Datei also **verkleinern** oder **neutral
  halten**. Die Extraktion in Schritt 2.1 erfüllt das automatisch.
- `website-db.ts` ist in `s1.ignore` (Gates YAML, Z. 56–59) — Änderungen dort sind frei.
- Der neue Modul `tickets-schema.ts` (siehe WAS) wird voraussichtlich ~1080 Zeilen groß
  und muss in `s1.ignore` aufgenommen werden, mit Begründung analog zu `website-db.ts`
  ("akkumuliert DDL für ein einzelnes PostgreSQL-Schema; kanonische Refactoring-Grenze
  ist die Tabellen-Inkarnation, nicht die Datei").

---

## 1. Warum (Why)

### 1.1 Problem

Der statische Import-Zyklus zwischen `tickets-db.ts` und `website-db.ts` hat drei
konkrete Schmerzen:

1. **G-SIZE03-Blockade.** `website-db.ts` ist mit 4485 Zeilen der größte Hotspot im
   Repo (G-SIZE03 markiert ihn als Split-Target). Ein Split in fachliche Sub-Module
   ist blockiert, solange ein **direkter** Top-Level-Import auf `tickets-db.ts` zeigt
   — jedes Sub-Modul, das `initTicketsSchema` braucht, müsste entweder erneut einen
   zyklischen Import einführen oder eine Lazy-Barriere. Mit dem hier vorgeschlagenen
   Schnitt geht der Import stattdessen auf das zykelfreie `tickets-schema.ts`.

2. **Test-Friktion.** `vi.mock('./tickets-db', () => ({ initTicketsSchema: vi.fn()... }))`
   taucht in sieben Test-Dateien auf (siehe `grep tickets-db` Stand 2026-06-27:
   `factory-floor.test.ts`, `factory-metrics.test.ts`, `platform-db.ensure.test.ts`,
   `questionnaire-db.ensure.test.ts`, `tickets-db.providerrouting.test.ts`,
   `tickets-db.test.ts`, `website-db-init-hotpath.test.ts`). Solange der Zyklus
   besteht, muss jedes Konsumenten-Test-File den Pfad stubben — sonst läuft beim
   Import die volle Schema-Init durch. Nach dem Refactor können viele dieser Mocks
   entfallen, weil der zyklische Pfad nicht mehr existiert.

3. **Init-Reihenfolge ist fragil.** `tickets-db.ts` braucht zur Modul-Ladezeit nur
   `pool` und `ensureSchemaOnce` (Werte, die beim Modul-Init von `website-db.ts`
   schon da sind). Aber `tickets-db.ts` enthält zusätzlich `initProviderConfigSchema`
   (Z. 5) und `ensureCockpitViews` (Z. 6) als statische Imports — beide kommen
   aus Sub-Modulen, die im Test selbst zyklisch auf `website-db.ts` zurückverweisen
   können. Die aktuelle Code-Insellage funktioniert nur, weil Node-ESM die
   Reihenfolge des Modul-Rückbezugs serialisiert. Jede neue Datei in diesem
   Pfad ist ein latenter Refactor-Fußangriff.

### 1.2 Ziel

- **S2-Mess:** Nach dem Refactor meldet
  `npx --yes madge --circular --extensions ts,tsx website/src` weiterhin die
  verbleibenden 3 Zyklen (#2, #3, #4) — **Zyklus #1 darf nicht mehr auftauchen**.
- **Public-API-Stabilität:** Alle vier Top-Level-Exports von `tickets-db.ts`
  bleiben mit identischer Signatur und identischem Pfad exportiert.
- **Aufruferstabilität:** Keine `.ts`/`.tsx` außerhalb der drei Refactor-Dateien
  muss angefasst werden. Insbesondere dürfen `tickets-embed.ts`, `tickets/admin.ts`,
  `systemtest/failure-bridge.ts`, `systemtest/test-run-bridge.ts` und die sieben
  Test-Files ihre `import { ... } from './tickets-db'`-Zeile unverändert behalten.
- **S1-Budget:** `tickets-db.ts` schrumpft von 1096 auf <100 Zeilen. `tickets-schema.ts`
  wird in `s1.ignore` aufgenommen.

### 1.3 Nicht-Ziele

- Die Zyklen #2, #3, #4 werden **nicht** in diesem PR angefasst.
- `website-db.ts` wird **nicht** inhaltlich verändert (nur ein Import-Pfad).
- Die Sub-Module `tickets/transition.ts`, `tickets/reporter-link.ts`,
  `invoice-pdf.ts`, `native-billing.ts` bleiben unangetastet.
- Keine Funktions-Signaturänderungen, keine Verhaltenänderungen, kein
  Funktions-Body-Refactor.

---

## 2. Was (What)

### 2.1 Extraktion: neues Modul `tickets-schema.ts`

**Neue Datei:** `website/src/lib/tickets-schema.ts`

Inhalt: die beiden Funktionen, die aktuell `pool` / `ensureSchemaOnce` aus
`website-db.ts` brauchen, plus der `MixedEmbeddingModelError`-Re-Export.

```
Aus tickets-db.ts nach tickets-schema.ts wandern:
  - `import { MixedEmbeddingModelError } from './knowledge-db';`  (Z. 3)
  - `export { MixedEmbeddingModelError };`                         (Z. 8)
  - `initTicketsSchema` Body (Z. 16–1080)                          (~1065 Zeilen DDL)
  - `isFeatureEnabled` Body (Z. 1082–1095)                         (14 Zeilen)

In tickets-schema.ts neu aufnehmen:
  - `import { pool, ensureSchemaOnce } from './website-db';`       (jetzt in tickets-schema)
  - `import { MixedEmbeddingModelError } from './knowledge-db';`
  - `import { initProviderConfigSchema } from './schema/provider-config-schema';`
  - `import { ensureCockpitViews } from './tickets/cockpit-schema';`
  - `export { MixedEmbeddingModelError };`
  - `export async function initTicketsSchema(): Promise<void> { ... }`
  - `export async function isFeatureEnabled(brand: string, key: string): Promise<boolean> { ... }`
  - das bestehende `schemaReady`-Flag (Modul-lokal, in tickets-schema.ts)
```

`tickets-schema.ts` importiert aus `website-db.ts` (für `pool`, `ensureSchemaOnce`),
aus `knowledge-db.ts` (für `MixedEmbeddingModelError`) und aus den beiden Sub-Schema-
Modulen. **Kein** Import aus `tickets-db.ts`.

### 2.2 Reduktion: `tickets-db.ts` schrumpft

Neuer Inhalt von `tickets-db.ts`:

```ts
// website/src/lib/tickets-db.ts
// Public-API-Fassade: re-exportiert die schema-relevanten Funktionen aus
// tickets-schema.ts, damit bestehende Aufrufer (tickets-embed.ts,
// tickets/admin.ts, systemtest/*, 7 .test.ts-Dateien) ihre Imports nicht
// anpassen müssen. Der frühere Body von initTicketsSchema/isFeatureEnabled
// lebt jetzt in tickets-schema.ts — siehe G-CQ07.
import type { EmbeddingModel } from './embeddings';

export {
  initTicketsSchema,
  isFeatureEnabled,
  MixedEmbeddingModelError,
} from './tickets-schema';

/** The embedding model this environment writes/queries with. bge-m3 in prod
 *  (LLM_ENABLED=true), voyage-multilingual-2 in dev. Mirrors knowledge-db.ts. */
export function ticketEmbeddingModel(): EmbeddingModel {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}
```

Erwartete Zeilenzahl: ~14 Zeilen (drastische Reduktion von 1096 → 14). Damit
schrumpft die baselined-Datei **netto** um ~1080 Zeilen, was das S1-Budget klar
**unterschreitet** (Schrumpfen ist erlaubt; nur Wachstum trippt das Ratchet).

`ticketEmbeddingModel()` bleibt in `tickets-db.ts`, weil es keinen Pool-Zugriff
braucht und von keinem Kandidaten für den Zyklus-Pfad verwendet wird — keine
Grundlage für eine Verschiebung.

### 2.3 Zyklus-Bruch in `website-db.ts`

Eine **einzige** Zeile ändert sich:

```diff
- import { initTicketsSchema } from './tickets-db';
+ import { initTicketsSchema } from './tickets-schema';
```

`website-db.ts` importiert danach nur noch aus `tickets-schema.ts` (das selbst
`pool` und `ensureSchemaOnce` aus `website-db.ts` zieht — das ist die einzige
Richtung). Der statische Zyklus-Pfad `website-db.ts → tickets-db.ts →
website-db.ts` ist damit unterbrochen.

### 2.4 S1-Gate-Anpassung: `s1.ignore`

`docs/code-quality/gates.yaml` muss um den neuen Eintrag erweitert werden:

```yaml
ignore:
  ...
  - "website/src/lib/website-db.ts"
  # tickets-schema.ts akkumuliert das gesamte DDL + Helper für das
  # `tickets`-PostgreSQL-Schema. Splitting-Grenze ist die Tabelle
  # (Tabelle = Datei-Abschnitt), nicht die Datei — analog zu website-db.ts.
  - "website/src/lib/tickets-schema.ts"
  ...
```

Begründungstext analog zu `website-db.ts` (Z. 56–59), damit künftige Leser
die Begründung finden.

### 2.5 Test-Lockdown

Die sieben Test-Files, die aktuell `vi.mock('./tickets-db', …)` enthalten,
müssen ihre Mock-Pfade aktualisieren, **wenn** ihr Mock die exportierte
Funktion `initTicketsSchema` oder `isFeatureEnabled` braucht — der Pfad
wechselt zu `./tickets-schema`. Konkret zu prüfen:

| Test-File | Mock-Ziel | Anpassung |
|---|---|---|
| `factory-floor.test.ts` | `isFeatureEnabled` | Mock-Pfad → `./tickets-schema` |
| `factory-metrics.test.ts` | `isFeatureEnabled` | Mock-Pfad → `./tickets-schema` |
| `platform-db.ensure.test.ts` | `initTicketsSchema` | Mock-Pfad → `./tickets-schema` |
| `questionnaire-db.ensure.test.ts` | `initTicketsSchema` | Mock-Pfad → `./tickets-schema` |
| `tickets-db.providerrouting.test.ts` | `isFeatureEnabled` | Mock-Pfad → `./tickets-schema` |
| `website-db-init-hotpath.test.ts` | `initTicketsSchema` | Mock-Pfad → `./tickets-schema` |

`factory-floor.test.ts` enthält zusätzlich eine Drift-Guard-Zeile 329:
`it('exports every enum value (drift guard against tickets-db.ts)', ...)`.
Diese ist unkritisch — der Test liest nur den Source-Pfad von `tickets-db.ts`,
nicht von `tickets-schema.ts`. **Kein Anpassungsbedarf.**

Der `tickets-db.test.ts`-Test (Z. 6: "We assert against the SOURCE of
initTicketsSchema(): the inert pg_notify trigger") muss seine `readFileSync`
-Referenz von `./tickets-db.ts` auf `./tickets-schema.ts` umstellen — denn
der `pg_notify`-Trigger lebt jetzt dort.

`tickets-db.featureflag.test.ts` und `tickets-embed.test.ts` importieren
über `from './tickets-db'` — die re-exports funktionieren weiter, kein
Anpassungsbedarf.

`tickets-embed.ts`, `tickets/admin.ts`, `systemtest/failure-bridge.ts`,
`systemtest/test-run-bridge.ts` und die übrigen Test-Files
(`systemtest/{reconciler,retest-trigger,cleanup,failure-bridge}.test.ts`):
**kein** Anpassungsbedarf, weil `tickets-db.ts` `initTicketsSchema` weiter
re-exportiert.

### 2.6 Messbarkeit

**Akzeptanzkriterien** (vom Plan zu verifizieren):

- `npx --yes madge --circular --extensions ts,tsx website/src` — Zyklus #1
  verschwindet aus dem Report. Zyklen #2, #3, #4 bleiben unverändert bestehen
  (separate PRs).
- `bash scripts/openspec.sh validate` läuft grün.
- `task test:unit` und das zugehörige `task test:changed` (Website-Scope) laufen
  grün — insbesondere die sieben oben aufgeführten Test-Files, der
  `tickets-embed.test.ts` und der `tickets-db.featureflag.test.ts`.
- `task test:code-quality` läuft grün — S1-Ratchet bleibt happy (tickets-db.ts
  schrumpft, tickets-schema.ts ist in s1.ignore).
- `task freshness:regenerate && task freshness:check` läuft grün — der
  Repo-Index wird den neuen Modul-Eintrag aufnehmen.
- `bash scripts/plan-lint.sh openspec/changes/decouple-tickets-db/tasks.md`
  ist Exit 0.
- Vor dem Merge: `git log --stat` zeigt **keine** Änderung außerhalb der drei
  Refactor-Dateien + 1 Gate-YAML-Änderung + 6–7 Test-Anpassungen.

### 2.7 Risiken & Edge-Cases

- **`MixedEmbeddingModelError`-Pfad.** Der Re-Export wandert nach
  `tickets-schema.ts`. Der neue `export { MixedEmbeddingModelError }` in
  `tickets-db.ts` muss aus `tickets-schema.ts` re-exportieren (siehe 2.2).
  Aufrufer-Imports (`from './tickets-db'`) bleiben gültig. **Risiko niedrig.**

- **Schema-Init-Reihenfolge.** Aktuell wird `initTicketsSchema` per
  `initTicketsSchema().catch(() => { … })` (Z. 72) bei Modul-Load von
  `website-db.ts` angestoßen. Da `website-db.ts` weiterhin
  `initTicketsSchema` importiert (jetzt aus `tickets-schema.ts`), bleibt
  dieses Verhalten identisch. **Risiko null.**

- **Lazy/Static-Spannung.** Der Refactor benutzt **keine** dynamischen
  Imports — die zyklische Struktur wird rein durch Datei-Schnitt gelöst.
  Konsistent mit der bestehenden Konvention in der Codebase (siehe z.B.
  `tickets/admin.ts` Z. 11: statischer Import).

- **Test-Mock-Pfade.** Sechs Tests müssen den Mock-Pfad nachziehen.
  **Risiko niedrig**, weil das Schema der `vi.mock(...)`-Aufrufe unverändert
  bleibt.

- **Provider-Routing-Migration.** `tickets-db.providerrouting.test.ts`
  prüft, dass `tickets-db.ts` `initProviderConfigSchema` aufruft. Da
  `tickets-schema.ts` diese Sub-Schema-Initialisierung übernimmt, ist die
  getestete Invariante **gebrochen** — der Test-Name ist veraltet. Der
  Test-Source-Pfad-Check (Z. 116: `readFileSync(… './tickets-db.ts'…)`) muss
  auf `./tickets-schema.ts` umgestellt werden. **Risiko mittel:** der Test
  könnte fehlschlagen, wenn die Assertion auf `tickets-db.ts` zeigt und
  der relevante `initProviderConfigSchema`-Aufruf nicht mehr dort steht.
  → **Mitigation:** Mock-Pfad-Update **und** readFileSync-Pfad-Update im
  selben Schritt; Test-Source-Assertion prüft explizit den
  `initProviderConfigSchema`-Aufruf in `tickets-schema.ts`.

- **`__resetSchemaInitCacheForTests` in `website-db.ts`.** Wird vom
  `tickets-db.test.ts` (Z. 9) referenziert, um den Schema-Init-Cache
  zwischen Tests zu leeren. Bleibt in `website-db.ts` — kein Bezug zum
  Refactor.

---

## 3. Vorgehen (How — Zusammenfassung)

Der vollständige Implementierungs-Plan mit akzeptanztest-fähigen Tasks lebt
in `openspec/changes/decouple-tickets-db/tasks.md`. Hier die Reihenfolge:

1. **Baseline.** `task test:changed` und `task test:code-quality` lokal grün
   prüfen, damit nachher klar ist, was der Refactor bricht.
2. **Modul anlegen.** `website/src/lib/tickets-schema.ts` mit dem Inhalt aus
   2.1 erstellen.
3. **`tickets-db.ts` reduzieren.** Auf den Fassaden-Inhalt aus 2.2
   zurückschneiden.
4. **`website-db.ts` umverdrahten.** Eine Zeile (Z. 9) ändern.
5. **Tests anpassen.** Sechs `vi.mock`-Pfade + eine `readFileSync`-Quelle
   nachziehen (siehe 2.5 / 2.7).
6. **`s1.ignore` erweitern.** `docs/code-quality/gates.yaml` um den Eintrag
   aus 2.4 ergänzen.
7. **Verifikation.** `npx madge --circular`, `task test:changed`,
   `task test:code-quality`, `task freshness:regenerate && task
   freshness:check`, `bash scripts/openspec.sh validate`. Alle müssen grün
   sein.
8. **Commit + PR.** Conventional-Commit, Conventional-Title mit
   `[T001172]`-Tag.

---

## 4. Annahmen & Vorab-Validierungen

- `npx --yes madge` ist im Repo verfügbar (per `package.json` devDependency
  und via `task test:code-quality` benutzt). Bestätigt: ja.
- `task test:code-quality` kennt `s1.ignore` und respektiert neue Einträge
  beim nächsten Lauf. Bestätigt: ja, das ist genau der Vertrag des Gates.
- Der bestehende `tickets-db.test.ts` ist im aktuellen `main` grün
  (sonst wäre der Refactor-Start fragwürdig). Annahme: ja — die
  Test-Inventur ist nicht Teil dieses Designs.
- Keine Story / Epic / Roadmap-Änderung nötig. Der Plan betrifft genau
  einen Subsystem-Schnitt.

---

## 5. Referenzen

- `docs/superpowers/specs/spec-frontmatter-standard.md` — Frontmatter-Regelwerk
- `docs/code-quality/gates.yaml` — S1/S2/S3/S4-Gate-Konfiguration
- `docs/code-quality/baseline.json` — S1-Baseline-Liste (siehe `S1:tickets-db.ts`)
- `openspec/changes/decouple-tickets-db/proposal.md` — OpenSpec-Proposal
- `openspec/changes/decouple-tickets-db/tasks.md` — Implementierungs-Plan
- `madge`-Output Stand 2026-06-27, vier Zyklen (siehe Kontext)
- `G-CQ07` Goal-Kontext (S2-Zyklen, Baseline 4, Target 0)
- `G-SIZE03` Goal-Kontext (website-db.ts god-file split, derzeit durch
  diesen Zyklus blockiert)
