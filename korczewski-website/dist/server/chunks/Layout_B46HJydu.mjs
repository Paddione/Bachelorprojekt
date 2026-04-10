import { e as createComponent, g as addAttribute, l as renderHead, k as renderComponent, n as renderSlot, r as renderTemplate, h as createAstro } from './astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { c as attr_class, s as stringify } from './_@astro-renderers_BD3J2jSH.mjs';
/* empty css                               */

function Navigation($$renderer) {
	let scrolled = false;

	if (typeof window !== 'undefined') {
		window.addEventListener('scroll', () => {
			scrolled = window.scrollY > 20;
		});
	}

	$$renderer.push(`<nav${attr_class(`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${stringify(scrolled
		? 'bg-dark/95 backdrop-blur-sm shadow-lg shadow-black/20'
		: 'bg-dark')}`)}><div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between"><a href="/" class="text-xl font-bold text-light hover:text-gold transition-colors font-serif">korczewski.de</a> <div class="hidden md:flex items-center gap-8"><a href="/leistungen" class="text-muted hover:text-gold font-medium transition-colors">Leistungen</a> <a href="/ueber-mich" class="text-muted hover:text-gold font-medium transition-colors">Über mich</a> <a href="/kontakt" class="bg-gold hover:bg-gold-light text-dark px-5 py-2.5 rounded-full font-bold transition-colors text-base uppercase tracking-wide text-sm">Kontakt</a></div> <button class="md:hidden p-2 text-muted" aria-label="Menu"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">`);

	{
		$$renderer.push('<!--[-1-->');
		$$renderer.push(`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>`);
	}

	$$renderer.push(`<!--]--></svg></button></div> `);

	{
		$$renderer.push('<!--[-1-->');
	}

	$$renderer.push(`<!--]--></nav>`);
}

const $$Astro = createAstro();
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Layout;
  const { title, description = "KI-Beratung, Software-Architektur & Open-Source-Deployment - Patrick Korczewski" } = Astro2.props;
  return renderTemplate`<html lang="de"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description"${addAttribute(description, "content")}><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@400;700&display=swap" rel="stylesheet"><title>${title} | Korczewski</title>${renderHead()}</head> <body class="min-h-screen flex flex-col bg-dark text-light"> ${renderComponent($$result, "Navigation", Navigation, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/home/patrick/Bachelorprojekt/korczewski-website/src/components/Navigation.svelte", "client:component-export": "default" })} <main class="flex-1"> ${renderSlot($$result, $$slots["default"])} </main> <footer class="bg-dark border-t border-dark-lighter py-12"> <div class="max-w-6xl mx-auto px-6"> <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8"> <div> <h3 class="text-lg font-semibold text-gold mb-4">Kontakt</h3> <p class="text-muted mb-2">$${CONTACT_EMAIL}</p> <p class="text-muted">$${CONTACT_CITY}</p> </div> <div> <h3 class="text-lg font-semibold text-gold mb-4">Leistungen</h3> <ul class="space-y-2 text-muted"> <li><a href="/leistungen#ki-beratung" class="hover:text-gold transition-colors">KI-Beratung</a></li> <li><a href="/leistungen#software-dev" class="hover:text-gold transition-colors">Software-Entwicklung</a></li> <li><a href="/leistungen#deployment" class="hover:text-gold transition-colors">Deployment & Infrastruktur</a></li> </ul> </div> <div> <h3 class="text-lg font-semibold text-gold mb-4">Rechtliches</h3> <ul class="space-y-2 text-muted"> <li><a href="/impressum" class="hover:text-gold transition-colors">Impressum</a></li> <li><a href="/datenschutz" class="hover:text-gold transition-colors">Datenschutz</a></li> </ul> </div> </div> <div class="border-t border-dark-lighter pt-8 text-center text-muted-dark text-sm"> <p>&copy; ${(/* @__PURE__ */ new Date()).getFullYear()} Korczewski - Alle Rechte vorbehalten</p> </div> </div> </footer> </body></html>`;
}, "/home/patrick/Bachelorprojekt/korczewski-website/src/layouts/Layout.astro", void 0);

export { $$Layout as $ };
