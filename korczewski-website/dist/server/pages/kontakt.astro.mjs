import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { $ as $$Layout } from '../chunks/Layout_B46HJydu.mjs';
import { e as ensure_array_like, a as escape_html, b as attr } from '../chunks/_@astro-renderers_BD3J2jSH.mjs';
export { r as renderers } from '../chunks/_@astro-renderers_BD3J2jSH.mjs';

function ContactForm($$renderer) {
	let name = '';
	let email = '';
	let phone = '';
	let type = 'allgemein';
	let message = '';
	let submitting = false;

	const types = [
		{ value: 'allgemein', label: 'Allgemeine Anfrage' },
		{
			value: 'kennenlernen',
			label: 'Kennenlerngesprach (45 Min / 20 EUR)'
		},
		{ value: 'ki-beratung', label: 'KI-Beratung' },
		{ value: 'software-dev', label: 'Software-Entwicklung mit KI' },
		{ value: 'deployment', label: 'Deployment & Infrastruktur' },
		{ value: 'opensource', label: 'Open-Source-Losungen' }
	];

	$$renderer.push(`<form class="space-y-6"><div><label for="type" class="block text-lg font-medium text-light mb-2">Worum geht es?</label> `);

	$$renderer.select(
		{
			id: 'type',
			value: type,
			class: 'w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors'
		},
		($$renderer) => {
			$$renderer.push(`<!--[-->`);

			const each_array = ensure_array_like(types);

			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let t = each_array[$$index];

				$$renderer.option({ value: t.value }, ($$renderer) => {
					$$renderer.push(`${escape_html(t.label)}`);
				});
			}

			$$renderer.push(`<!--]-->`);
		}
	);

	$$renderer.push(`</div> <div><label for="name" class="block text-lg font-medium text-light mb-2">Ihr Name <span class="text-gold">*</span></label> <input id="name" type="text"${attr('value', name)} required="" placeholder="Max Mustermann" class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"/></div> <div><label for="email" class="block text-lg font-medium text-light mb-2">E-Mail-Adresse <span class="text-gold">*</span></label> <input id="email" type="email"${attr('value', email)} required="" placeholder="max@beispiel.de" class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"/></div> <div><label for="phone" class="block text-lg font-medium text-light mb-2">Telefon <span class="text-muted-dark">(optional)</span></label> <input id="phone" type="tel"${attr('value', phone)} placeholder="+49 ..." class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"/></div> <div><label for="message" class="block text-lg font-medium text-light mb-2">Ihre Nachricht <span class="text-gold">*</span></label> <textarea id="message" required="" rows="5" placeholder="Beschreiben Sie kurz Ihr Anliegen..." class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors resize-y">`);

	const $$body = escape_html(message);

	if ($$body) {
		$$renderer.push(`${$$body}`);
	}

	$$renderer.push(`</textarea></div> <button type="submit"${attr('disabled', submitting, true)} class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-8 py-4 rounded-full font-bold text-lg transition-colors cursor-pointer disabled:cursor-not-allowed uppercase tracking-wide">`);

	{
		$$renderer.push('<!--[-1-->');
		$$renderer.push(`Nachricht senden`);
	}

	$$renderer.push(`<!--]--></button> `);

	{
		$$renderer.push('<!--[-1-->');
	}

	$$renderer.push(`<!--]--> <p class="text-sm text-muted-dark text-center">Mit dem Absenden stimmen Sie unserer <a href="/datenschutz" class="text-gold hover:underline">Datenschutzerklarung</a> zu.</p></form>`);
}

const $$Kontakt = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Kontakt", "description": "Nehmen Sie Kontakt auf. Kennenlerngesprach: 45 Minuten, 20 Euro." }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="pt-28 pb-20 bg-dark"> <div class="max-w-5xl mx-auto px-6"> <div class="text-center mb-14"> <h1 class="text-4xl md:text-5xl font-bold text-light mb-4 font-serif">Kontakt aufnehmen</h1> <p class="text-xl text-muted max-w-2xl mx-auto">Egal ob Frage, Kennenlerngesprach oder konkretes Projekt &ndash; schreiben Sie mir. Ich antworte in der Regel innerhalb von 24 Stunden.</p> </div> <div class="grid grid-cols-1 lg:grid-cols-5 gap-12"> <div class="lg:col-span-3 bg-dark-light rounded-2xl border border-dark-lighter p-8"> ${renderComponent($$result2, "ContactForm", ContactForm, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/home/patrick/Bachelorprojekt/korczewski-website/src/components/ContactForm.svelte", "client:component-export": "default" })} </div> <div class="lg:col-span-2 space-y-8"> <div class="bg-dark-light rounded-2xl border border-dark-lighter p-8"> <h2 class="text-xl font-bold text-gold mb-6 font-serif">Direkt erreichen</h2> <div class="space-y-5"> <div class="flex items-start gap-4"> <svg class="w-6 h-6 text-gold flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> <div> <p class="font-medium text-light">E-Mail</p> <a href="mailto:info@korczewski.de" class="text-gold hover:underline text-lg">info@korczewski.de</a> </div> </div> <div class="flex items-start gap-4"> <svg class="w-6 h-6 text-gold flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> <div> <p class="font-medium text-light">Standort</p> <p class="text-muted text-lg">Luneburg</p> </div> </div> </div> </div> <div class="bg-dark-light rounded-2xl p-8 border-l-4 border-gold"> <h2 class="text-xl font-bold text-light mb-4 font-serif">Kennenlerngesprach</h2> <p class="text-muted leading-relaxed">45 Minuten, 20 Euro. Wir sprechen uber Ihre Situation, ich stelle die richtigen Fragen, und am Ende wissen wir beide, ob und wie ich Ihnen helfen kann.</p> <p class="text-gold font-semibold mt-4">Kein Verkaufsgesprach. Nur Klarheit.</p> </div> <div class="bg-dark-light rounded-2xl p-8 border border-dark-lighter"> <h2 class="text-xl font-bold text-light mb-4 font-serif">Wie geht es weiter?</h2> <ol class="space-y-3 text-muted"> <li class="flex gap-3"> <span class="text-gold font-bold">1.</span> <span>Sie schreiben mir uber das Formular oder per E-Mail</span> </li> <li class="flex gap-3"> <span class="text-gold font-bold">2.</span> <span>Ich melde mich innerhalb von 24 Stunden</span> </li> <li class="flex gap-3"> <span class="text-gold font-bold">3.</span> <span>Wir vereinbaren ein Kennenlerngesprach</span> </li> <li class="flex gap-3"> <span class="text-gold font-bold">4.</span> <span>Danach entscheiden Sie, ob wir zusammenarbeiten</span> </li> </ol> </div> </div> </div> </div> </section> ` })}`;
}, "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/kontakt.astro", void 0);

const $$file = "/home/patrick/Bachelorprojekt/korczewski-website/src/pages/kontakt.astro";
const $$url = "/kontakt";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Kontakt,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
