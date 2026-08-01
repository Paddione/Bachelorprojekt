#!/usr/bin/env bats
# tests/spec/brain-foundation/k1-vector-db-doc.bats — K1-Vektorspeicher-Dokumentation [T002521]
#
# Prüfmodus: SOURCE-GREP, bewusst gewählt. Der geprüfte Gegenstand IST eine Datei mit
# bestimmtem Inhalt an einem bestimmten Ort — es gibt kein Laufzeitverhalten, das man statt
# dessen messen könnte. Das ist die in CLAUDE.md genannte Ausnahme von der
# Output-Verifikations-Regel (Dokumentationskonventionen).
#
# Herkunft: Der ursprüngliche Test lag auf einem nie gemergten Branch unter dem
# ticket-nummerierten Pfad tests/spec/t2431-k1-vector-db/verify.bats. Ticket-nummerierte
# Dateien sind laut Konvention T002416 nicht mehr zulässig, deshalb liegt er jetzt unter dem
# Spec-Slug brain-foundation — der Spec, zu deren Epic (T002430) K1 gehört.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  DOC="$PROJECT_DIR/docs/diagrams/k1-vector-db.md"
}

@test "T002521: K1-Vektorspeicher-Dokumentation liegt unter docs/diagrams/" {
  [ -f "$DOC" ]
}

@test "T002521: K1-Dokumentation benennt die vier pgvector-Tabellen" {
  # Der inhaltliche Kern der K1-Analyse: welche Tabellen existieren, wer schreibt, wer liest.
  # Fehlt eine, ist das Diagramm unvollständig und K8 (T002438) kann nicht darauf aufbauen.
  grep -q 'code_embeddings' "$DOC"
  grep -q 'knowledge.chunks' "$DOC"
  grep -q 'ticket_embeddings' "$DOC"
  grep -q 'knowledge.collections' "$DOC"
}

@test "T002521: das Design-Dokument verweist auf den neuen Ort statt den Inhalt zu duplizieren" {
  design="$PROJECT_DIR/docs/superpowers/specs/2026-07-28-sdlc-cockpit-design.md"
  [ -f "$design" ]

  # Positiv-Anker zuerst: der Verweis existiert. Ohne ihn bestünde die Negativ-Aussage
  # unten auch dann, wenn der Abschnitt schlicht ersatzlos gelöscht worden wäre.
  run grep -c 'docs/diagrams/k1-vector-db.md' "$design"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Negativ: der Inhalt liegt nicht mehr doppelt im Design-Dokument. Geprüft an der
  # Datenfluss-Tabelle, die den Kern des umgezogenen Abschnitts ausmacht.
  run grep -c 'knowledge.collections' "$design"
  [ "$output" = "0" ]
}
