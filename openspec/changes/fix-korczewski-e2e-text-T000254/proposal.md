# Proposal: fix-korczewski-e2e-text-T000254

## Why

Drei Playwright-Tests in `tests/e2e/specs/korczewski-home.spec.ts` schlagen gegen die
Live-Site fehl, ein vierter gilt als flaky. Ein Abgleich der Erwartungen mit dem
tatsächlich ausgelieferten HTML (2026-07-27, `https://web.korczewski.de`) zeigt **drei
verschiedene Ursachen** — nicht eine gemeinsame:

**T2 „nav brand wordmark" ist ein Selektor-Fehler, kein Textfehler.** Der Test greift
über `getByRole('link', { name: /korczewski startseite/i })` zu. Der ausgelieferte Link
ist `<a href="/" class="brand">` **ohne `aria-label`**; sein Accessible Name ist damit
sein Textinhalt `korczewski.`, denn das Logo-SVG daneben trägt `aria-hidden="true"`.
Die Zeichenfolge „korczewski startseite" existiert im DOM nicht. Der erwartete Text
`korczewski.` stimmt dagegen exakt — das Element wird nur nie gefunden.

**T15 „footer copyright" trifft auf zwei Footer.** Die Seite rendert
`<footer class="w-foot">` aus `KoreHomepage.svelte` **innerhalb von `<main>`** und
zusätzlich den Layout-Footer `<footer class="site-foot">`. Nach HTML-Spec ist nur der
äußere ein `contentinfo`-Landmark — und dort steht die Marke durchgängig klein
(`korczewski.`, `© 2026 korczewski.de`). Das großgeschriebene „Korczewski." existiert
nur im inneren `w-foot`, der kein `contentinfo` ist. Der Test kann also nicht grün
werden, egal wie oft er wiederholt wird.

**`/ueber-mich` liefert ein anderes Heading.** Live steht dort
`<h1>Patrick Korczewski</h1>`; der Test erwartet `/IT-Management|Security|über mich/i`.
Die Seite wurde im Zuge des Kore-Redesigns zum Personen-Porträt umgebaut.

Der verschachtelte Footer ist dabei mehr als Testrauschen: ein Landmark innerhalb eines
Landmarks ist ein Barrierefreiheits-Defekt, und er macht jeden
`getByRole('contentinfo')`-Zugriff im Playwright-Strict-Mode mehrdeutig. Das ist die
plausibelste Erklärung für die als „flaky" markierten Läufe.

## What

**Der Content ist die Wahrheit, die Tests werden nachgezogen** (Entscheidung im
Brainstorming 2026-07-27). Dafür spricht die Testdatei selbst: sie trägt bereits
mehrere `T002068: Live site has …`-Kommentare, mit denen frühere Sessions Erwartungen
an das Redesign angepasst haben. Die Tests hinken dem Redesign nach, nicht umgekehrt.

Konkret:

- **T2** greift auf den Brand-Link künftig über seinen tatsächlichen Accessible Name
  zu. Der Link bekommt zusätzlich ein `aria-label`, damit die Absicht explizit im
  Markup steht statt implizit vom Textinhalt abzuhängen — das ist echte
  Barrierefreiheits-Verbesserung, nicht nur Testkosmetik.
- **T15** prüft case-insensitiv auf die Marke, statt eine Großschreibung zu verlangen,
  die im `contentinfo`-Landmark bewusst nicht vorkommt.
- **`/ueber-mich`** erwartet das Porträt-Heading.

**Zusätzlich im Scope** (Entscheidung im selben Brainstorming): der innere
`w-foot`-`<footer>` in `KoreHomepage.svelte` wird zu einem `<div>`. Die Optik bleibt
identisch — die CSS-Regeln hängen an der Klasse `w-foot`, nicht am Elementnamen. Damit
gibt es genau ein `contentinfo` auf der Seite, der a11y-Defekt verschwindet und
`getByRole('contentinfo')` wird eindeutig.

**Nicht Teil dieser Änderung:** der als flaky markierte `/software-dev`-Lauf
(`net::ERR_ABORTED; maybe frame was detached?`). Er hat keine Textursache und ging beim
Retry durch. Bleibt er nach dem Footer-Fix bestehen, gehört er in ein eigenes Ticket —
die Vermutung, dass die Landmark-Mehrdeutigkeit ihn verursacht hat, wird durch diese
Änderung überprüfbar, nicht vorweggenommen.

_Ticket: T000254_
