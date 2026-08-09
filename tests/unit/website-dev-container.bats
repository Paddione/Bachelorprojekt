#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# website-dev-container.bats — Guards für den lokalen Dev-Container (T003055)
# ═══════════════════════════════════════════════════════════════════
# PRÜFMODUS (Konvention T002448-M4):
#   • Die Entrypoint-Tests sind ECHTE Output-Verifikation — sie FÜHREN
#     website/docker-entrypoint.dev.sh mit `env` als CMD aus und prüfen die
#     resultierende Prozessumgebung bzw. den Exit-Code. Kein Source-Grep.
#   • Die Dockerfile-/Compose-Tests greifen per grep auf die Konfigurationsdatei
#     zu. Das ist die in CLAUDE.md benannte Ausnahme: ihr Ergebnis manifestiert
#     sich ausschließlich im Quelltext (Build-Konfiguration). Die Muster sind
#     bewusst formatfrei (grep -F, keine Zeilenanker), damit sie an
#     Umformatierungen nicht zerbrechen (Konvention T002716).
#
# Hintergrund: `astro dev` auf dem Host scheitert an website/src/lib/auth.ts:13,
# weil Vite die .env nur nach import.meta.env lädt, auth.ts den Wert aber aus
# process.env liest. Der Container löst das über env_file.
# ═══════════════════════════════════════════════════════════════════

load test_helper

ENTRYPOINT="${PROJECT_DIR}/website/docker-entrypoint.dev.sh"
DOCKERFILE_DEV="${PROJECT_DIR}/website/Dockerfile.dev"
COMPOSE_DEV="${PROJECT_DIR}/compose.dev.yaml"

# ── Entrypoint: ausgeführt, nicht gegreppt ───────────────────────

@test "entrypoint schreibt DATABASE_URL auf den Docker-Host um" {
  # Die .env zeigt auf 127.0.0.1-Ports des Hosts (kubectl port-forward). Im
  # Container ist 127.0.0.1 ein anderer Netzwerk-Namespace — ohne Umschreiben
  # findet der Dev-Server die Datenbank nicht.
  [[ -f "$ENTRYPOINT" ]] || fail "website/docker-entrypoint.dev.sh nicht gefunden"

  run env POCKET_ID_WEBSITE_SECRET=dummy \
          DATABASE_URL='postgresql://u:p@127.0.0.1:5432/website' \
          bash "$ENTRYPOINT" env
  assert_success
  assert_output --partial 'DATABASE_URL=postgresql://u:p@host.docker.internal:5432/website'
}

@test "entrypoint laesst SITE_URL auf localhost stehen" {
  # Zusicherung MIT Positiv-Anker (Konvention T002356-M1): Der erste Teil belegt,
  # dass das Umschreiben ueberhaupt stattfindet. Ohne ihn wuerde dieser Test auch
  # dann gruen sein, wenn die Umschreib-Logik komplett fehlte.
  #
  # Sachlich: SITE_URL wird an den BROWSER ausgeliefert (OIDC redirect_uri).
  # host.docker.internal ist auf dem Host nicht aufloesbar — ein Umschreiben
  # wuerde den Login-Rueckkanal brechen.
  run env POCKET_ID_WEBSITE_SECRET=dummy \
          DATABASE_URL='postgresql://u:p@127.0.0.1:5432/website' \
          SITE_URL='http://localhost:4321' \
          bash "$ENTRYPOINT" env
  assert_success

  # Positiv-Anker: das Umschreiben funktioniert grundsaetzlich
  assert_output --partial 'host.docker.internal'
  # Die eigentliche Zusicherung: SITE_URL blieb unangetastet
  assert_output --partial 'SITE_URL=http://localhost:4321'
}

@test "entrypoint bricht ohne OIDC-Secret mit klarer Meldung ab" {
  # Ohne diesen Guard wuerde der Fehler erst tief im Vite-Modulgraphen auftreten,
  # mit einem Stacktrace voller node_modules-Frames (exakt der gemeldete Fall).
  run env -u POCKET_ID_WEBSITE_SECRET -u WEBSITE_OIDC_SECRET \
          bash "$ENTRYPOINT" env
  assert_failure
  assert_output --partial 'POCKET_ID_WEBSITE_SECRET'
}

@test "entrypoint akzeptiert das Legacy-Secret WEBSITE_OIDC_SECRET" {
  # auth.ts:7 liest beide Namen — der Guard darf nicht strenger sein als der Code,
  # den er schuetzt.
  run env -u POCKET_ID_WEBSITE_SECRET WEBSITE_OIDC_SECRET=dummy \
          bash "$ENTRYPOINT" env
  assert_success
}

# ── Dockerfile.dev: Build-Konfiguration ──────────────────────────

