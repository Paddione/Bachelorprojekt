# Massage Owner-Runbook (T901029)

Tagesablauf, Störfälle und Launch-Readiness für die Massage-Praxis.
Platzhalter sind mit `[PLATZHALTER: ID]` markiert und werden beim
Owner-Handover durch echte Inhalte ersetzt.

## 1. Tagesablauf

1. **Anfragen prüfen** (`/owner/anfragen`): offene Anfragen mit
   Service, Slot und Kontakt sichten.
2. **Annehmen oder ablehnen**: Annehmen prüft automatisch erneut
   Verfügbarkeit, Ablauf und Mindestvorlauf (Vortag-Regel); bei Erfolg
   geht die Bestätigung an den Gast. Ablehnen sendet die Notiz mit.
3. **Telefon-Anfragen**: manuell als Anfrage anlegen (selber Flow,
   kein öffentlicher Pfad für Hausbesuche — Ausnahmen trägt die
   Inhaberin mit Ort ein).
4. **Tagesübersicht** (`/owner/kalender`): Termine, Blockerzeiten,
   Erinnerungsstatus.
5. **Versandstatus**: Spalte in `/owner/anfragen`; fehlgeschlagene
   Nachrichten per „Erneut senden" wiederholen (3 Versuche automatisch,
   danach manuell).

## 2. Storno und Umbuchung

- **Gast storniert selbst** per Token-Link aus der Bestätigungsmail:
  möglich aus „angefragt" und „bestätigt"; die Inhaberin erhält
  eine Notiz.
- **Gast will umbuchen**: Token-Link erzeugt eine neue, verknüpfte
  Anfrage; die alte wird geschlossen.
- **Inhaberin storniert**: über `/owner/anfragen` bzw. Kalender mit
  Notiz an den Gast. Stornoregel: Kostenfreier Storno bis 24 h vor
  Terminbeginn, danach 50 % des Preises (OQ-06).
- Nach Storno gehen **keine** Erinnerungen mehr raus.

## 3. Erinnerungen

- Automatisch 24 Stunden vor Terminbeginn per E-Mail, werbefrei.
- Nur an bestätigte Termine; Voraussetzung ist der laufende
  CronJob `appointment-reminders` (stündlich).
- Bei Zustellfehlern: Versandstatus prüfen, erneut senden.

## 4. Kunden

- Verzeichnis unter `/owner/kunden`: Kunden entstehen automatisch
  aus Anfragen (E-Mail als Schlüssel).
- Suche per Name oder E-Mail; Terminhistorie pro Kunde.
- **Dubletten** werden nur vorgeschlagen, nie still vereint;
  Zusammenführung nur nach expliziter Bestätigung beider Einträge.
- **Korrektur, Export (CSV), Löschung** pro Kunde. Löschung beachtet
  Steuerfristen: Rechnungsdaten bleiben bestehen (Aufbewahrung),
  der Rest wird anonymisiert.
- Keine Behandlungsnotizen im System (gesundheitsdatenfrei).

## 5. Rechnungen

- Erstellen aus bestätigtem Termin unter `/owner/rechnungen`
  (eine Rechnung pro Termin; Duplikate werden abgewiesen).
- Nummern fortlaufend pro Jahr; Pflichtangaben nach §14 UStG;
  Kleinunternehmer-Hinweis ist voreingestellt
  (abschaltbar nach Steuerberatung).
- **Zahlungsstatus manuell** pflegen: bezahlt oder offen, Methode
  Bar, Überweisung oder Sonstige.
- **Korrektur** nur per Storno und Neuausstellung (Original bleibt).
- **CSV-Export** über Zeitraum für die Steuerberatung.
- Rechnungssteller-Daten (OQ-08): Birgit Korczewski,
  In der Twiet 4, 21360 Vögelsen;
  `[PLATZHALTER: STEUERNUMMER]` (folgt). §19-UStG an.

## 6. Inhalte pflegen

- Texte, Preise, Profil und FAQs liegen in
  `components/website/content/massage/*.json` und ersetzen die
  Platzhalter-Slots (IDs im Bundle).
- Offene Slots: `[PLATZHALTER: PREIS-RUECKEN-30]`,
  `[PLATZHALTER: PREIS-GANZKOERPER-60]`,
  `[PLATZHALTER: PREIS-GANZKOERPER-90]` (alle → T901430),
  `[PLATZHALTER: PROFILTEXT]`, `[PLATZHALTER: STEUERNUMMER]`,
  Porträt- und Praxis-Fotos (folgen, OQ-07).
  Erledigt (OQ-01/02/03/06/08): Praxis-Name, Inhaberin,
  Telefon, E-Mail, Storno-Regel, Creditor-Daten.
