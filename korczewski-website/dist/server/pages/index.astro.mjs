import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { $ as $$Layout } from '../chunks/Layout_B46HJydu.mjs';
import { a as escape_html, e as ensure_array_like, b as attr, c as attr_class, s as stringify } from '../chunks/_@astro-renderers_BD3J2jSH.mjs';
export { r as renderers } from '../chunks/_@astro-renderers_BD3J2jSH.mjs';
import 'clsx';
import { C as CallToAction } from '../chunks/CallToAction_oQA_XyEf.mjs';

function Hero($$renderer, $$props) {
	let {
		title = 'KI-Beratung &\nSoftware-Architektur',
		subtitle = 'Vom sicheren Einsatz von KI im Alltag bis zum produktionsreifen Kubernetes-Deployment. Ich helfe Ihnen, moderne Technologie pragmatisch und kosteneffizient zu nutzen.',
		tagline = 'Pragmatisch. Technisch. Auf den Punkt.'
	} = $$props;

	$$renderer.push(`<section class="relative bg-dark pt-28 pb-20 md:pt-36 md:pb-28"><div class="max-w-6xl mx-auto px-6"><div class="max-w-3xl"><p class="text-gold font-semibold text-lg mb-4 tracking-widest uppercase">${escape_html(tagline)}</p> <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold text-light leading-tight mb-6 whitespace-pre-line font-serif">${escape_html(title)}</h1> <p class="text-xl md:text-2xl text-muted leading-relaxed mb-10 max-w-2xl">${escape_html(subtitle)}</p> <div class="flex flex-col sm:flex-row gap-4"><a href="/kontakt" class="bg-gold hover:bg-gold-light text-dark px-8 py-4 rounded-full font-bold text-lg transition-all hover:shadow-lg hover:shadow-gold-dim text-center uppercase tracking-wide">Kennenlerngesprach buchen</a> <a href="/#angebote" class="border-2 border-gold/40 text-gold hover:border-gold px-8 py-4 rounded-full font-bold text-lg transition-all text-center">Leistungen entdecken</a></div></div></div> <div class="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 bg-gradient-to-l from-gold-dim to-transparent rounded-l-[4rem] hidden lg:block"></div></section>`);
}

function ServiceCard($$renderer, $$props) {
	let { title, description, icon, features, href, price } = $$props;

	$$renderer.push(`<div class="bg-dark-light rounded-2xl border border-dark-lighter p-8 hover:border-gold/30 transition-all duration-300 hover:-translate-y-1 flex flex-col h-full"><div class="text-5xl mb-6">${escape_html(icon)}</div> <h3 class="text-2xl font-bold text-light mb-3 font-serif">${escape_html(title)}</h3> <p class="text-muted text-lg mb-6 leading-relaxed">${escape_html(description)}</p> <ul class="space-y-3 mb-8 flex-1"><!--[-->`);

	const each_array = ensure_array_like(features);

	for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
		let feature = each_array[$$index];

		$$renderer.push(`<li class="flex items-start gap-3 text-muted"><svg class="w-6 h-6 text-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> <span>${escape_html(feature)}</span></li>`);
	}

	$$renderer.push(`<!--]--></ul> `);

	if (price) {
		$$renderer.push('<!--[0-->');
		$$renderer.push(`<p class="text-lg font-semibold text-gold mb-4">${escape_html(price)}</p>`);
	} else {
		$$renderer.push('<!--[-1-->');
	}

	$$renderer.push(`<!--]--> <a${attr('href', href)} class="block text-center bg-gold hover:bg-gold-light text-dark px-6 py-3.5 rounded-full font-bold text-lg transition-colors uppercase tracking-wide">Mehr erfahren</a></div>`);
}

