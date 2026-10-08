---
title: p3-reminders — Termin-Erinnerungen per Cron (Handler + CronJob)
ticket_id: T901025
domains: [website, k8s-cron]
status: draft
---

# notify-reminders — Implementation Plan (Partial p3-reminders)

## File Structure

| Datei | Art | Zweck |
|---|---|---|
| `components/website/src/pages/api/cron/appointment-reminders.ts` | neu | Bearer [REDACTED] Cron-Handler: findet bestaetigte Termine in ~24h, versendet je eine werbefreie Erinnerung via p1-Lib, Dedupe gegen Doppelversand |
| `k3d/appointment-reminders-cronjob.yaml` | neu | CronJob-Manifest nach notify-unread-Muster, stuendlicher Schedule |
| `k3d/kustomization.yaml` | +1 Zeile | Ressource eintragen (S4-Orphan-Schutz) |

Ausfuehrungsvoraussetzung: p1-Lib (`components/website/src/lib/appointment-notify.ts`) ist gemergt.
Der Handler importiert die p1-Sendefunktion; deren exakte Exportnamen gleicht die
implementierende Person vor Task 1 mit dem p1-Partial ab. Ohne p1 bleibt der Handler
Rot (tsc-Fehler auf den p1-Import), die Manifest-Tasks 2–3 sind davon unabhaengig.

<!-- vitest: kein neuer Test nötig, weil dieses Partial nur 3 Dateien umfasst und der Handler
dünne Orchestrierung ist — Auswahl-/Sendelogik wird von den p1-Lib-Tests
(appointment-notify.test.ts) und der BATS-Spec (tests/spec/notify-reminders.bats,
Geschwister-Partial) abgedeckt. -->

## S1-Budget-Notizen

- `components/website/src/pages/api/cron/appointment-reminders.ts` ist neu (Ist 0,
  nicht-baselined, `.ts`-Limit 900 gemaess `docs/code-quality/gates.yaml`) mit Budget 900;
  Zielgroesse ≤ 150 Zeilen, angelehnt an `notify-unread.ts` (124 Zeilen).
- `k3d/appointment-reminders-cronjob.yaml` ist neu; YAML steht nicht in `s1.limits`,
  daher keine S1-Schranke.
- `k3d/kustomization.yaml` (Ist 141, nicht-baselined) bekommt genau eine
  Ressourcenzeile; YAML steht nicht in `s1.limits`, daher keine S1-Schranke.
- CQ02: Ist 0 explizite `any` in `components/website/src`; der Handler bleibt
  voll typisiert, kein `as any`, kein `catch (e: any)`.
- S2: Der Handler importiert nur p1-Lib, `lib/db-pool`, `pages/api/_errors`
  (gleiche Richtung wie `notify-unread.ts`); kein Rueck-Import, kein neuer Zyklus.
- S3: Keine Brand-Domain-Literale; Links via `SITE_URL`/`BRAND_NAME`-Env, Cluster-DNS
  via `website.${WEBSITE_NAMESPACE}.svc.cluster.local` (Env-Registry-Muster).

## Task 1: Cron-Handler `appointment-reminders.ts` anlegen

Ziel: Bearer [REDACTED] POST-Endpunkt, der bestaetigte Termine im Erinnerungsfenster
genau einmal erinnert und alle anderen Zustaende ausschliesst.

Steps:

1. Rot-Nachweis vor der Implementierung: `curl -s -o /dev/null -w '%{http_code}'
   -X POST http://localhost:4321/api/cron/appointment-reminders` gegen die
   laufende Dev-Website liefert 404 (expected: FAIL — Route existiert noch nicht).
   Danach p1-Vertrag pruefen: `npx vitest run
   components/website/src/lib/__tests__/appointment-notify.test.ts` muss gruen sein.
2. Datei nach dem Vorbild `components/website/src/pages/api/cron/notify-unread.ts`
   anlegen, nur `POST` exportieren (Astro beantwortet andere Methoden mit 405).
3. Bearer [REDACTED] fail-closed nach dem neueren `error-log-retention.ts`-Vorbild
   uebernehmen: `if (!CRON_SECRET || auth !== 'Bearer ' + CRON_SECRET)` antwortet
   mit 403; fehlendes `CRON_SECRET` oeffnet den Endpunkt nie.
4. Kandidaten per SQL aus `inbox_items` lesen: `payload.state = 'bestaetigt'`,
   `slotStart` im Fenster `(NOW() + INTERVAL '23 hours', NOW() + INTERVAL '25 hours']`,
   Erinnerungsmarker fehlt. Fenster plus stuendlicher Schedule nach Task 2 lassen
   jeden Slot hoechstens zweimal einlaufen; der Marker macht den Versand idempotent.
5. Zeilen mit `toAppointmentRequest`/`getRequestState` aus `lib/appointment-requests.ts`
   mappen; alles ausser `bestaetigt` verwerfen. Damit bekommen `storniert`,
   `abgelehnt` und `offen` keine Erinnerung, vergangene Termine fallen durch die
   Fensteruntergrenze heraus.
6. Pro Kandidat: Marker atomar setzen
   (`UPDATE inbox_items SET payload = payload || '{"reminderSentAt": ...}'
   WHERE id = $1 AND payload->>'reminderSentAt' IS NULL`), nur bei gesetztem Marker
   via p1-Lib senden. Schlaegt der Versand fehl, Marker zuruecksetzen (Retry im
   naechsten Lauf), Fehler sammeln, Schleife fortsetzen statt abbrechen. Falls die
   p1-Migration (`20261008_appointment_notify.sql`) einen eigenen Marker (Spalte oder
   Tabelle) definiert, diesen statt des Payload-Felds verwenden.
