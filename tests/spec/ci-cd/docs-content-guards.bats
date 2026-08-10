#!/usr/bin/env bats
#
# Guards für den ausgelieferten Docs-Inhalt.
#
# Prüfmodus: Output-Verifikation gegen das Bau-Ergebnis unter
# k3d/docs-content-built/ — jeder Guard misst den Zustand der ausgelieferten
# Artefakte (Dateiexistenz, Inhalt der gebauten HTML), nicht die Quelle des
# Generators. Ausnahme ist der erste Guard: er prüft eine Repo-Konvention
# (kein Test darf auf die abgeschalteten Docsify-Pfade zeigen), und dort ist
# Quelltext-Grep das angemessene Mittel.
#
# Hintergrund (T003142): tests/unit/test-docs-content.bats zeigte auf ein
# `k3d/docs-content`-Verzeichnis und eine Shell-HTML unter `docs-site`. Beide
# Pfade existieren nicht mehr — der Docs-Inhalt wird von scripts/build-docs.mjs
# aus docs/ nach k3d/docs-content-built/ kompiliert. Die Nadeln im ersten Guard
# werden deshalb zur Laufzeit zusammengesetzt: stünden sie wörtlich in dieser
# Datei, träfe der Scan sich selbst. 7 von 12 Assertions liefen rot, die
# übrigen 5 vakuos grün (grep auf ein fehlendes Verzeichnis, Ergebnis via
# `|| true` verschluckt).

REPO="$BATS_TEST_DIRNAME/../../.."
BUILT="$REPO/k3d/docs-content-built"

@test "kein Test referenziert die abgeschalteten Docsify-Pfade" {
  # Nadeln zur Laufzeit zusammensetzen, damit diese Datei sich nicht selbst trifft.
  local dead_docs="k3d/docs-content"; dead_docs="${dead_docs}/"
  local dead_shell="docs-site"; dead_shell="${dead_shell}/index.html"

  # Positiv-Anker: der Scan sieht überhaupt BATS-Dateien. Ohne ihn wäre die
  # folgende Negativ-Aussage vakuos, sobald der Suchpfad ins Leere zeigt.
  run bash -c "grep -rlF '@test' '$REPO/tests' --include='*.bats' | wc -l | tr -d ' '"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run bash -c "grep -rlF '$dead_docs' '$REPO/tests' --include='*.bats' || true"
  [ -z "$output" ] || { echo "Toter Docs-Pfad referenziert in: $output"; false; }

  run bash -c "grep -rlF '$dead_shell' '$REPO/tests' --include='*.bats' || true"
  [ -z "$output" ] || { echo "Tote Shell-HTML referenziert in: $output"; false; }
}

@test "live docs (docs/*.md) tragen keine veraltete Cluster-Topologie" {
  # Korpus bewusst eng: die gepflegten Top-Level-Dokumente. Eingefrorene
  # Schnappschüsse (docs/legacy-html/), Audit-Belege und Plan-Archive sind
  # historische Aufzeichnungen und dürfen die alte Topologie benennen.
  run bash -c "ls '$REPO'/docs/*.md 2>/dev/null | wc -l | tr -d ' '"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run bash -c "grep -ril 'korczewski-Cluster\|separater Cluster\|separates Cluster' '$REPO'/docs/*.md || true"
  [ -z "$output" ] || { echo "Veraltete Topologie-Bezeichnung: $output"; false; }
}

@test "jeder relative Link einer gebauten Docs-Seite zeigt auf eine existierende Datei" {
  local page="$BUILT/adr-001-fleet-konsolidierung.html"
  [ -f "$page" ]

  local targets
  targets=$(tr '>' '\n' < "$page" | grep -o 'href="\./[^"]*\.html"' | sed 's/href="\.\///; s/"$//' | sort -u)

  # Positiv-Anker: die Navigation liefert überhaupt Ziele.
  [ "$(printf '%s\n' "$targets" | grep -c .)" -gt 5 ]

  local missing=""
  while read -r t; do
    [ -n "$t" ] || continue
    [ -f "$BUILT/$t" ] || missing="$missing $t"
  done <<< "$targets"
  [ -z "$missing" ] || { echo "Tote Links:$missing"; false; }
}

@test "alle drei Quickstart-Seiten werden ausgeliefert" {
  local q
  for q in quickstart-enduser quickstart-admin quickstart-dev; do
    [ -s "$BUILT/$q.html" ] || { echo "Fehlt oder leer: $q.html"; false; return; }
  done
}

@test "jede Service-Seite trägt mindestens ein Mermaid-Diagramm" {
  # keycloak steht bewusst nicht mehr auf der Liste: Pocket ID hat Keycloak
  # abgelöst, eine keycloak-Seite wird nicht mehr gebaut.
  local pages=(nextcloud collabora talk-hpb livestream einvoice claude-code \
               vaultwarden website whiteboard mailpit monitoring shared-db)

  # Positiv-Anker: ohne ihn liefe die Schleife bei leerer Liste vakuos durch.
  [ "${#pages[@]}" -gt 0 ]

  local p
  for p in "${pages[@]}"; do
    [ -f "$BUILT/$p.html" ] || { echo "Seite fehlt: $p.html"; false; return; }
    grep -qF 'mermaid' "$BUILT/$p.html" || { echo "Kein Mermaid-Diagramm: $p.html"; false; return; }
  done
}

@test "Glossar und Decisions werden ausgeliefert und sind nicht-trivial" {
  local f words
  for f in glossary decisions; do
    [ -s "$BUILT/$f.html" ] || { echo "Fehlt oder leer: $f.html"; false; return; }
    words=$(sed 's/<[^>]*>/ /g' "$BUILT/$f.html" | wc -w | tr -d ' ')
    [ "$words" -gt 300 ] || { echo "$f.html zu dünn: $words Wörter"; false; return; }
  done
}
