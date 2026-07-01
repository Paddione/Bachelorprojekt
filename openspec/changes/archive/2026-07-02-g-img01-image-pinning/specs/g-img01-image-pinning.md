# g-img01-image-pinning

## Purpose

Diese Capability stellt sicher, dass alle Fremd-Images in den Kubernetes-Manifesten des Clusters unveränderlich an einen konkreten SHA-256-Digest gebunden sind. Damit wird das Silent-Supply-Chain-Risiko durch mutable Tags eliminiert: Ein Pod-Restart zieht exakt denselben Layer-Baum wie beim letzten Commit. Renovate hält die Digests wöchentlich aktuell, sodass jede Digest-Änderung als PR mit CI-Gate sichtbar wird.

Eigene Images (`website`, `brett`, `docs`, `videovault`, `mediaviewer-widget`, `mentolder-web`) sind von diesem Scope ausgenommen, da sie per CI nach jedem Merge neugebaut werden und bewusst `:latest` tragen.

## ADDED Requirements

### Requirement: Der Mess-Command ist reproduzierbar und kann in beliebiger R

The system SHALL der Mess-Command ist reproduzierbar und kann in beliebiger Reihenfolge ausgeführt werden:
  ```bash
  grep -rhE '^[[:space:]]*-?[[:space:]]*image:' k3d/ prod*/ 2>/dev/null \
    | grep -v '@sha256' \
    | grep -vE '^[[:space:]]*#' \
    | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE' \
    | sed -E 's/.*image:[[:space:]]*//' \
    | sort -u \
    | wc -l
  ```

- REQ-2: Alle Fremd-Images in `k3d/`, `prod-fleet/`, `prod-mentolder/` und `prod-korczewski/` tragen das Format `image:tag@sha256:<64-Zeichen-Hex>`.

- REQ-3: `renovate.json5` ist so konfiguriert, dass der Renovate `kubernetes`-Manager `pinDigests: true` aktiviert hat. Damit aktualisiert Renovate bei einem Tag-Update automatisch den zugehörigen @sha256-Digest.

- REQ-4: Die Manifest-Validierung (`task workspace:validate`) läuft fehlerfrei durch, nachdem alle Image-Referenzen gepinnt wurden.

- REQ-5: Das Pinnen von `ghcr.io/paddione/collabora-code` ist mit einem Kommentar versehen, der auf die manuelle Update-Pflicht bei Collabora-Releases hinweist, da Renovate für `ghcr.io/paddione/`-Images deaktiviert ist.

- REQ-6: `bash scripts/health-goals-check.sh --only=G-IMG01` gibt Status grün zurück.

## Acceptance Criteria

- THEN liefert der Mess-Command (REQ-1) den Wert `0`.
- THEN enthält keine Manifest-Datei in `k3d/`, `prod-fleet/`, `prod-mentolder/` oder `prod-korczewski/` eine `image:`-Zeile ohne `@sha256`-Suffix (außer den bewusst ausgenommenen eigenen Images).
- THEN ist `pinDigests: true` in `renovate.json5` für den `kubernetes`-Manager aktiv und durch einen Kommentar dokumentiert.
- THEN gibt `bash scripts/health-goals-check.sh --only=G-IMG01` grün zurück.
- THEN läuft `task workspace:validate` ohne Fehler durch.
- THEN liefert `task test:changed` grüne Ergebnisse für alle betroffenen Manifest-Tests.
