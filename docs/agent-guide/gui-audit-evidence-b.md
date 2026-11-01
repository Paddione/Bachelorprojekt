# GUI-Audit-Evidenz — Staffel B (Plan `gui-audits-plan-b`)

Goal `frontend-domain-ssot`, Kriterium 6, Staffel B: reduzierte GUI-Abdeckung
für `react.mentolder.de` (mentolder-web, React-SPA) — Smoke der 5 Kernrouten
+ axe (0 critical/serious). Messumgebung: live (`https://react.mentolder.de`,
öffentliche Routen, read-only, kein Auth; Kontaktformular nur gerendert, nie
abgesendet). Screenshots/Traces liegen dem PR als Anhang bei, nicht im Repo.

Commit-Stand der Belegläufe: `3de7bf363` (p1-Stand; Spec + 1 Nightly-Match-Zeile).

## D4 — reduzierte Suite bis zur #7051-Entscheidung

Live-Messung 2026-11-01: `react.mentolder.de` antwortet **200 + Voll-SPA**
(Titel `mentolder — Digital Coach & Führungskräfte-Mentor`, Bundle
`/assets/index-VnVAy42H.js`,nginx/Vite) statt Redirect — die D1-Aussage
(„sekundär/Redirect") ist überholt. Der Host steht in keinem Manifest und fehlt
in der Registry; die Infra-Folge-Entscheidung (Redirect einrichten vs.
Manifest + Registry) läuft als Issue
[#7051](https://github.com/Paddione/Bachelorprojekt/issues/7051) und ist NICHT
Teil dieses Plans. Eigner-Abstimmung 2026-11-01 (Option „Reduziert"): bis zur
#7051-Entscheidung gilt diese reduzierte K6-Suite gegen den live Host als
Beleg — volle Suite entfällt.

## Ergebnisse (live, `https://react.mentolder.de`)

Befehl (Nightly-Config, `smoke`-Projekt; DB-Purge-Hooks skippen ohne
`CRON_SECRET` von selbst): `npx playwright test mentolder-web-smoke --config
playwright.config.ts --project=smoke` — 4 passed / 6 failed (10 Tests).
Befunde über Triviales hinaus sind per B3 NICHT gefixt, sondern Folge-Arbeit
(Details in `phase-events.log`, `p1-rotphase`).

| Route | Smoke | axe | Beleg |
|---|---|---|---|
| `/` | **Befund (B3)**: 200 + keine Platzhalter, aber horizontaler Overflow **+80 px** (Desktop 1280; deko-`IMG.absolute.right-[-20%]` + `A.go-link` „Mehr") | **Befund (B3)**: `aria-required-children` (critical) — `div[aria-label="Prozessschritte"] > ol`; `color-contrast` (serious) — Kontakt-CTA 1.66:1, Eyebrow 3.65:1; `label-content-name-mismatch` (serious) — `.brand` | `phase-events.log` (`p1-rotphase`) |
| `/leistungen` | **grün** (200, keine Platzhalter, kein Overflow) | **Befund (B3)**: `color-contrast` (serious) ×4 (CTA 1.66, mute-Texte 3.65); `label-content-name-mismatch` (serious) — `.brand` | `phase-events.log` (`p1-rotphase`) |
| `/kontakt` | **grün** (200, keine Platzhalter, kein Overflow; Formular nur gerendert) | **Befund (B3)**: `color-contrast` (serious) ×4 (CTA 1.66, mute-Texte 3.65/3.88); `label-content-name-mismatch` (serious) — `.brand` | `phase-events.log` (`p1-rotphase`) |
| `/impressum` | **grün** (200, keine Platzhalter, kein Overflow) | **Befund (B3)**: `color-contrast` (serious) ×3 (CTA 1.66, mute-Texte 3.65); `label-content-name-mismatch` (serious) — `.brand` | `phase-events.log` (`p1-rotphase`) |
| `/barrierefreiheit` | **grün** (200, keine Platzhalter, kein Overflow) | **Befund (B3)**: `color-contrast` (serious) ×3 (CTA 1.66, mute-Texte 3.65); `label-content-name-mismatch` (serious) — `.brand` | `phase-events.log` (`p1-rotphase`) |

Wiederkehrende Muster (alle Routen): Kontakt-CTA `#eef1f3` auf `#e0b67b`
(1.66:1 statt 4.5:1), Mute-Texte `#6a727e` auf dunklem Grund (3.65–3.88:1),
`.brand`-Link ohne sichtbaren Text im Accessible Name. Kern-These: dunkles
Theme + Gold-CTA verfehlen 4.5:1 systematisch — Design-System-Thema für die
Folge-Entscheidung (ggf. Issue-Kommentar in #7051).

## Folge-Aktionen (nicht in diesem Plan)

1. Overflow `/` (deko-Elemente) + axe-Befunde (CTA-Kontrast, Mute-Texte,
   `.brand`-Name, Prozessschritte-ARIA) — Folge-PR gegen mentolder-web,
   kein Scope-Creep hier.
2. Infra-Folge-Entscheidung in
   [#7051](https://github.com/Paddione/Bachelorprojekt/issues/7051)
   (Redirect einrichten oder Manifest + Registry) — danach ggf. Suite-Umzug
   vom live Host auf die registrierte URL.
