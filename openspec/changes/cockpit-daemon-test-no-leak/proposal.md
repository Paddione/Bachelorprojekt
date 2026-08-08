# Proposal: cockpit-daemon-test-no-leak

## Why

`tests/spec/sdlc-cockpit/daemon-runtime-contract.bats` Test 3 hinterlässt bei **jedem** Lauf einen
Node-Prozess auf `127.0.0.1:39199`. In dieser Session dreimal unabhängig beobachtet.

Ursache (gemessen): `npx tsx` erzeugt eine vierstufige Prozesskette (`npm exec` → `sh -c` →
`node cli.mjs` → `node server.ts`). Der Test merkt sich `$!` — also nur die oberste Ebene — und
beendet beim Aufräumen den Wrapper, während der Server weiterläuft.

Das ist nicht bloß Unordnung: Ein geleakter Daemon antwortet weiter auf `/health` und lässt damit
jeden Erreichbarkeits-Anker bestehen, obwohl er in ein längst gelöschtes `BATS_TEST_TMPDIR`
schreibt. Bei T002721 hat genau dieses Bild zeitweise wie ein Implementierungsfehler ausgesehen.
Zudem findet der nächste Lauf den Port belegt — eine von T002708 unabhängige zweite Quelle der in
T002602 als „flaky" beschriebenen Rotfärbung.

## What

- **Start über `./node_modules/.bin/tsx`** statt `npx tsx` (so macht es auch der
  `cockpit:daemon`-Task) — verkürzt die Prozesskette.
- **Beenden über die PID, die der Daemon selbst schreibt**, gelesen aus einem per
  `COCKPIT_DAEMON_STATE_DIR` isolierten Verzeichnis (seit T002721 möglich). Nebeneffekt: der Test
  überschreibt nicht mehr `/tmp/cockpit-daemon.*` eines echten Entwickler-Daemons.
- **Beide Enden beenden** (Wrapper und Server), damit auch ein Abbruch vor dem Schreiben der
  PID-Datei nichts zurücklässt.
- **Guard**: `tests/spec/sdlc-cockpit/daemon-test-no-leak.bats` führt den fraglichen Lauf aus und
  misst danach, ob noch jemand auf dem Port lauscht.

_Ticket: T002724_
