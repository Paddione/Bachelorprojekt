// esbuild plugin: TS-strip preprocess + Svelte 5 compile (client, injected CSS).
import { readFile } from 'node:fs/promises';
import { preprocess, compile } from 'svelte/compiler';
import esbuild from 'esbuild';

export function sveltePlugin() {
  return {
    name: 'svelte-mini',
    setup(build) {
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8');
        const processed = await preprocess(
          source,
          {
            script: async ({ content, attributes }) => {
              if (attributes.lang === 'ts' || attributes.lang === 'typescript') {
                // verbatimModuleSyntax:true → never elide value imports. The
                // script is preprocessed in ISOLATION (no markup), so esbuild
                // would otherwise drop imports used only in the template
                // (e.g. `t`, child components) → "X is not defined" at runtime.
                const r = await esbuild.transform(content, {
                  loader: 'ts',
                  tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
                });
                return { code: r.code };
              }
              return undefined;
            },
          },
          { filename: args.path },
        );
        const { js, warnings } = compile(processed.code, {
          filename: args.path,
          generate: 'client',
          css: 'injected',
          dev: false,
        });
        const warn = (warnings || [])
          .filter((w) => !/a11y|unused/i.test(w.code || ''))
          .map((w) => `${w.code}: ${w.message}`);
        return {
          contents: js.code,
          loader: 'js',
          resolveDir: args.path.replace(/[^/]+$/, ''),
          warnings: warn.map((text) => ({ text })),
        };
      });
    },
  };
}
