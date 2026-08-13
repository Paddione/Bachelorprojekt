# Design: reflector-annotations

## Context

Der Mishap-Fix T002880 beschreibt Drift zwischen Konfiguration und Cluster:
`prod/wildcard-certificate.yaml` deklariert vier
`reflector.v1.emberstack.eu`-Annotationen (im `secretTemplate`, damit cert-manager
sie auf das generierte Secret überträgt), aber es gibt keinen Reflector-Controller
im fleet-Cluster.

**Symptom vs. Ursache (T002448-M5), verifiziert am 2026-08-13:**
- Symptom (Fakt): Annotationen in `prod/wildcard-certificate.yaml` Zeilen 9–13
  und identisch in `prod-fleet/staging/wildcard-certificate.yaml` Zeilen 8–13.
- Belegte Ursache (nicht bloße Hypothese):
  - `kubectl --context fleet get pods -A | grep -i reflector` → keine Treffer (rc=1)
  - Kein Reflector-Manifest im Repo (kein Deployment, kein
    `emberstack/kubernetes-reflector`-Image, keine CRDs) — nur `reflector-rbac.yaml`,
    dessen Inhalt RBAC für den `tls-sync` CronJob ist (Dateiname ist Legacy)
  - Der reale Sync-Mechanismus läuft: `tls-sync` CronJob (`prod/reflector.yaml`,
    Schedule `0 3 1 * *`) kopiert das Wildcard-Secret monatlich nach
    `coturn`, `workspace-office`, `${WEBSITE_NAMESPACE}` — live vorhanden in
    `workspace`, `workspace-korczewski`, `workspace-staging`
  - Live-Secret `workspace/workspace-wildcard-tls` trägt die Annotationen als
    tote Metadaten (`kubectl get secret ... -o jsonpath='{.metadata.annotations}'`)

## Goals / Non-Goals

**Goals:**
- Konfiguration behauptet keine Automatik, die niemand betreibt
- Guard-Test, der ein Wiederaufleben der toten Annotationen verhindert
- Reale Mechanik (tls-sync CronJob) bleibt unangetastet

**Non-Goals:**
- Keine Reflector-Installation (neuer Controller im Cluster)
- Kein Umbennen von `prod/reflector.yaml` (der Legacy-Name ist harmlos, der Inhalt
  ist der reale CronJob; Umbennen wäre Churn ohne Verhaltensänderung)
- Keine Änderung des Sync-Verhaltens (CronJob-Zeitplan, Ziel-Namespaces)

## Decisions

### D1: Annotationen entfernen statt Reflector installieren

Das Ticket nennt zwei saubere Auflösungen. Gewählt: **Annotationen entfernen**.

Begründung:
1. Der Sync funktioniert bereits über den `tls-sync` CronJob — ein Reflector würde
   die Mechanik duplizieren statt sie zu ersetzen.
2. Reflector-Installation bedeutet neuen Controller (Deployment, RBAC, Image-
   Pinning, Updates, Monitoring) für einen trivialen Drift-Fix (severity=trivial,
   priority=niedrig) — unverhältnismäßig.
3. Kein aktueller Schaden: alle vier Secrets laufen synchron ab (Ticket).
4. Minimal-invasiv: entfernt ausschließlich tote Konfiguration und dokumentiert
   die reale Mechanik.

Trade-off: Die Kopien entstehen nur monatlich (CronJob), nicht kontinuierlich.
Das war auch vorher so — die Annotationen waren wirkungslos. Kein Verhalten
verschlechtert sich.

### D2: Staging-Kopie mitnehmen

`prod-fleet/staging/wildcard-certificate.yaml` trägt dieselben toten Annotationen
(mit `${WEBSITE_NAMESPACE}`). Gleiche Ursache, gleiche Korrektur — sonst bliebe
die Irreführung in der Staging-Konfiguration bestehen.

### D3: Guard-Test als Querschnittstest (grep-Modus)

Der Defekt sitzt in der Konfiguration, nicht im Laufzeitverhalten — der Test
prüft die Manifest-Quelle (erlaubte Ausnahme von T002448-M4, dokumentiert im
Test-Header). Positiv-Anker (T002356-M1): der `tls-sync` CronJob existiert in
`prod/reflector.yaml` und beide Wildcard-Manifeste deklarieren weiterhin
`kind: Certificate`, bevor die Negativ-Aussage (kein `reflector.v1.emberstack.eu`
unter `prod/`, `prod-fleet/`, `k3d/`) geprüft wird.

## Edge Cases

- `k3d/coturn-stack/coturn-cert.yaml` erwähnt Reflector nur im Kommentar
  (kein Objekt) — Kommentar wird korrigiert, Datei bleibt referenziert
  (`k3d/coturn-stack/kustomization.yaml` Zeile 15).
- `prod-fleet/staging/kustomization.yaml` Zeile 28 erwähnt „reflector annotations"
  in einem auskommentierten Patch — reine Prosa, kein `reflector.v1.emberstack.eu`-
  Vorkommen, wird vom Guard nicht erfasst; kein Handlungsbedarf.
- Wird später doch ein Reflector installiert, muss der Guard bewusst entfernt
  werden — dann sind Annotationen wieder legitim (dokumentiert im Test-Header).
