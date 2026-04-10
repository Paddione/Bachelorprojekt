import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { $ as $$Layout } from '../chunks/Layout_B46HJydu.mjs';
export { r as renderers } from '../chunks/_@astro-renderers_BD3J2jSH.mjs';

const $$Datenschutz = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Datenschutz" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="pt-28 pb-20"> <div class="max-w-3xl mx-auto px-6 prose prose-lg prose-slate"> <h1>Datenschutzerklarung</h1> <h2>1. Datenschutz auf einen Blick</h2> <h3>Allgemeine Hinweise</h3> <p>
Die folgenden Hinweise geben einen einfachen Uberblick daruber, was mit Ihren
        personenbezogenen Daten passiert, wenn Sie diese Website besuchen.
</p> <h3>Datenerfassung auf dieser Website</h3> <p> <strong>Wer ist verantwortlich fur die Datenerfassung auf dieser Website?</strong><br>
Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber.
        Dessen Kontaktdaten konnen Sie dem Impressum entnehmen.
</p> <h2>2. Allgemeine Hinweise und Pflichtinformationen</h2> <h3>Datenschutz</h3> <p>
Die Betreiber dieser Seiten nehmen den Schutz Ihrer personlichen Daten sehr ernst.
        Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend den
        gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklarung.
</p> <h2>3. Datenerfassung auf dieser Website</h2> <h3>Kontaktformular</h3> <p>
Wenn Sie uns per Kontaktformular Anfragen zukommen lassen, werden Ihre Angaben
        aus dem Anfrageformular inklusive der von Ihnen dort angegebenen Kontaktdaten
        zwecks Bearbeitung der Anfrage und fur den Fall von Anschlussfragen bei uns
        gespeichert. Diese Daten geben wir nicht ohne Ihre Einwilligung weiter.
</p> <p>
Die Verarbeitung dieser Daten erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO,
        sofern Ihre Anfrage mit der Erfullung eines Vertrags zusammenhangt oder zur
        Durchfuhrung vorvertraglicher Massnahmen erforderlich ist.
</p> <h3>Server-Log-Dateien</h3> <p>
Der Provider der Seiten erhebt und speichert automatisch Informationen in
        sogenannten Server-Log-Dateien, die Ihr Browser automatisch an uns ubermittelt.
        Diese Daten sind nicht bestimmten Personen zuordenbar.
</p> <h2>4. Ihre Rechte</h2> <p>
Sie haben jederzeit das Recht, unentgeltlich Auskunft uber Herkunft, Empfanger
        und Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben
        ausserdem ein Recht, die Berichtigung oder Loschung dieser Daten zu verlangen.
</p> <p>
Wenn Sie eine Einwilligung zur Datenverarbeitung erteilt haben, konnen Sie diese
        jederzeit fur die Zukunft widerrufen. Hierzu sowie zu weiteren Fragen zum Thema
        Datenschutz konnen Sie sich jederzeit an uns wenden.
</p> <p class="text-sm text-slate-500 mt-12">
Hinweis: Diese Datenschutzerklarung ist ein Platzhalter und muss von einem
        Rechtsanwalt oder Datenschutzbeauftragten fur Ihren spezifischen Anwendungsfall
        angepasst werden.
</p> </div> </section> ` })}`;
}, "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/datenschutz.astro", void 0);

const $$file = "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/datenschutz.astro";
const $$url = "/datenschutz";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Datenschutz,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