- Öffentlich steht nur der Ort; die genaue Anfahrt geht erst mit
  der Buchungsbestätigung raus.

## 7. Störfälle

| Symptom | Maßnahme |
|---|---|
| Keine Anfragen sichtbar | `/owner/anfragen` neu laden; Versandstatus prüfen; CronJob-Status prüfen |
| Gast meldet: kein Token-Link | Spam-Ordner; erneut senden; E-Mail-Adresse korrigieren |
| Doppelter Termin | Kalender prüfen; eine Anfrage ablehnen/stornieren; Gast informieren |
| Rechnung falsch | Storno + Neuausstellung (nie überschreiben) |
| Seite nicht erreichbar | Status-Seite prüfen; Deployment-Logs sichten; Rollback per Revert-PR |

## 8. Backup und Recovery

- Datenbank-Backup nach `docs/runbooks/business-restore.md`
  (Restore-Demo dort beschrieben).
- Recovery-Probe vor Launch einmal durchspielen und hier
  abhaken (siehe Checkliste).

## 9. Launch-Readiness-Checkliste

- [ ] Owner-Inhalte gesetzt (alle Platzhalter aus §5–6 ersetzt)
- [ ] Echte Preise und Stornoregel mit Steuerberatung abgestimmt
- [ ] Test-Anfrage Ende-zu-Ende auf Staging gefahren (E2E fa-62 grün)
- [ ] Erinnerungs-CronJob aktiv und verifiziert
- [ ] Backup/Restore-Probe durchgeführt
- [ ] Erreichbarkeit mobil + Tastatur geprüft
- [ ] Budgets aus §11 vom Owner freigegeben (Fragebogen)
- [ ] Live-Smoke mit Owner-Freigabe (Publish nur mit Autorisierung)

## 10. Pilot-Nachweis (Platzhalter-Inhalte)

