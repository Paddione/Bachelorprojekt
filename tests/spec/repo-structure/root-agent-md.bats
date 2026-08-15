# tests/spec/repo-structure/root-agent-md.bats
# Prüfmodus: Querschnitt über den Dateisystem-Zustand des Arbeitsbaums — das Ergebnis
# manifestiert sich ausschließlich im Repo-Zustand (T002448-M4-Ausnahme für
# Dokumentationskonventionen). Positiv-Anker zuerst (T002356-M1): der gültige Fall
# (Persona-Dateien unter docs/agent-context) muss durchlaufen, sonst ist die
# Negativ-Aussage (keine Root-Persona-MDs) vakuos.
# Gehört zum OpenSpec-Change repo-structure-reorg (T006999), SSOT-Spec-Slug: repo-structure.

@test "Persona-MDs: konsolidiert unter docs/agent-context, nicht mehr in der Root" {
  # Positiv-Anker: Zielzustand vorhanden
  [ -f docs/agent-context/persona.md ]
  [ -f docs/agent-context/user.md ]
  [ -f docs/agent-context/heartbeat.md ]
  # Negativ-Aussage: Root-Persona-Dateien sind entfernt
  for f in SOUL.md IDENTITY.md USER.md HEARTBEAT.md; do
    [ ! -e "$f" ]
  done
}

@test "QWEN.md: Zeiger auf CLAUDE.md statt Kontext-Duplikat" {
  [ -f QWEN.md ]
  grep -qF 'CLAUDE.md' QWEN.md
}
