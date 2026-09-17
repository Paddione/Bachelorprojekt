// templates/application-pipeline/cover-letter.typ
// Anschreiben-Template für application-pipeline (Phase 3, T900230)
// Nutzt Theme-Variablen, die über --pdf-meta oder #import injiziert werden.

#let theme-file = meta.lookup("theme-file").str.or("default")

#import "themes/" + theme-file + ".typ": *

#set page(color: white, margin: (top: margin-top, bottom: margin-bottom, left: margin-left, right: margin-right))
#set text(size: size-body, font: font-sans, style: style-italic)
#set heading(
  style: (weight: weight-bold, color: color-primary),
  numbering: off,
)

// --- Kopfzeile ---
#let header(name, address, date) = {
  #text(name, weight-bold, size: size-section, color: color-primary)
  #text("\n", size: 2pt)
  #text(address, size: size-body, color: color-muted)
  #text("\n", size: 2pt)
  #text(date, size: size-body, color: color-muted)
  #block(
    rule(height: 1pt, color: color-border),
    y: 0.6em
  )
}

// --- Sektionsüberschrift ---
#let section(title) = {
  #set text(size: size-section, color: color-primary, weight: weight-bold)
  #title
  #block(
    rule(height: 1pt, color: color-border),
    y: 0.4em
  )
}

// --- Evidenz-Box (Anschreiben-spezifisch) ---
#let evidence-box(title, items) = {
  block(
    fill: box-fill,
    stroke: box-stroke,
    stroke-width: 0.5pt,
    corner-radius: box-corner-radius,
    padding: box-padding,
    column(
      (
        #set text(size: size-caption, color: color-primary, weight: weight-bold)
        #title
      ),
      (
        #set text(size: size-body, color: color-text)
        #for item in items {
          #text("  • ", style: style-italic)
          #item
          #text("\n", size: size-caption)
        }
      )
    )
  )
}

// --- Hauptinhalt ---
#let salutation = meta.lookup("salutation").str.or("Sehr geehrte Damen und Herren,")
#text(salutation, size: size-body)
#text("\n\n", size: 4pt)

let company = meta.lookup("company").str.or("Ihr Unternehmen")
let role = meta.lookup("role").str.or("die Position als Platform Engineer")
let introduction = meta.lookup("introduction").str.or(
  "hiermit bewerbe ich mich auf " + role + " bei " + company + "."
)
#text(introduction)

#text("\n\n", size: 4pt)

#section("Warum ich passe")
let motivation = meta.lookup("motivation").str.or(
  "Mit Erfahrung in Kubernetes, CI/CD-Pipelines, DevOps-Architekturen und LLM-Infrastruktur bringe ich ein breites Spektrum an Kompetenzen mit, die direkt zur Stelle passen."
)
#text(motivation)

#text("\n\n", size: 4pt)

#section("Kuratierte Projekt-Evidenz")
let evidence-items = meta.lookup("evidence-items").str.or(
  "Fleet/k3s · Dev-Mesh · FreeToken MoE · Software Factory · BATS Quality Gates"
)
text(evidence-items, color: color-text)

#text("\n\n", size: 4pt)

let closing = meta.lookup("closing").str.or(
  "Ich freue mich auf ein persönliches Gespräch und stehe Ihnen gerne zur Verfügung."
)
#text(closing)

#text("\n\n", size: 4pt)
#text("Mit freundlichen Grüßen")

#text("\n\n", size: 8pt)
#text(meta.lookup("candidate-name").str.or("Max Mustermann"), weight: weight_bold, color: color_primary)
