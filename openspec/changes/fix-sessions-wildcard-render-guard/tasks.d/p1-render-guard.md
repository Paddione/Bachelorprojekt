# Partial p1-render-guard: shared Helper + Einbindung in beide Render-Pfade

## Focus
Gemeinsames Helper-Skript `scripts/render-guard.sh` (fail-closed) und dessen
Aufruf in `scripts/flux-render-artifact.sh` (`render_component`, beide Zweige)
sowie im prod-Zweig von `workspace:deploy` in `Taskfile.yml` (Temp-Datei +
`|| exit 1`, damit kein Teil-Manifest appliziert wird).

## Touched Files
- scripts/render-guard.sh
- scripts/flux-render-artifact.sh
- Taskfile.yml

## Steps
1. `scripts/render-guard.sh` anlegen (ausfuehrbar): fail-closed Checks auf
   gerenderten Manifesten — `"*."`/`'*.'` (Datei-weit), `${VAR}`-Reste in
   `dnsNames:`-Bloecken sowie leere/`${VAR}`-Hosts in `Host()`/`HostRegexp()`.
   Datei-Modus (`<file> [...]`) + `--stdin`-Filtermodus; Exit 0/1/2.
2. `scripts/flux-render-artifact.sh`: `render-guard.sh "$out"` in
   `render_component` hinter beiden Schreib-Zweigen aufrufen (T900029-Kommentar).
3. `Taskfile.yml` (prod-Zweig `workspace:deploy`): Pipe in Temp-Datei
   umleiten, `bash scripts/render-guard.sh "$_guard_tmp" || exit 1`, dann
   `kubectl apply`; Temp-Datei entfernen.
4. Pruefen: `bash -n` auf beide Skripte; `SESSIONS_DOMAIN=""`-Render muss mit
   Guard-Meldung abbrechen (Exit 1), gesunder Render passiert.
