## ADDED Requirements

### Requirement: Tandem-Kleinstmodell-Evaluation ist dokumentiert

The system SHALL eine begründete Modell-/Rollen-Empfehlung für Tandem-
Kleinstmodelle (≤ 8B) zum FreeToken-Residentmodell pflegen, gestützt auf
eine strukturierte Kandidaten-Matrix und einen Trainingsplan je Empfehlung.

#### Scenario: Kandidaten-Matrix deckt alle Rollen ab

- **GIVEN** die Kandidaten-Matrix `docs/finetune/tandem-candidates.json`
- **WHEN** sie gegen die drei Rollen (draft, router, worker) geprüft wird
- **THEN** enthält jede Rolle mindestens einen bewerteten Kandidaten mit Verdict

#### Scenario: Draft-Empfehlung respektiert Tokenizer-Match

- **GIVEN** ein Kandidat ist als Draft-Modell empfohlen
- **WHEN** seine Kriterien geprüft werden
- **THEN** ist Tokenizer/Vocab-Kompatibilität mit dem Residentmodell
  als erfüllt dokumentiert (hartes Kriterium)

#### Scenario: Empfehlungen bleiben innerhalb der Ressourcengrenzen

- **GIVEN** alle empfohlenen Modelle
- **WHEN** ihre Parameterzahl und ihr QLoRA-Trainingsfit geprüft werden
- **THEN** liegt jeder bei ≤ 8B Parametern mit GGUF-Exportfähigkeit
  und VRAM-Fit auf 16 GB geteilt mit Serving
