# Proposal: application-pipeline

## Why

Der Betreiber bewirbt sich in Kürze auf anspruchsvolle IT-Positionen (Senior Platform Engineer, DevOps/SRE, AI Systems Engineer). Die letzten 1,5 Jahre intensiver Aufbauarbeit der Bachelorprojekt-Plattform (k3s-Fleet, Dev-Mesh, FreeToken MoE, Multi-Agent Software Factory, PostgreSQL-SSOT, BATS-Qualitäts-Gates) stellen einen außergewöhnlichen, nachweisbaren Erfahrungsschatz dar.

Ein statischer Standard-Lebenslauf kann diese dynamische, tiefgreifende Kompetenz nicht adäquat vermitteln. Die beste Demonstration technischer Exzellenz ist eine plattformeigene, hochgradig automatisierte Bewerbungsprozess-Pipeline (`applications.*`), die als lebender Showcase für Recruiter und Tech-Leads fungiert:
1. **Verbindung von Agentic AI (A) und robuster Infrastruktur (C)**: Die Plattform analysiert Stellenausschreibungen, gleicht sie semantisch gegen den realen Wissens- und Projektschatz ab und generiert passgenaue Unterlagen.
2. **Qualität vor Masse**: Statt generischer Massenbewerbungen synthetisiert das System für jede Position eine maßgeschneiderte Bewerbung, die exakt die geforderten Schwerpunkte anhand realer Repo-Artefakte belegt.
3. **Visuelle & zeitliche Kontrolle**: Der gesamte Bewerbungs-Funnel wird im internen Cockpit strukturiert verwaltet.

## What

1. **Datenmodell & Ingest (`applications.*`)**:
   - PostgreSQL-Schema mit den Tabellen `applications.jobs` (Stellenausschreibungen und extrahierte Metadaten), `applications.dossiers` (generierte Lebensläufe und Anschreiben) sowie `applications.timeline` (Interaktionen und Status-Events).
   - Ingest-Tooling über CLI (`scripts/vda/apply/ingest.sh`) zur Erfassung von Stellenausschreibungen aus Text, Markdown oder URLs.
2. **Skill-Graph Matching & Profil-Synthese**:
   - Strukturierter Abgleich extrahierter Stellenanforderungen gegen den Kompetenzkatalog der Plattform (k3s-Fleet, Dev-Mesh, FreeToken MoE, Agentic Workflows, Python, TypeScript, BATS, PostgreSQL).
   - Berechnung eines Match-Scores und Bestimmung der optimalen Bewerbungsstrategie ("Winning Angle").
3. **Headless Artefakt-Generator (Typst)**:
   - Moderne, typografisch hochwertige Typst-Templates für Lebenslauf und Anschreiben.
   - Dynamisches Rendern der projektrelevanten Abschnitte und Kompilierung zu fertigen PDF-Dossiers.
4. **Brett / Cockpit Integration**:
   - Kanban-Board-Integration in `components/brett/` zur visuellen Verwaltung der Pipeline-Stadien (`Gefunden` → `In Vorbereitung` → `Eingereicht` → `Erstgespräch` → `Tech-Interview` → `Angebot`).
5. **Explizit nicht in diesem Change**:
   - Kein unüberwachter Vollversand: Das Absenden von Bewerbungen bleibt zwingend menschgesteuert (Human-in-the-loop).

_Ticket: T900228_
