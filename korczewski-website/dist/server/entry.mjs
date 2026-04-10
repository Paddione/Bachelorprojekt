import { r as renderers } from './chunks/_@astro-renderers_BD3J2jSH.mjs';
import { c as createExports, s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_CFaab0UK.mjs';
import { manifest } from './manifest_BXh8meS-.mjs';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/api/contact.astro.mjs');
const _page2 = () => import('./pages/datenschutz.astro.mjs');
const _page3 = () => import('./pages/impressum.astro.mjs');
const _page4 = () => import('./pages/kontakt.astro.mjs');
const _page5 = () => import('./pages/leistungen.astro.mjs');
const _page6 = () => import('./pages/ueber-mich.astro.mjs');
const _page7 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/node.js", _page0],
    ["src/pages/api/contact.ts", _page1],
    ["src/pages/datenschutz.astro", _page2],
    ["src/pages/impressum.astro", _page3],
    ["src/pages/kontakt.astro", _page4],
    ["src/pages/leistungen.astro", _page5],
    ["src/pages/ueber-mich.astro", _page6],
    ["src/pages/index.astro", _page7]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./noop-entrypoint.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "mode": "standalone",
    "client": "file:///home/patrick/Bachelorprojekt/korczewski-website/dist/client/",
    "server": "file:///home/patrick/Bachelorprojekt/korczewski-website/dist/server/",
    "host": true,
    "port": 4322,
    "assets": "_astro",
    "experimentalStaticHeaders": false
};
const _exports = createExports(_manifest, _args);
const handler = _exports['handler'];
const startServer = _exports['startServer'];
const options = _exports['options'];
const _start = 'start';
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) {
	serverEntrypointModule[_start](_manifest, _args);
}

export { handler, options, pageMap, startServer };
