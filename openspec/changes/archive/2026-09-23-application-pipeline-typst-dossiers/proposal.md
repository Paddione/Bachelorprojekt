# Proposal: application-pipeline-typst-dossiers

## Why

Requirement "Typst-Based Tailored Dossier Compilation" aus `openspec/changes/application-pipeline/specs/application-pipeline.md` (Phase 1, T900228) beschreibt die reine Kompilierungsmechanik (Headless-Rendering, Fail-Safe bei fehlenden Feldern), aber keine Inhalts- oder Design-Entscheidung. Der Betreiber hat 5 reale Bewerbungsentwürfe (`status=drafting`, siehe Bootstrap-Import Phase 1) noch nicht versendet, weil sie fachlich und optisch noch nicht seiner Person entsprechen — generische Vorlagen ohne individuelle Projekt-Evidenz und ohne visuelle Handschrift wirken austauschbar. Phase 3 schließt genau diese Lücke: Inhalt (welche der ~1,5 Jahre Plattform-Erfahrung passt zu welcher Stelle) und Design (Typografie/Farbakzente, die die Dossiers erkennbar individuell machen) werden zu einer wiederholbaren, testbaren Kompilierungspipeline statt manueller Ad-hoc-Textarbeit pro Bewerbung.

## What

1. **Personalisierte Content-Auswahl:** Ein kuratierter, versionierbarer Projekt-Evidenz-Katalog (`applications.evidence` oder Config-Datei — Details im Plan) verknüpft konkrete Plattform-Bausteine (Fleet/k3s, Dev-Mesh, FreeToken MoE, Software Factory, BATS-Gates) mit Stichworten, die in Stellenausschreibungen typischerweise vorkommen. Der Renderer wählt daraus die für den jeweiligen Job passendsten 3-5 Belege aus (manuelle Kuration in dieser Phase — automatisiertes Scoring ist Phase 2, eigener Plan).
2. **Design-Akzent-System:** Mindestens zwei Typst-Farbschema-/Typografie-Varianten ("Themes") für Lebenslauf und Anschreiben, wählbar über einen CLI-Parameter, damit die Dossiers eine erkennbare, konsistente visuelle Identität tragen statt einer generischen Standardvorlage.
3. **Render-Pipeline:** `scripts/vda/apply/render.sh --job-id <id> --theme <name>` kompiliert Lebenslauf + Anschreiben aus Job-Daten, ausgewählter Evidenz und Theme zu PDFs und registriert sie in `applications.dossiers` (Requirement aus Phase 1, hier konkret implementiert).
4. **Explizit nicht in dieser Phase:** Kein automatisiertes Matching/Scoring (Phase 2), keine Cockpit-UI zum Editieren der Evidenz-Auswahl (Phase 4).

_Ticket: T900230_