- E2E-Spec `tests/e2e/specs/fa-62-massage-pilot.spec.ts`: 8/8 grün
  gegen lokale Massage-Instanz (PR #6384).
- Abgedeckt: Homepage/Leistungen/FAQ, Slots, Anfrage + Idempotenz,
  Gleich-Tag-Abweisung, Token-Status, Storno, Cron/Owner-Guards,
  Umbuchung. Owner-Login-Flows brauchen die manuelle Owner-Probe.
- E2E-Specs `fa-63-massage-mobile` + `fa-64-massage-keyboard`: 5/5 grün
  gegen lokale Massage-Instanz (PR #6399). Mobile Darstellung ohne
  Overflow, Menü per Tap, CTA per Tab mit sichtbarem Fokus,
  Tastatur-Journey bis Kontakt.
- E2E-Spec `fa-65-massage-audit`: 10/10 grün (5× axe 0 critical/serious,
  5× Lade-Smoke) gegen lokale Massage-Instanz (PR vgl. T901307).

## 11. Performance- und Accessibility-Budgets (T901307)

Vorgeschlagene Budgets — der Owner gibt sie über den Fragebogen
(T901308) frei. Öffentliche Seiten: `/`, `/leistungen`, `/faq`,
`/ueber-mich`, `/kontakt`.

**Barrierefreiheit (hart, enforced):**

- axe-core 0 critical/serious (Tags wcag2a, wcag2aa, wcag21a, wcag21aa)
  auf allen fünf Seiten — enforced durch FA-65 A1.
- Tastatur: CTA per Tab mit sichtbarem Fokus, Journey per Tastatur —
  enforced durch FA-64.

**Performance Live-Ziele (Core Web Vitals „good", Prüfung nach Deploy
auf der Live-Umgebung):**

- LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1.

**Lade-Smoke (Dev, großzügig, nur gegen Hänger):**

- `loadEventEnd` < 20 s je Seite — enforced durch FA-65 P1.
  Vite-Dev ist nicht produktiv optimiert; dieser Wert ist kein CWV-Budget.

**Prod-Baseline (lokaler `astro build`, Stand T901370, localhost ohne
Drosselung, 2026-10-08, informativ, nicht-gatend):**

| Route        | DCL  | load | Reqs | Transfer |
|--------------|------|------|------|----------|
| `/`          | 166 ms | 178 ms | 11 | 412 KB |
| `/leistungen` | 53 ms | 56 ms | 18 | 203 KB |
| `/faq`       | 40 ms | 42 ms | 16 | 210 KB |
| `/ueber-mich` | 58 ms | 58 ms | 15 | 201 KB |
| `/kontakt`   | 56 ms | 143 ms | 17 | 293 KB |

Alle fünf Seiten: axe 0 critical/serious gegen denselben Prod-Build.

## 12. Go-live auf korczewski.de (T901440)

Die Website läuft auf dem korczewski-Slot (`web.korczewski.de`), der Owner-Login über die eigene
Pocket ID (`auth.korczewski.de`). Der übrige korczewski-Workspace bleibt eingefroren (T002479).
Alle Schritte hier macht der Operator von Hand. Der Agent führt sie nicht aus.

**Go-live bestätigt am:** ____-__-__ (Operator erst nach erfolgreichem Smoke-Test eintragen). Ein Merge allein belegt keinen Live-Betrieb.

Reihenfolge einhalten, jeder Schritt hat einen Prüfbefehl.

### 12.1 Secrets erzeugen und versiegeln

1. Zuerst prüfen, ob die zwei Keys bereits vorhanden sind. Bei vorhandenen Keys die Werte erhalten und zwischen beiden Dateien sicher angleichen, keine Rotation. Nur fehlende Keys erzeugen. Zwei neue Passwörter erzeugen und in beide git-crypt-Dateien mit identischem Wert eintragen
   (`environments/.secrets/fleet-mentolder.yaml` und `environments/.secrets/fleet-korczewski.yaml`,
   Entsperr-Check siehe `docs/runbooks/credentials-finden.md` §2). `task env:generate` bricht bei
   vorhandener Datei ab, deshalb von Hand anhängen:

    ```bash
    WEBSITE_PW=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
    POCKET_PW=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
    for f in fleet-mentolder fleet-korczewski; do
      printf 'WEBSITE_MASSAGE_DB_PASSWORD: "%s"\nPOCKET_ID_KORCZEWSKI_DB_PASSWORD: "%s"\n' \
        "$WEBSITE_PW" "$POCKET_PW" >> "environments/.secrets/${f}.yaml"
    done
    unset WEBSITE_PW POCKET_PW
    ```

2. Beide Umgebungen versiegeln (braucht `kubeseal` und Cluster-Zugriff auf `fleet`):

    ```bash
    task env:seal ENV=fleet-mentolder
    task env:seal ENV=fleet-korczewski
    ```

3. Prüfen, dass die Keys in den SealedSecrets stehen, dann committen und mergen lassen. Flux
   reconciled `flux-sealed-secrets-korczewski` automatisch:

    ```bash
    grep -c 'WEBSITE_MASSAGE_DB_PASSWORD' environments/sealed-secrets/fleet-mentolder.yaml environments/sealed-secrets/fleet-korczewski.yaml
    # erwartet: jeweils > 0 (workspace-secrets plus website-secrets können denselben Key enthalten)
    kubectl --context fleet -n workspace-korczewski get secret workspace-secrets -o jsonpath='{.data.POCKET_ID_KORCZEWSKI_DB_PASSWORD}' | wc -c
    # erwartet: größer 0
    ```

Nach dem zentralen shared-db-Rollout und bevor Owner-Funktionen freigegeben werden, den in p1 erweiterten Bootstrap-/Migrations-Task ausführen:

```bash
task db:migrate ENV=fleet-korczewski
```

Er muss ausschließlich `website_massage` im zentralen Namespace `workspace` initialisieren. Den idempotenten zweiten Lauf und die vorgesehenen Owner-Rechte prüfen.

### 12.2 DNS bei ipv64

Der ipv64-Updater bleibt aus. Drei A-Records setzen, Ziel ist die öffentliche IP des
fleet-Ingress (identisch zu den A-Records von `mentolder.de`):

```bash
INGRESS_IP=$(dig +short mentolder.de A | head -1); echo "$INGRESS_IP"
```

| Name | Typ | Wert | Prüfbefehl |
|---|---|---|---|
| `korczewski.de` | A | `$INGRESS_IP` | `dig +short korczewski.de A` |
| `web.korczewski.de` | A | `$INGRESS_IP` | `dig +short web.korczewski.de A` |
| `auth.korczewski.de` | A | `$INGRESS_IP` | `dig +short auth.korczewski.de A` |

Jeder `dig`-Aufruf muss genau `$INGRESS_IP` liefern. Danach das Zertifikat prüfen (Wildcard
`*.korczewski.de` plus Apex, `workspace-wildcard` in `workspace-korczewski`):

```bash
kubectl --context fleet -n workspace-korczewski get certificate workspace-wildcard
# erwartet: READY True
curl -sSI https://web.korczewski.de | head -1
# erwartet: HTTP/2 200
```

Vor dem ersten Website-Aufruf den bestehenden `tls-sync`-CronJob einmal als Job ausführen und dessen Abschluss prüfen. Er spiegelt nur nach `website-korczewski`:

```bash
kubectl --context fleet -n workspace-korczewski create job tls-sync-massage-initial --from=cronjob/tls-sync
kubectl --context fleet -n workspace-korczewski wait --for=condition=complete job/tls-sync-massage-initial --timeout=120s
kubectl --context fleet -n website-korczewski get secret korczewski-tls
```

### 12.3 Pocket-ID-Admin-Bootstrap

Einmalig nach `docs/runbooks/pocket-id-bootstrap.md`, mit diesen Abweichungen für korczewski:

- Schritt 1 unter `https://auth.korczewski.de/setup` statt `auth.localhost` (Passkey, Chromium).
- Schritt 3 und 4 mit `-n workspace-korczewski` und `--context fleet`
  (`workspace-secrets`, Job `pocket-id-client-seed`).

Der zentrale DB-Initializer legt keinen Pocket-ID-API-Key an. Den API-Key nach dem Bootstrap in der UI erstellen, sicher in der korczewski-Secret-Quelle unter `POCKET_ID_API_KEY` hinterlegen und über `env:seal` versiegeln. Keine Werte in Logs oder Tickets ausgeben. Anschließend den fehlgeschlagenen Seed-Job gezielt erneut erstellen (bestehender Bootstrap-Runbook-Pfad), ohne die suspendierte Workspace-Kustomization zu aktivieren.

Prüfung, dass der Seed-Job lief und die Clients existieren:

```bash
kubectl --context fleet -n workspace-korczewski get job pocket-id-client-seed
# erwartet: COMPLETIONS 1/1
```

### 12.4 Inhaberin-Konto und Gruppe

1. In der Pocket-ID-UI (`https://auth.korczewski.de`) Benutzerkonto der Inhaberin anlegen.
2. Gruppe `workspace-owners` anlegen (falls nicht vorhanden) und die Inhaberin zuordnen. Der
   Owner-Bereich (`/owner/*`) lässt nur Sessions mit dieser Gruppe durch (`OWNER_GROUP`).
3. Prüfung: Login unter `https://web.korczewski.de/owner/anfragen` führt über
   `auth.korczewski.de` zurück in den Owner-Bereich. Ein Konto ohne Gruppe bekommt keinen Zugriff.

Vor Freigabe außerdem rechtliche Angaben, Rechnungssteller und Steuerangaben der Praxis im Owner-Bereich pflegen und mit der bestehenden Massage-Brand-Konfiguration abgleichen. Keine korczewski-Workspace-Identität ungeprüft als Praxisdaten übernehmen.

Vorhandene Apex-Routen mit demselben Host inventarisieren. Eine konkurrierende alte `workspace-ingress-apex` kontrolliert entfernen oder deaktivieren, ohne die eingefrorene Workspace-Kustomization zu aktivieren.

### 12.5 Smoke-Test

1. Auf `https://web.korczewski.de/kontakt` eine Test-Anfrage senden (Service, Slot, Kontakt).
2. Als Inhaberin unter `/owner/anfragen` anmelden und die Anfrage annehmen. Die Bestätigung geht
   an die Gast-Adresse.
3. Unter `/owner/rechnungen` aus dem bestätigten Termin eine Rechnung erstellen
   (Nummer fortlaufend, Pflichtangaben vorhanden).
4. Test-Anfrage und Test-Rechnung per Storno/Neuausstellung bereinigen (§2, §5), nie überschreiben.
5. Im nächsten erfolgreichen zentralen Backup die beiden verschlüsselten Archive für `website_massage` und `pocket_id_korczewski` nachweisen. Ein Log mit „unkonfiguriert/übersprungen“ genügt nach Go-live nicht.

Schlägt Schritt 2 fehl, Pocket ID, Gruppenzuordnung, Seed-Clients, Callback und DB-Verbindung prüfen (§12.3, §12.4). Die öffentliche
Seite samt Anfrageformular bleibt davon unberührt.

### 12.6 Rollback

Die Rollen und Datenbanken `website_massage` und `pocket_id_korczewski` bleiben erhalten.

```bash
flux suspend kustomization flux-website-korczewski -n flux-system
flux suspend kustomization flux-korczewski-auth -n flux-system
flux get kustomizations -n flux-system | grep -E 'korczewski'
# erwartet: flux-website-korczewski und flux-korczewski-auth SUSPENDED True
```

Vor dem Go-live vorhandenen Flux-Inventarbesitz von Pocket ID, PVC und Certificate prüfen. Das alte `flux-korczewski` bleibt suspendiert. Bei späterem vollständigem Auftauen muss der Ressourcenbesitz separat geklärt werden, sonst konkurrieren Kustomizations.

Dauerhaft zurückbauen: in `flux/clusters/fleet/ks-website-korczewski.yaml` und
`flux/clusters/fleet/ks-korczewski-auth.yaml` `suspend: true` setzen (Revert-PR). Flux-Suspend per
CLI wird beim nächsten Merge der Git-Quelle nicht zurückgesetzt, wenn die Datei `suspend: true`
trägt.
