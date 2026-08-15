# Documents UI kit

Four standalone document templates that complete the Kore. visual system across the long-form / printable surfaces.

| File | Purpose | Surface |
|---|---|---|
| `newsletter.html` | Patch notes / monthly digest | Dark — masthead, TOC, tagged change log, pull quote, upgrade snippet, sign-off |
| `invoice.html` | Paid invoice | Bone paper — punch-tape header, line items, reverse-charge VAT, paid stamp |
| `questionnaire.html` | Onboarding questionnaire | Dark — progress strip, sectioned questions, mixed controls (text, slider, segmented, checkbox, radio) |
| `contract.html` | Master service agreement | Bone paper — cover, parties, italic preamble, numbered clauses, dual signature blocks |

All four lean on the existing tokens: `colors_and_type.css` for type/color, `styles/app.css` for buttons/pills/paper-doc base, no per-document fonts. The dark documents inherit `body::before` film grain from `app.css`; paper documents use the tinted radial-glow from `.paper-doc`.

Interactive bits are static styling only — no JS — so each file is print-ready.
