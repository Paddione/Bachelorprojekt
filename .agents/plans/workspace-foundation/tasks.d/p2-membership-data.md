## Task 2: Membership-Datenmodell (Migration + Datenzugriff + Inbox-Referenz)

Context. Dieses Partial (id p2, role impl, keine depends_on) legt das Datensatz-Fundament für mandantenfähige Arbeitsbereiche: eine neue Tabelle für Benutzer-zu-Business-Zuordnungen mit Rolle, eine additive Business-Referenz an Inbox-Einträgen, ein schlankes Datenzugriffsmodul und dessen Fassaden-Reexport. Es besitzt exakt vier Zieldateien, erstellt keine weitere Datei und wartet auf kein anderes Partial. Sämtliche DDL-Anweisungen leben in der Migration; die Lib-Module enthalten nur parametrisierte Abfragen und keinerlei Schema-Anweisungen. Harte Mandanten-Durchsetzung auf Schema-Ebene gehört bewusst nicht dazu, sie folgt mit der blockierten Härtung; die Fremdschlüssel sind deshalb gegen eine fehlende Brand-Tabelle bewacht statt hart vorausgesetzt.

Target files (zwei NEW, zwei CHANGED):

- `components/website/src/db/migrations/20261007_business_memberships.sql` Ist 0 (neu) · Schwelle ohne S1-Limit (Extension ohne Limit-Eintrag, nicht-baselined) → Budget ohne S1-Deckel, klein halten (NEW: Tabelle plus Inbox-Spalte plus Indexe plus bewachte Fremdschlüssel)
- `components/website/src/lib/business-memberships.ts` Ist 0 (neu) · Schwelle 900 → Budget 900 (NEW: reines Datenzugriffsmodul, voll typisiert, zyklenfrei)
- `components/website/src/lib/messaging-db.ts` Ist 296 · Schwelle 900 → Budget 604 (CHANGED: strikt additiv, nur optionale Business-Referenz)
- `components/website/src/lib/website-db.ts` Ist 313 · Schwelle 900 → Budget 587 (CHANGED: nur Fassaden-Reexport des neuen Moduls)

<!-- vitest: kein neuer Test nötig, weil die ausführbare Abdeckung dieses Partials im Tests-Partial liegt und die Zieldateien disjunkt bleiben müssen -->

### Steps

1. Vor jeder Änderung die vier Ist-Zeilen neu vermessen und gegen die S1-Zeilen oben halten:
   ```bash
   for f in components/website/src/db/migrations/20261007_business_memberships.sql components/website/src/lib/business-memberships.ts components/website/src/lib/messaging-db.ts components/website/src/lib/website-db.ts; do
     if [ -f "$f" ]; then wc -l "$f"; else echo "0 $f (neu)"; fi
   done
   ```
   Erwartet: die beiden neuen Dateien fehlen noch, die beiden bestehenden stehen auf 296 und 313. Bei Drift die S1-Zeilen zuerst auf die frischen Werte aktualisieren, dann fortfahren.
2. Die Migration schreiben. Der Dateiname sortiert sich hinter allen bestehenden Migrationen ein und wird genau einmal nach Dateiname verfolgt. Jede Anweisung ist erneut lauffähig (IF NOT EXISTS plus Wächter auf Constraints):
   ```sql
   -- 20261007_business_memberships.sql — Benutzer-zu-Business-Zuordnungen plus Inbox-Referenz
   CREATE TABLE IF NOT EXISTS public.business_memberships (
     user_key   text NOT NULL,
     brand      text NOT NULL,
     role       text NOT NULL CHECK (role IN ('owner', 'member')),
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (user_key, brand)
   );

   CREATE INDEX IF NOT EXISTS business_memberships_brand_idx
     ON public.business_memberships (brand);
   CREATE INDEX IF NOT EXISTS business_memberships_user_key_idx
     ON public.business_memberships (user_key);

   GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_memberships TO website;

   ALTER TABLE public.inbox_items ADD COLUMN IF NOT EXISTS brand text;

   CREATE INDEX IF NOT EXISTS inbox_items_brand_idx
     ON public.inbox_items (brand);

   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = 'brands') THEN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_memberships_brand_fkey') THEN
         ALTER TABLE public.business_memberships ADD CONSTRAINT business_memberships_brand_fkey
           FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbox_items_brand_fkey') THEN
         ALTER TABLE public.inbox_items ADD CONSTRAINT inbox_items_brand_fkey
           FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
       END IF;
     ELSE
       RAISE NOTICE 'Brand-Tabelle fehlt, Fremdschlüssel übersprungen (Härtung folgt)';
     END IF;
   END $$;
   ```
   Die Spaltennamen folgen der etablierten Brand-Spalten-Konvention; die User-Seite bleibt bewusst ohne Fremdschlüssel, weil kein verifiziertes Ziel existiert. Keine Hostnamen, keine Markennamen als Literale in dieser Datei.
