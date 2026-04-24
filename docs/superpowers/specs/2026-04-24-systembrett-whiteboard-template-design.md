# Systembrett Whiteboard Template — Design

**Date:** 2026-04-24
**Status:** Approved — ready for implementation planning
**Target:** mentolder.de coaching platform, Nextcloud Whiteboard inside Talk calls

## 1. Purpose

Provide a reusable Nextcloud Whiteboard template that serves as a digital *Systembrett* (systemic constellation board) for coaching sessions on mentolder.de. Coaches and clients interact with it live inside a Talk call; between sessions a coach can also use it alone for case reflection.

A single template must cover all five common Systembrett use cases:
- Familienaufstellung
- Team- / Organisationsaufstellung
- Innere-Anteile-Arbeit (IFS-ähnlich)
- Ressourcen- / Zielaufstellung
- Problem- / Wertearbeit

## 2. Scope

### In scope (v1)

- One `.whiteboard` template file with an embedded Excalidraw library of 14 primitive pieces across 5 categories.
- Distribution via a Nextcloud folder readable by all coach accounts; coaches duplicate the template per session.
- A documented "Wie starte ich eine Sitzung" flow in `docs-site/`.
- A 5-minute pre-implementation verification that embedded `libraryItems` survive per-user opens in Nextcloud Whiteboard.

### Out of scope (v1)

- Pre-arranged starter scenes (e.g. a Genogramm with figures already placed).
- Per-coach or per-brand variants of the template.
- Labeled figure variants (Mutter / Vater / Kind). Names are added by coaches via Excalidraw's text tool — the primitives stay universal.
- A forked Nextcloud Whiteboard service with a custom drawer component.

## 3. Delivery approach

### Path A — Embed-first (primary)

One template whiteboard file with all 14 pieces embedded as `libraryItems` in the Excalidraw scene. When any user opens the board, the native Excalidraw library panel auto-populates with the full toolkit. Zero per-user setup, works on desktop and mobile (responsive panel).

### Verification before commitment (5 min)

1. Create a new Nextcloud whiteboard as user A (coach account).
2. Add three test shapes to the library via Excalidraw's "Save to library" flow.
3. Share the board with user B; open as user B in an incognito session.
4. **Pass criterion:** user B sees all three library items in their library panel on first open, without importing anything. If yes → commit to Path A. If no → Path B.

### Path B — Hybrid (pre-agreed fallback)

Canvas-fixed "stamp tray" along the left edge of the template board containing the same 14 pieces as ordinary (non-library) elements, plus the library for users who have imported it. Coaches Alt-drag from the tray to duplicate pieces into the work area. The tray elements are locked so they can't be accidentally moved; only copies move. Guaranteed cross-user visibility since everything lives as canvas content.

### Path C — Fork (deferred)

Forking Nextcloud Whiteboard to add a custom drawer component. Not worth the maintenance cost for a bachelor-thesis v1. Revisit only if Paths A and B prove insufficient in practice.

## 4. Component inventory

14 unlabeled primitives in 5 categories. Rationale for unlabeled: the same primitive plays "Mutter" in one session, "innerer Kritiker" in another, and "Mitarbeiter·in" in a third. Pre-baked names would force context-specific variants and explode the toolkit.

### 4.1 Personen (3)

| Piece | Shape | Role |
|---|---|---|
| Person groß | Filled circle, Brass, radius 18 | Primary figure (Eltern, Führungskraft, Zentralfigur) |
| Person mittel | Filled circle, Brass, radius 14 | Default figure |
| Person klein | Filled circle, Brass, radius 10 | Subordinate (Kind, Mitarbeiter·in, nachgeordneter Anteil) |

All three carry a dark rectangular "notch" on the circle edge indicating direction (where the figure is looking). The notch rotates with the figure via Excalidraw's standard rotation handle. Color per piece is editable through Excalidraw's picker; Brass (`#d7b06a`) is the default for primary roles, Sage (`#9bc0a8`) the convention for secondary / Gegenüber.

### 4.2 Selbst & Offene Stellen (2)

| Piece | Shape | Role |
|---|---|---|
| Ich | Double-outline ring with filled center, Brass | The central reference point, especially in Innere-Anteile-Arbeit |
| Unbekannt | Dashed outline with italic `?` | Placeholder for Abwesende, Verstorbene, not-yet-named |

`Ich` is visually distinct from the Personen figures so it reads as "the self" rather than "another person in the scene".

### 4.3 Themen & Anliegen (4)

Shapes deliberately non-anthropomorphic — they must not read as people.

| Piece | Shape | Role |
|---|---|---|
| Thema | Rounded square, Sage fill | Neutral carrier for "das Anliegen" |
| Ziel / Wert | Diamond, Brass fill | Direction, aspiration |
| Gefühl | Organic heart-like outline, Brass-2 (`#e8c884`) | Emotional quality |
| Hindernis | Jagged polygon, neutral outline | Blockage, resistance |

### 4.4 System-Rahmen (2)

| Piece | Shape | Role |
|---|---|---|
| System | Rounded rectangle, translucent Sage fill | Encloses an inner whole — Kernfamilie, Team, innere Welt |
| Kontext | Dashed rectangle, no fill | Environment acting on the system without belonging to it — Schwiegereltern, Markt, Vergangenheit |

