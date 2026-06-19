---
ticket: T000946
status: active
effort: large
model: opus
areas: [website, admin]
---
# Plan: SchemaEditor Objekt-List-Renderer vor Datenkorruption schützen

## Goal
SchemaEditor.svelte behandelt alle `list`-Felder als string[] und zerstört Objekt-Arrays (faq, pricing, sections, process) beim Speichern. Objekt-List-Branch implementieren.

## Files
- `website/src/components/admin/SchemaEditor.svelte:144-174` — list-Branch (Hauptfix)
- `website/src/lib/schemas/service.ts:64-71` — Schema-Definition (faq als {question,answer})
- `website/src/config/brands/mentolder.ts` — Testdaten

## Steps
- [ ] M1: Objekt-List-Erkennung: wenn `field.fields` existiert → Objekt-Modus
- [ ] M2: Sub-Form-Rendering: pro List-Item Sub-Felder rendern (analog zu `group`-Branch)
- [ ] M3: Add/Remove für Objekt-Items mit korrektem Field-Shape
- [ ] M4: Unit-Test: SchemaEditor mit serviceSchema + Coaching-Content mounten, auf [object Object] prüfen
