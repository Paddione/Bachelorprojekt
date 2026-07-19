---
name: fix-t001950-lighthouse-perf
description: Lighthouse performance optimizations (self-hosted fonts, deferred CSS, JS trim) for G-FE05
---

# Capability: fix-t001950-lighthouse-perf

## Purpose

Raise the website's Lighthouse Performance score from 74 toward the G-FE05 target of ≥90 by
self-hosting Google Fonts, moving non-critical CSS out of the render-blocking path, and trimming
unused JavaScript.

## ADDED Requirements

### Requirement: Fonts Are Self-Hosted

The website MUST NOT depend on a Google Fonts `<link>` for its critical rendering path; fonts
used above the fold are served from `website/public/fonts/` with `font-display: swap`.

#### Scenario: Homepage font loading

```gherkin
GIVEN a user requests the homepage
WHEN the page renders
THEN no external Google Fonts request blocks first paint
```

### Requirement: Non-Critical CSS Is Deferred

`sidekick-panels.css` (and equivalent non-critical stylesheets) MUST NOT block first
contentful paint.

#### Scenario: Non-critical stylesheet load

```gherkin
GIVEN the homepage includes sidekick-panels.css
WHEN the page loads
THEN the stylesheet is loaded via preload+swap (or deferred), not a blocking <link rel="stylesheet">
```