@test "Dockerfile.dev kopiert den Entrypoint mit Executable-Bit" {
  # Ohne --chmod bricht der Container mit Exit 126 ab:
  # "exec /usr/local/bin/dev-entrypoint failed: Permission denied".
  # Real passiert beim Bau dieses Containers.
  [[ -f "$DOCKERFILE_DEV" ]] || fail "website/Dockerfile.dev nicht gefunden"

  run grep -F -- '--chmod=755' "$DOCKERFILE_DEV"
  assert_success
}

@test "Dockerfile.dev setzt COREPACK_HOME fuer den Versions-Pin" {
  # `corepack prepare --activate` laeuft als root, der Container als `node`.
  # Ohne ein fuer beide lesbares COREPACK_HOME findet corepack die Aktivierung
  # nicht und faellt STILL auf die neueste pnpm-Version zurueck — der Pin auf
  # 10.15.0 waere wirkungslos, ohne dass etwas fehlschlaegt. Real beobachtet:
  # 11.21.0 im laufenden Container trotz korrekter prepare-Zeile.
  run grep -F 'COREPACK_HOME' "$DOCKERFILE_DEV"
  assert_success

  # Positiv-Anker: der Pin selbst ist ueberhaupt vorhanden.
  run grep -F 'pnpm@10.15.0' "$DOCKERFILE_DEV"
  assert_success
}

@test "Dockerfile.dev baut NICHT und bleibt damit vom Prod-Image abgegrenzt" {
  # Positiv-Anker zuerst: die Datei installiert ueberhaupt Abhaengigkeiten.
  # Ohne ihn waere die Negativ-Aussage bei einer leeren Datei trivial erfuellt.
  run grep -F 'pnpm install' "$DOCKERFILE_DEV"
  assert_success

  # Die Zusicherung: kein Produktionsbuild. `pnpm run build` wuerde den Code
  # einfrieren und Live-Reload aushebeln — das ist Aufgabe von website/Dockerfile.
  #
  # Kommentarzeilen werden ausgefiltert: Dockerfile.dev ERWAEHNT den Prod-Build in
  # seinem Abgrenzungs-Kommentar. Ohne den Filter macht ausgerechnet die
  # Dokumentation diesen Test rot (real passiert).
  run bash -c "grep -v '^[[:space:]]*#' '$DOCKERFILE_DEV' | grep -cF 'pnpm run build'"
  assert_output '0'
}

@test "website/Dockerfile (Prod) bleibt ein Build-Image" {
  # Gegenprobe zum vorigen Test: belegt, dass die Unterscheidung real ist und
  # nicht bloss daran haengt, dass irgendwo 'pnpm run build' fehlt.
  run grep -F 'pnpm run build' "${PROJECT_DIR}/website/Dockerfile"
  assert_success
}

# ── compose.dev.yaml: Laufzeit-Verdrahtung ───────────────────────

@test "compose maskiert node_modules mit einem eigenen Volume" {
  # Ohne dieses Volume schlaegt der Host-Ordner durch den Bind-Mount durch. Die
  # Pakete dort sind ggf. fuer glibc gebaut, der Container laeuft auf musl —
  # native Module (esbuild, sharp) brechen dann mit "invalid ELF header".
  [[ -f "$COMPOSE_DEV" ]] || fail "compose.dev.yaml nicht gefunden"

  run grep -F '/app/node_modules' "$COMPOSE_DEV"
  assert_success
}

@test "compose mountet .lavish fuer die cockpit-Symlinks" {
  # website/public/cockpit/* sind Symlinks nach ../../../.lavish/ — vom Container
  # aus /.lavish/. Ohne den Mount zeigen sie ins Leere und /cockpit/ liefert 404,
  # waehrend auf dem Host alles korrekt aussieht.
  run grep -F '/.lavish' "$COMPOSE_DEV"
  assert_success
}

@test "compose reicht host.docker.internal in den Container" {
  # Ohne extra_hosts existiert der Name im Container nicht und das Umschreiben
  # des Entrypoints liefe in eine unaufloesbare Adresse.
  run grep -F 'host-gateway' "$COMPOSE_DEV"
  assert_success
}

@test "compose bindet Port 4321" {
  # Nicht frei waehlbar: website/.env setzt SITE_URL=http://localhost:4321, und
  # daraus baut auth.ts die OIDC-redirect_uri. Ein abweichender Port bricht den
  # Login-Rueckkanal.
  run grep -F '4321:4321' "$COMPOSE_DEV"
  assert_success
}

@test "compose liest website/.env als env_file" {
  # Der Kern der ganzen Uebung: env_file legt die Variablen in die
  # PROZESSUMGEBUNG, wo process.env sie sieht. Vite allein wuerde sie nur nach
  # import.meta.env laden — genau daran scheitert `pnpm dev` auf dem Host.
  run grep -F 'website/.env' "$COMPOSE_DEV"
  assert_success
}
