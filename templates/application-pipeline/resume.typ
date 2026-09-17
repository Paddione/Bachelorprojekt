// templates/application-pipeline/resume.typ
// Lebenslauf-Template für application-pipeline (Phase 3, T900230)
// Nutzt Theme-Variablen, die über --pdf-meta oder #import injiziert werden.

#let theme-file = meta.lookup("theme-file").str.or("default")

#import "themes/" + theme-file + ".typ": *

#set page(color: white, margin: (top: margin-top, bottom: margin-bottom, left: margin-left, right: margin-right))
#set text(size: size-body, font: font-sans)
#set heading(
  style: (weight: weight-bold, color: color-primary),
  numbering: off,
  formats: (
    first: (size: size-section, color: color-primary, weight: weight-bold),
  ),
)

// --- Kopfzeile ---
#let header(name, role, contact) = {
  #set text(size: size-title, color: color-primary)
  #text(name, weight-bold)
  #text(" ", size: 0)
  #text(role, color: color-accent)

  #set text(size: size-caption, color: color-muted, style: style-italic)
  #contact
  #block(
    rule(height: 1.5pt, color: color-border),
    y: 0.8em
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

// --- Evidenz-Box ---
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
#header(
  meta.lookup("candidate-name").str.or("Max Mustermann"),
  meta.lookup("candidate-role").str.or("Platform Engineer"),
  meta.lookup("candidate-contact").str.or("max@beispiel.de  |  +49 123 456789  |  github.com/maxmustermann")
)

#section("Berufserfahrung")
#let experiences = meta.lookup("experiences").str.or("[Erfahrungen werden aus Job-Daten generiert]")
#text(experiences)

#section("Technische Expertise")
#let skills = meta.lookup("skills").str.or("Kubernetes, CI/CD, Bash, TypeScript")
#text(skills)

#section("Kuratierte Evidenz")
// Evidenz-Einträge kommen aus dem Katalog (Task 1)
#let evidence-items = meta.lookup("evidence-items").str.or("Fleet/k3s, Dev-Mesh, FreeToken MoE, Software Factory, BATS-Gates")
#text(evidence-items)

#section("Ausbildung & Zertifizierungen")
#text(meta.lookup("education").str.or("Bachelor Informatik, TU Beispielstadt"))
