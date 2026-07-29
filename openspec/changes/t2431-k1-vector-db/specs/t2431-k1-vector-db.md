## ADDED Requirements

### Requirement: K1 Vector DB Visualization
The system SHALL maintain a documentation file `docs/diagrams/k1-vector-db.md` visualizing the K1 vector database component.

#### Scenario: Documentation verification
- **GIVEN** the documentation file `docs/diagrams/k1-vector-db.md`
- **WHEN** it is parsed
- **THEN** it SHALL contain a Mermaid diagram visualizing `code_embeddings` and `knowledge.chunks` tables, and describe their models (`bge-m3`, `voyage-multilingual-2`), dimensions, and readers/writers.
