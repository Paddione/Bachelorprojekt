## MODIFIED Requirements

### Requirement: Optimized Hero LCP Image

The hero portrait, which is the Largest Contentful Paint element above the fold,
SHALL be delivered as the pre-built WebP asset and SHALL be loaded eagerly with a
high fetch priority and explicit intrinsic dimensions, so the browser prioritizes
it and reserves layout space without shifting.

The declared `width` and `height` attributes SHALL match the intrinsic pixel dimensions of
the referenced asset. Declaring dimensions that differ from the file reserves the wrong layout
box and reintroduces the shift the attributes exist to prevent.

#### Scenario: Hero portrait loads eagerly as WebP

- **GIVEN** the brand configuration points the portrait avatar at the WebP asset
- **WHEN** the homepage renders the hero portrait image
- **THEN** the `<img>` requests the WebP file with `loading="eager"`, `fetchpriority="high"`, and explicit `width`/`height` attributes

#### Scenario: Declared dimensions match the delivered file

- **GIVEN** the portrait derivatives under `website/public/`
- **WHEN** the `width` and `height` attributes on the portrait `<img>` are compared with the intrinsic dimensions of the file named in `src`
- **THEN** both values are equal

## ADDED Requirements

### Requirement: Portrait Derivatives Preserve the Full Head

The delivered portrait derivatives SHALL contain the subject's head in full. Because the
derivatives are cropped from a taller original, the crop SHALL be anchored at the top edge of
the original (offset `y = 0`), which is the only anchor that cannot remove headroom.

A derivative whose crop offset is greater than zero SHALL be treated as a defect, regardless of
how the image looks after the browser's own `object-fit` handling — the shipped file is what a
direct request returns, and a direct request bypasses all CSS.

#### Scenario: Derivative crop is anchored at the top of the original

- **GIVEN** the original `website/public/gerald.jpg` and a derivative under `website/public/`
- **WHEN** the derivative is matched pixel-wise against every candidate crop offset of the original
- **THEN** the best-matching offset is `y = 0`

#### Scenario: Direct request returns the uncropped head

- **GIVEN** a client requests a portrait derivative directly, without loading the page
- **WHEN** the returned image is inspected
- **THEN** the top of the head is inside the frame and not touching the upper edge

### Requirement: Portrait Derivatives Match the Frame Aspect Ratio

The portrait derivatives SHALL carry the same aspect ratio as the `.portrait` frame that renders
them, so that `object-fit: cover` performs no crop in either axis. Where source and frame ratios
agree, `object-position` has no overhang to distribute and SHALL NOT be relied on to protect any
part of the subject.

#### Scenario: Derivative ratio equals the frame ratio

- **GIVEN** the `.portrait` frame declares its `aspect-ratio`
- **WHEN** the intrinsic dimensions of each portrait derivative are reduced to a ratio
- **THEN** that ratio equals the frame's declared `aspect-ratio`

### Requirement: Portrait Derivatives Are Generated Reproducibly

The portrait derivatives SHALL be produced by a committed generator script rather than by hand,
so the crop offset and target sizes are versioned rather than recoverable only by measuring the
output. Re-running the generator against unchanged inputs SHALL reproduce derivatives that are
equivalent to the committed ones.

#### Scenario: Generator reproduces the committed derivatives

- **GIVEN** the committed original and the committed derivatives
- **WHEN** the generator script is executed
- **THEN** it exits successfully and the regenerated derivatives match the committed ones in dimensions and in crop offset against the original
