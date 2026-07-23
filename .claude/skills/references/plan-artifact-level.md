# Artefakt-Ebene: braucht der Request ein PRD davor?

Die feature/fix/chore-Wahl ist die *Pfad*-Wahl durch `dev-flow-plan`. Davor steht die
*Artefakt*-Wahl: die meisten Requests steigen direkt auf Change-Proposal-Ebene ein (Feature-Pfad
→ Schritt 3.1 `/opsx:propose`). Ein PRD ist das **schwerste** Artefakt und nur für
Epic-große Arbeit gedacht — ein PRD pro Feature kollabiert die Abstraktionsebenen und erzeugt
Mehrfach-SSOT.

| Gestalt der Arbeit | Artefakt | Bei dir konkret |
|---|---|---|
| Großes, unscharfes Produktziel, viele Features | **PRD** | `parse_prd` (task-master) — Bootstrap/Epic-Zerlegung |
| Architektur-/Technologieentscheidung | **ADR** | `manage_adr` / OpenSpec |
| *Ein* konkretes Feature, Intent klar | **Change-Proposal** | `/opsx:propose <slug>` (Feature-Pfad, Schritt 3.1) |
| Feature, aber Design noch offen | **Brainstorming → Spec** | `dev-flow-plan`, Feature-Pfad |
| Wartung, kein Verhaltenswechsel | **Chore-Ticket** | `dev-flow-chore` |
| Regression | **Fix + failing test** | `dev-flow-plan`, Fix-Pfad |

## Checkliste — PRD davor, oder direkt `openspec:propose`?

PRD davorschalten, wenn MINDESTENS EINE zutrifft:
- **Mehrere Capabilities** — der Request zerfällt in >1 OpenSpec-Change (Epic).
- **„Warum" strittig** — Problem/Zielgruppe/Erfolgsmetrik offen, nicht nur das „Wie".
- **Neues Teilprodukt/Service** — net-new Surface, keine bestehende Spec zum Anknüpfen.
- **Cross-Brand/Cross-Subsystem** mit echtem Priorisierungsbedarf.

Direkt `openspec:propose` (kein PRD), wenn ALLE zutreffen:
- Genau **eine** Capability betroffen.
- Intent klar, nur das „Wie" offen → klärt das Brainstorming (Schritt 3) ohnehin.
- Es gibt eine bestehende Spec in `openspec/specs/`, in die der Delta einfließt (oder klar genau eine neue).

> **Faustregel:** PRD nur, wenn die Arbeit größer ist als ein einzelner Change — sonst Overhead.
> Im PRD-Fall: `parse_prd` → N Tickets/Changes → für *jeden* Change wieder dieser normale Pfad.
> Das PRD bleibt **Upstream-Kontext, wird nie SSOT** (die konsolidierte `openspec/specs/`-Spec ist SSOT).
