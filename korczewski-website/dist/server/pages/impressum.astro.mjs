import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { $ as $$Layout } from '../chunks/Layout_B46HJydu.mjs';
export { r as renderers } from '../chunks/_@astro-renderers_BD3J2jSH.mjs';

const $$Impressum = createComponent(($$result, $$props, $$slots) => {
  const brandName = "Korczewski";
  const contactName = "Patrick Korczewski";
  const contactEmail = "info@korczewski.de";
  const contactCity = "Luneburg";
  const street = "In der Twiet 4";
  const zip = "21360";
  const jobtitle = "Software Engineer, IT-Security-Berater";
  const chamber = "Entfallt";
  const ustId = "Kleinunternehmer gem. § 19 Abs. 1 UStG";
  const website = "korczewski.de";
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Impressum" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="pt-28 pb-20"> <div class="max-w-3xl mx-auto px-6 prose prose-lg prose-slate"> <h1>Impressum</h1> <h2>Angaben gemass &sect; 5 DDG</h2> <p> ${contactName}<br> ${brandName} &ndash; KI-Beratung &amp; Software-Architektur<br> ${street}<br> ${zip} ${contactCity}<br>
Deutschland
</p> <h2>Kontakt</h2> <p> ${""}<br>
E-Mail: ${contactEmail}<br>
Web: www.${website} </p> <h2>Berufsbezeichnung und berufsrechtliche Regelungen</h2> <p>
Berufsbezeichnung: ${jobtitle}<br>
Zustandige Kammer: ${chamber}<br>
Verliehen in: Bundesrepublik Deutschland
</p> <p>
IT-Beratung und Software-Entwicklung sind in Deutschland nicht reglementierte Berufe.
        Es bestehen keine besonderen berufsrechtlichen Regelungen.
</p> <h2>Umsatzsteuer</h2> <p> ${ustId} </p> <h2>Redaktionell Verantwortlicher</h2> <p> ${contactName}<br> ${street}<br> ${zip} ${contactCity} </p> <h2>EU-Streitschlichtung</h2> <p>
Die Europaische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:
<a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">
https://ec.europa.eu/consumers/odr/
</a> </p> <p>
Unsere E-Mail-Adresse finden Sie oben im Impressum.
</p> <h2>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2> <p>
Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren
        vor einer Verbraucherschlichtungsstelle teilzunehmen.
</p> <h2>Haftung fur Inhalte</h2> <p>
Als Diensteanbieter sind wir gemass &sect; 7 Abs. 1 DDG fur eigene Inhalte
        auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach &sect;&sect; 8 bis 10
        DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, ubermittelte oder
        gespeicherte fremde Informationen zu uberwachen oder nach Umstanden zu forschen,
        die auf eine rechtswidrige Tatigkeit hinweisen.
</p> <p>
Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den
        allgemeinen Gesetzen bleiben hiervon unberuhrt. Eine diesbezugliche Haftung ist
        jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung moglich.
        Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte
        umgehend entfernen.
</p> <h2>Haftung fur Links</h2> <p>
Unser Angebot enthalt Links zu externen Websites Dritter, auf deren Inhalte wir
        keinen Einfluss haben. Deshalb konnen wir fur diese fremden Inhalte auch keine
        Gewahr ubernehmen. Fur die Inhalte der verlinkten Seiten ist stets der jeweilige
        Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum
        Zeitpunkt der Verlinkung auf mogliche Rechtsverstosse uberpruft. Rechtswidrige
        Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar.
</p> <p>
Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete
        Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von
        Rechtsverletzungen werden wir derartige Links umgehend entfernen.
</p> <h2>Urheberrecht</h2> <p>
Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
        unterliegen dem deutschen Urheberrecht. Die Vervielfaltigung, Bearbeitung, Verbreitung
        und jede Art der Verwertung ausserhalb der Grenzen des Urheberrechtes bedurfen der
        schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien
        dieser Seite sind nur fur den privaten, nicht kommerziellen Gebrauch gestattet.
</p> <p>
Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die
        Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche
        gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam
        werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden von
        Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.
</p> </div> </section> ` })}`;
}, "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/impressum.astro", void 0);
const $$file = "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/impressum.astro";
const $$url = "/impressum";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Impressum,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