7. JSON-Antwort `{ remindersSent, skipped, failed }`, Erfolg via
   `locals.requestLogger.info`, Fehlerpfad via `errorResponse` (Muster notify-unread).

Akzeptanzkriterien:

- POST ohne oder mit falschem Bearer [REDACTED] antwortet 403; ohne gesetztes
  `CRON_SECRET` antwortet jeder Aufruf 403.
- Bestaetigter Termin mit `slotStart` in ~24h erhaelt genau eine werbefreie
  Erinnerungs-Mail; ein zweiter Lauf innerhalb des Fensters sendet nichts erneut.
- Termine mit Zustand `storniert`, `abgelehnt` oder `offen` sowie Termine mit
  `slotStart` in der Vergangenheit erhalten keine Erinnerung.
- Fehlgeschlagener Einzelversand blockiert die uebrigen Erinnerungen nicht und
  erscheint in `failed` plus Server-Log.
- `npx tsc --noEmit -p components/website` (bzw. der im Repo konfigurierte
  Typecheck) ist gruen; keine neuen `any`.

## Task 2: CronJob-Manifest `appointment-reminders-cronjob.yaml` anlegen

Ziel: K8s-CronJob, der den Handler aus Task 1 stuendlich aufruft.

Steps:

1. Manifest nach `k3d/notify-unread-cronjob.yaml` aufbauen: `name:
   appointment-reminders`, `namespace: workspace`, Label `app: cronjobs`,
   `concurrencyPolicy: Forbid`.
2. Schedule `"15 * * * *"` mit `timeZone: "Europe/Berlin"` setzen (stuendlich,
   Viertelstunde versetzt gegen Top-of-Hour-Last); dazu `successfulJobsHistoryLimit:
   3`, `failedJobsHistoryLimit: 1`, `ttlSecondsAfterFinished: 3600` nach dem
   geharteten `cronjob-scheduled-publish.yaml`-Vorbild.
3. Container mit gepinntem Image
   `curlimages/curl:8.21.0@sha256:7c12af72ceb38b7432ab85e1a265cff6ae58e06f95539d539b654f2cfa64bb13`,
   SecurityContext (non-root 65534, seccomp RuntimeDefault, `drop: [ALL]`,
   `allowPrivilegeEscalation: false`), Resources 10m/32Mi mit Limit 64Mi.
4. POST per curl an
   `http://website.${WEBSITE_NAMESPACE}.svc.cluster.local/api/cron/appointment-reminders`
   mit `-H "Authorization: Bearer $${CRON_SECRET}"`; HTTP-Code loggen und Body bei
   Fehlschlag nach stderr schreiben (Diagnose-Muster aus scheduled-publish, kein
   stummes `curl -sf`).
5. `CRON_SECRET` per `secretKeyRef` aus `workspace-secrets` beziehen; keinen Secret-
   Wert ins Manifest schreiben.
6. Review-Hinweis im PR vermerken: `notify-unread` ist per T016592 suspendiert;
   falls die dortige E-Mail-Sperre noch gilt, klaert der Review, ob auch dieser
   CronJob initial mit `suspend: true` gemergt wird.

Akzeptanzkriterien:

- `kubectl apply --dry-run=client -f k3d/appointment-reminders-cronjob.yaml`
  validiert; kein `:latest`-Image, keine Brand-Domain im Manifest (S3).
- Schedule feuert stuendlich in Europe/Berlin; `concurrencyPolicy: Forbid`
  verhindert ueberlappende Laeufe und damit Doppelversand auf Job-Ebene.

## Task 3: Ressource in `k3d/kustomization.yaml` eintragen

Ziel: S4-Orphan-Verletzung vermeiden — das Manifest aus Task 2 referenzieren.

Steps:

1. In der `resources`-Liste von `k3d/kustomization.yaml` direkt nach den
   CronJob-Zeilen (`notify-unread-cronjob.yaml`, `cronjob-scheduled-publish.yaml`,
   `error-log-retention-cronjob.yaml`, `llm-proxy-log-retention-cronjob.yaml`) die
   Zeile `- appointment-reminders-cronjob.yaml` ergaenzen.
2. Keine weiteren Aenderungen an der Datei (genau +1 Zeile).

Akzeptanzkriterien:

- `kustomize build k3d` (bzw. `task workspace:validate`) enthaelt den
  `appointment-reminders`-CronJob; der S4-Orphan-Check meldet das neue Manifest nicht.

## Task 4: Verifikation und Artefakt-Frische

Ziel: Tests, Gates und generierte Artefakte auf den Stand dieses Partials bringen.

Steps:

1. `task test:changed` ausfuehren: gezielte Tests plus Quality-Gates muessen gruen sein.
2. `task freshness:regenerate` ausfuehren: generierte Artefakte aktualisieren
   (keine neue Testdatei in diesem Partial, daher kein Inventar-Delta erwartet).
3. `task freshness:check` ausfuehren: CI-Aequivalent aus Freshness,
   `quality:check` (S1–S4-Ratchet) und Baseline-Assertion muss gruen sein.
4. CQ02-Nachweis:
   `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`.
5. `task workspace:validate` ausfuehren: Manifest-Aenderung validieren.

Akzeptanzkriterien:

- Alle fuenf Kommandos laufen ohne Fehler durch; `baseline.json`-Key-Count ist
  unveraendert (kein Baseline-Wachstum).