function FAQ($$renderer, $$props) {
	let { items, title = 'Haufig gestellte Fragen' } = $$props;
	let openIndex = null;

	$$renderer.push(`<section class="py-20 bg-dark-light"><div class="max-w-3xl mx-auto px-6"><h2 class="text-3xl md:text-4xl font-bold text-light text-center mb-12 font-serif">${escape_html(title)}</h2> <div class="space-y-4"><!--[-->`);

	const each_array = ensure_array_like(items);

	for (let i = 0, $$length = each_array.length; i < $$length; i++) {
		let item = each_array[i];

		$$renderer.push(`<div class="bg-dark rounded-xl border border-dark-lighter overflow-hidden"><button class="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-dark-lighter/50 transition-colors"${attr('aria-expanded', openIndex === i)}><span class="text-lg font-semibold text-light">${escape_html(item.question)}</span> <svg${attr_class(`w-6 h-6 text-gold flex-shrink-0 transition-transform duration-300 ${stringify(openIndex === i ? 'rotate-180' : '')}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button> `);

		if (openIndex === i) {
			$$renderer.push('<!--[0-->');
			$$renderer.push(`<div class="px-6 pb-5 text-muted text-lg leading-relaxed border-t border-dark-lighter pt-4">${escape_html(item.answer)}</div>`);
		} else {
			$$renderer.push('<!--[-1-->');
		}

		$$renderer.push(`<!--]--></div>`);
	}

	$$renderer.push(`<!--]--></div></div></section>`);
}

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const services = [
    {
      title: "KI-Beratung",
      description: "KI sicher, sinnvoll und kosteneffizient einsetzen \u2013 privat oder geschaftlich. Kein Hype, sondern das, was wirklich funktioniert.",
      icon: "\u{1F9E0}",
      features: [
        "ChatGPT, Claude & Co. produktiv nutzen",
        "Datenschutzkonformer KI-Einsatz im Unternehmen",
        "Automatisierung von Routineaufgaben",
        "Kosten-Nutzen-Analyse verschiedener KI-Tools"
      ],
      href: "/leistungen#ki-beratung",
      price: "50 \u20AC / Stunde"
    },
    {
      title: "Software-Entwicklung mit KI",
      description: "Vom ersten Prompt bis zum fertigen Produkt. Ich zeige Ihnen, wie KI-gestutztes Entwickeln funktioniert \u2013 auch wenn Sie kein Informatiker sind.",
      icon: "\u{1F4BB}",
      features: [
        "Einfuhrung in KI-gestutzte Entwicklung",
        "Architekturentscheidungen mit KI treffen",
        "Code-Qualitat und Testing mit KI",
        "Von der Idee zum produktionsreifen Code"
      ],
      href: "/leistungen#software-dev",
      price: "50 \u20AC / Stunde"
    },
    {
      title: "Deployment & Infrastruktur",
      description: "Kubernetes, Open-Source-Losungen, Wartung \u2013 ich bringe Ihre Software sicher in Produktion und halte sie am Laufen.",
      icon: "\u2601\uFE0F",
      features: [
        "Kubernetes-Deployment von A bis Z",
        "Open-Source-Alternativen zu teurer Software",
        "Monitoring, Wartung & Updates",
        "DSGVO-konforme Self-Hosted-Losungen"
      ],
      href: "/leistungen#deployment",
      price: "50 \u20AC / Stunde"
    }
  ];
  const faqItems = [
    {
      question: "Fur wen ist die KI-Beratung gedacht?",
      answer: "Fur alle, die KI sinnvoll nutzen wollen \u2013 ob Privatperson, Selbstandiger oder Unternehmen. Ich hole Sie dort ab, wo Sie stehen, und zeige Ihnen, was heute schon funktioniert."
    },
    {
      question: "Brauche ich Programmierkenntnisse?",
      answer: "Nein. Fur die KI-Beratung und grundlegende Automatisierung brauchen Sie null Vorkenntnisse. Fur Software-Entwicklung mit KI starten wir bei den Basics \u2013 KI ubernimmt den Grossteil der schweren Arbeit."
    },
    {
      question: "Wie lauft ein Kennenlerngesprach ab?",
      answer: "45 Minuten, 20 Euro. Wir sprechen uber Ihre Situation, ich stelle Fragen, Sie stellen Fragen. Am Ende wissen wir beide, ob eine Zusammenarbeit Sinn macht \u2013 und wenn ja, wie."
    },
    {
      question: "Warum Open Source statt Standardsoftware?",
      answer: "Weil Sie damit unabhangig bleiben: keine Vendor-Lock-ins, keine steigenden Lizenzkosten, volle Kontrolle uber Ihre Daten. Und oft ist die Open-Source-Losung auch die bessere."
    },
    {
      question: "Arbeiten Sie remote oder vor Ort?",
      answer: "Beides. Die meisten Projekte lassen sich hervorragend remote umsetzen. Fur intensivere Zusammenarbeit komme ich auch gerne nach Luneburg und Umgebung."
    }
  ];
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "KI-Beratung & Software-Architektur" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Hero", Hero, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/home/patrick/Bachelorprojekt/korczewski-website/src/components/Hero.svelte", "client:component-export": "default" })}  ${maybeRenderHead()}<section class="py-12 bg-dark-light border-b border-dark-lighter"> <div class="max-w-6xl mx-auto px-6"> <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center"> <div> <p class="text-3xl font-bold text-gold">B.Sc.</p> <p class="text-muted mt-1">IT-Sicherheit</p> </div> <div> <p class="text-3xl font-bold text-gold">10+</p> <p class="text-muted mt-1">Jahre IT-Management</p> </div> <div> <p class="text-3xl font-bold text-gold">KI</p> <p class="text-muted mt-1">Seit Tag 1 dabei</p> </div> <div> <p class="text-3xl font-bold text-gold">K8s</p> <p class="text-muted mt-1">Kubernetes & Open Source</p> </div> </div> </div> </section>  <section id="angebote" class="py-20 bg-dark"> <div class="max-w-6xl mx-auto px-6"> <div class="text-center mb-14"> <h2 class="text-3xl md:text-4xl font-bold text-light mb-4 font-serif">Was ich fur Sie tun kann</h2> <p class="text-xl text-muted max-w-2xl mx-auto">
Technologie soll Ihnen das Leben leichter machen &ndash; nicht komplizierter. Ich sorge dafur, dass es so bleibt.
</p> </div> <div class="grid grid-cols-1 md:grid-cols-3 gap-8"> ${services.map((service) => renderTemplate`${renderComponent($$result2, "ServiceCard", ServiceCard, { ...service, "client:visible": true, "client:component-hydration": "visible", "client:component-path": "/home/patrick/Bachelorprojekt/korczewski-website/src/components/ServiceCard.svelte", "client:component-export": "default" })}`)} </div> </div> </section>  <section class="py-20 bg-dark-light"> <div class="max-w-6xl mx-auto px-6"> <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"> <div> <h2 class="text-3xl md:text-4xl font-bold text-light mb-6 font-serif">Warum ich?</h2> <p class="text-xl text-muted leading-relaxed mb-8">
Ich komme nicht aus der Theorie. Ich habe jahrelang die IT von Unternehmen gemanaged, bevor ich angefangen habe, selbst zu entwickeln. Und seit GPT-3 auf dem Markt ist, habe ich jeden Tag damit verbracht, aus meiner Intuition solides Architekturwissen zu machen.
</p> <div class="space-y-5"> <div class="flex items-start gap-4"> <div class="w-10 h-10 bg-gold-dim rounded-lg flex items-center justify-center flex-shrink-0 mt-1"> <svg class="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path> </svg> </div> <div> <h3 class="text-lg font-semibold text-light">IT-Sicherheit im Blut</h3> <p class="text-muted">Bachelor in IT-Sicherheit. Ich denke Security-first, nicht als Afterthought.</p> </div> </div> <div class="flex items-start gap-4"> <div class="w-10 h-10 bg-gold-dim rounded-lg flex items-center justify-center flex-shrink-0 mt-1"> <svg class="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path> </svg> </div> <div> <h3 class="text-lg font-semibold text-light">KI-Native seit der ersten Stunde</h3> <p class="text-muted">Seit dem Launch von ChatGPT 3 arbeite ich taglich mit KI. Nicht als Spielerei &ndash; als Werkzeug.</p> </div> </div> <div class="flex items-start gap-4"> <div class="w-10 h-10 bg-gold-dim rounded-lg flex items-center justify-center flex-shrink-0 mt-1"> <svg class="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path> </svg> </div> <div> <h3 class="text-lg font-semibold text-light">Praxis schlagt Theorie</h3> <p class="text-muted">Jahre in der IT grosser und kleiner Unternehmen. Ich kenne die echten Probleme, nicht nur die Lehrbuch-Probleme.</p> </div> </div> </div> </div> <!-- Quote --> <div class="flex flex-col items-center"> <div class="bg-dark rounded-2xl p-8 border border-dark-lighter max-w-md"> <svg class="w-10 h-10 text-gold/30 mb-4" fill="currentColor" viewBox="0 0 24 24"> <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z"></path> </svg> <blockquote class="text-lg text-light leading-relaxed italic font-serif">
"Ich habe meine Vibes in Architekturwissen verwandelt &ndash; und jetzt helfe ich Ihnen, dasselbe zu tun. Nur schneller, weil ich die Sackgassen schon kenne."
</blockquote> <p class="text-muted-dark mt-4 text-sm">Patrick Korczewski</p> </div> <div class="mt-8 bg-dark rounded-2xl p-6 border border-dark-lighter max-w-md w-full"> <div class="flex items-center gap-4"> <div class="w-14 h-14 bg-gold-dim rounded-full flex items-center justify-center text-2xl"> <span class="text-gold font-bold">PK</span> </div> <div> <p class="font-semibold text-light">Patrick Korczewski</p> <p class="text-muted text-sm">Software Engineer & IT-Security-Berater</p> <p class="text-muted-dark text-sm">Luneburg</p> </div> </div> </div> </div> </div> </div> </section> ${renderComponent($$result2, "FAQ", FAQ, { "items": faqItems, "client:visible": true, "client:component-hydration": "visible", "client:component-path": "/home/patrick/Bachelorprojekt/korczewski-website/src/components/FAQ.svelte", "client:component-export": "default" })} ${renderComponent($$result2, "CallToAction", CallToAction, { "client:visible": true, "client:component-hydration": "visible", "client:component-path": "/home/patrick/Bachelorprojekt/korczewski-website/src/components/CallToAction.svelte", "client:component-export": "default" })} ` })}`;
}, "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/index.astro", void 0);

const $$file = "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