Rahmen sit underneath figures in z-order.

### 4.5 Verbindungen (4)

| Piece | Shape | Role |
|---|---|---|
| Beziehung stark | Solid line, neutral | Strong bond |
| Beziehung schwach | Dashed line, neutral | Loose or thinning connection |
| Einfluss | Arrow, Brass, directional | Who acts on whom |
| Konflikt | Zigzag, muted red (`#c46a5a`) | Tension, friction |

## 5. Coverage

The 14 primitives must support each of the five contexts from a single toolbox:

| Context | Pieces used |
|---|---|
| Familienaufstellung | Personen (all 3 sizes) · System-Rahmen (Kernfamilie) · Kontext (Herkunft) · Unbekannt (Abwesende) · Verbindungen (Beziehungsqualität) |
| Team / Organisation | Personen (groß = Leitung, klein = Mitarbeiter·in) · System-Rahmen (Abteilung) · Ziel-Diamant (KPI) · Einfluss-Pfeil (Hierarchie) |
| Innere Anteile | Ich (zentral) · Personen als Anteile (Kritiker, Kind, Beschützer) · Gefühl-Kontur · System-Rahmen (innere Welt) |
| Ressourcen / Ziele | Ich · Ziel-Diamant · Thema-Quadrat (Ressourcen) · Hindernis · Einfluss-Pfeil (Weg) |
| Problem / Werte | Ich · mehrere Thema-Träger · Gefühl-Kontur · Hindernis · System-Rahmen (Werte-Cluster) |

No context requires a piece outside this set; no piece is tied to a single context.

## 6. Visual design

Matches the mentolder brand design system:
- **Palette:** Brass `#d7b06a` (primary), Brass-2 `#e8c884` (accent), Sage `#9bc0a8` (secondary), muted red `#c46a5a` (conflict only), neutral `#cdd3d9` (tertiary lines and text).
- **Style:** clean geometric shapes with meaningful fills. Each shape is immediately recognizable at both desktop zoom and tablet scale.
- **Typography inside the library panel:** category labels rendered by Excalidraw's native font; we do not customize panel typography.

Note: an earlier exploration considered a "wooden naturalistic" earth-tone direction; the mentolder brand palette was chosen instead so the whiteboard fits the coaching platform's visual identity end-to-end.

## 7. Interaction model

### Session start

1. Coach opens their `Coaching Sessions` folder in Nextcloud Files.
2. Coach duplicates the shared `systembrett-template.whiteboard` as `Klient·in-XY-YYYY-MM-DD.whiteboard`.
3. Coach joins the Talk call, shares the new whiteboard.

### During the session

- **Library panel** (Excalidraw native) is the toolbox. Click the library icon in the toolbar to open the drawer — it docks alongside the canvas on larger screens and collapses on smaller viewports per Excalidraw's native responsive behavior. Exact mobile layout to be confirmed during the 5-min verification.
- **Place a piece:** drag from the drawer onto the canvas.
- **Duplicate a placed piece:** `Alt` + drag.
- **Name a piece:** Excalidraw text tool; place the label next to the figure.
- **Rotate direction:** select, drag the rotation handle; the notch follows.
- **Connect two figures:** either Excalidraw's native arrow tool or drag a Verbindung piece from the drawer.

Both coach and client interact simultaneously via the whiteboard collaboration backend already deployed and JWT-verified on both clusters (`workspace-secrets.WHITEBOARD_JWT_SECRET`).

## 8. Distribution

- **Source of truth:** `website/public/systembrett/systembrett-template.whiteboard` (final path chosen during implementation).
- **Seeding to Nextcloud:** a new helper, either `scripts/systembrett-seed.sh` or integration into `scripts/post-setup.sh`, uploads the template to a shared folder readable by all coach accounts. The folder is created on first run and the file is re-uploaded idempotently.
- **Invocation:** folds into `task workspace:deploy` for the mentolder env, similar to how other post-setup steps run.
- **Updates:** edit the source template, rerun seed. Existing per-session boards are unaffected because each contains its own copy of the library at the moment it was created.

## 9. Testing and acceptance

- **Pre-commitment verification** (see §3). Gate between Path A and Path B.
- **Acceptance for the shipped template:**
  - Coach account opens the template; library drawer shows all 14 pieces categorized.
  - Client joining the same board via Talk sees the same library drawer on first load (Path A) or the on-canvas stamp tray (Path B).
  - Spot-check: one representative scene from each of the five contexts can be constructed using only the 14 primitives.
- **Regression check:** after running the seed script, `ls` the shared Nextcloud folder via `occ` and confirm the file is present with the expected size.

## 10. Open questions for implementation

- Confirm exact file format Nextcloud Whiteboard expects (`.whiteboard` vs `.excalidraw`) as part of the 5-min verification.
- Choose the seeding mechanism (`occ files:upload`, WebDAV, or a purpose-built helper) based on which existing pattern in `scripts/` fits best.
- Decide whether to ship a single empty template or two variants — an empty one and one with a pre-placed `Ich` as a warmer starting point. Default: ship only empty for v1; add variant later if coaches ask.
