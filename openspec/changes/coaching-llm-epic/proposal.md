# Proposal: Coaching-Workflow mit LLM anreichern

**Ticket:** T002649 | **Typ:** project (EPIC) | **Aufwand:** mittel
**Kinder:** T002652 (Questionnaire-Analyse), T002653 (Session-Summaries), T002654 (RAG-Assistent)

## Problem

Die Plattform ist eine Coaching-Plattform (Fragebogen-System, Coaching-Sessions, Chat), aber das
LLM-Gehirn (llm-proxy, bge-Embeddings, Knowledge Graph) wird fast ausschließlich für die Software
Factory genutzt. Das Coaching selbst profitiert nur punktuell von KI (generate.ts für einzelne
Session-Beats, coaching-classifier.ts für Buch-Chunks). Die vorhandene Infrastruktur — lokale
Embeddings, Cross-Encoder-Rerank, KI-Provider-Konfiguration, Knowledge-Collections — wird für
den eigentlichen Geschäftszweck nicht ausgeschöpft.

## Ziel

Das LLM-Infra-Asset für den Coaching-Workflow einsetzen — nicht als Ersatz des Coaches, sondern
als Assistenz-Werkzeug auf drei Ebenen:

1. **Retrospektiv (Questionnaire-Analyse):** Fragebogen-Antworten semantisch analysieren, Cluster
   bilden, Insights ins Cockpit rendern → T002652
2. **Session-begleitend (Zusammenfassungen):** Nach jeder Coaching-Session automatisch eine
   LLM-Zusammenfassung aus Transkript/Notizen erstellen → T002653
3. **Wissensbasiert (RAG-Assistent):** Coach kann das Coaching-Wissen (Books/Chunks) per Chat
   durchsuchen — Retrieval + LLM-Antwort → T002654

## Abgrenzung

- **Kein** Ersatz des Coaches durch KI — Assistenz-Werkzeug
- **Kein** autonomes Coaching (der Coach führt die Session, die KI liefert Material)
- **Keine** Echtzeit-Coachee-Interaktion (kein Chatbot für Klienten)
- Personalisierte Einsichten aus Coaching-Verläufen und Trend-Erkennung sind **zukünftige**
  Erweiterungen — nicht in diesem EPIC

## Architektur-Entscheidungen

1. **Gemeinsame Embedding-Pipeline:** Alle drei Kinder nutzen dasselbe bge-Embedding (lokal,
   CPU-only im k3d) — kein separates Embedding pro Kind.
2. **KI-Provider via bestehendes coaching-ki-config:** Die bereits existierende Provider-Auswahl
   (tickets.provider_config mit source='coaching') wird für Summaries und RAG genutzt.
3. **Knowledge-Basis via coaching.books → knowledge.collections:** Die bestehende Buch→Collection-
   Brücke (coaching-collections.ts) wird für RAG-Retrieval verwendet.
4. **Cockpit als UI-Hub:** Alle drei Kinder rendern ihre Ergebnisse im bestehenden Admin-Cockpit.

## Abhängigkeiten

- T002623 (ADR-006 SDLC-Isolation): Lokales bge-Paar muss verfügbar sein
- T002658 (S1 Retrieval-Schicht): Kontext-Retrieval-Funktion für RAG-Assistent
- Bestehendes: coaching.books, coaching.sessions, questionnaire_db, ki-config