3. Das Datenzugriffsmodul schreiben. Es ist ein reines Modul: einziger Import ist der geteilte Verbindungspool über dieselbe relative Bezugnahme, die das Inbox-Modul bereits verwendet, dazu nur eigene Typen — keine Rückbezüge, keine Zyklen. Nur parametrisierte SELECT/INSERT/UPDATE/DELETE-Anweisungen, kein DDL, keine Hostnamen, keine any-Typen (durchgehend konkrete Typen):
   ```ts
   export type BusinessRole = 'owner' | 'member';
   export interface BusinessMembership {
     userKey: string;
     brand: string;
     role: BusinessRole;
     createdAt: Date;
   }
   export async function listMembershipsForUser(userKey: string): Promise<BusinessMembership[]>
   export async function listMembershipsForBrand(brand: string): Promise<BusinessMembership[]>
   export async function getMembership(userKey: string, brand: string): Promise<BusinessMembership | null>
   export async function addMembership(params: { userKey: string; brand: string; role: BusinessRole }): Promise<BusinessMembership>
   export async function removeMembership(userKey: string, brand: string): Promise<number>
   ```
   Tabellenspalten per Alias auf die Interface-Felder abbilden (user_key auf userKey, created_at auf createdAt). addMembership per INSERT mit ON CONFLICT (user_key, brand) DO UPDATE der Rolle (idempotentes Hinzufügen). removeMembership liefert die betroffene Zeilenzahl (0 bei unbekanntem Paar, analog zum Löschvertrag des Inbox-Moduls).
4. Das Inbox-Modul strikt additiv erweitern: das Eintrags-Interface erhält `brand: string | null`; die Erzeugungsfunktion erhält einen optionalen `brand`-Parameter (INSERT-Spaltenliste plus ein Platzhalter, RETURNING-Klausel unverändert); die Listenfunktion erhält einen optionalen `brand`-Filter (zusätzliche AND-Bedingung nur bei gesetztem Wert); alle übrigen Funktionen bleiben unverändert. NULL bedeutet ohne Zuordnung; keine Normalisierung alter Zeilen. Alle bisherigen Aufrufe kompilieren unverändert, weil jede Ergänzung optional ist.
5. Die Fassade um genau einen Reexport-Block für das neue Modul ergänzen (Funktionen plus Typen), positioniert bei den bestehenden Modul-Reexports; keine andere Zeile der Datei anfassen:
   ```ts
   export {
     listMembershipsForUser, listMembershipsForBrand, getMembership,
     addMembership, removeMembership,
   } from './business-memberships';
   export type { BusinessMembership, BusinessRole } from './business-memberships';
   ```
6. Guards und Commit. DDL-Freiheit der Lib-Module (muss leer sein, sonst Abbruch):
   ```bash
   if grep -rniE 'CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX' components/website/src/lib/business-memberships.ts components/website/src/lib/messaging-db.ts components/website/src/lib/website-db.ts; then echo 'DDL-LECK in Lib-Modulen'; exit 1; fi
   if grep -rn '\.de\b' components/website/src/db/migrations/20261007_business_memberships.sql components/website/src/lib/business-memberships.ts components/website/src/lib/messaging-db.ts components/website/src/lib/website-db.ts; then echo 'DOMAIN-LITERAL im Diff'; exit 1; fi
   ```
   Danach den dokumentierten any-Muss-Zähler aus den Plan-Qualitätsregeln, begrenzt auf die drei TS-Zieldateien, ausführen — null Treffer erwartet. Wachstum per wc -l über die vier Dateien prüfen: neues Modul deutlich unter seiner Schwelle mit Reserve, Inbox-Wachstum im kleinen zweistelligen Bereich, Fassade im einstelligen Bereich. Commit exakt der vier Dateien:
   ```bash
   git add components/website/src/db/migrations/20261007_business_memberships.sql components/website/src/lib/business-memberships.ts components/website/src/lib/messaging-db.ts components/website/src/lib/website-db.ts
   git commit -m "feat(T901022): membership data model [T901022]"
   ```

### Acceptance criteria

- Die Migration erstellt Tabelle und Inbox-Spalte idempotent, trägt beide Indexe und beide bewachten Fremdschlüssel und meldet eine fehlende Brand-Tabelle per Hinweis statt per Abbruch.
- Das Datenzugriffsmodul exportiert exakt fünf Funktionen und zwei Typen, ist vollständig typisiert, enthält nur parametrisierte DML und importiert ausschließlich den geteilten Pool.
- Die Inbox-Änderung ist additiv: alle bisherigen Aufrufe kompilieren unverändert, neue Aufrufe können die optionale Referenz setzen und filtern.
- Die Fassade unterscheidet sich nur durch den einen Reexport-Block vom Ausgangsstand.
- Alle Guards aus Schritt 6 sind grün und der Commit enthält exakt die vier Zieldateien mit der Ticket-Scope-Nachricht.
