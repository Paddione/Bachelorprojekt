## ADDED Requirements

### Requirement: Transparent Images Are Trimmed to the Subject

`image_generate` SHALL accept a boolean `trim` that defaults to the value of `transparent` and SHALL ignore it
when `transparent` is not set (the model output has no alpha channel); a non-boolean `trim` SHALL be rejected. When
`trim` is in effect,
`scripts/comfy-image-mcp/postprocess.py` SHALL crop the image after background removal and before pixelation to
the bounding box of the pixels with alpha of at least 128, extended by a transparent margin of
`max(1, round(0.02 × longer side))` pixels and clipped to the image. An image without an alpha channel or without
opaque pixels SHALL be left unchanged.

Rationale: the model draws cut-out subjects with a wide empty margin; without trimming a 64-pixel sprite used about
a third of its height for the subject (live run, T900379).

#### Scenario: A small subject fills the pixelated sprite

- **GIVEN** an RGBA image whose opaque subject covers a small area of a large transparent canvas
- **WHEN** `postprocess.py` runs with `--trim --pixelate 32`
- **THEN** the longer side of the output is 32 pixels and the opaque pixels reach within 2 pixels of both ends of
  that side

#### Scenario: Trim defaults to transparent

- **GIVEN** `image_generate` parameters with `transparent: true` and no `trim`
- **WHEN** the post-processing arguments are built
- **THEN** they include `--trim`, and with `trim: false` they do not
