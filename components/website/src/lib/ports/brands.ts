// Ports facade — brand configs for scripts/build-route-manifest.mjs.
// Re-export only, no behavior change. Both brands are re-exported neutrally;
// brand separation lives in the configs and their consumers, which are
// untouched (see plan p4 brand-trennung caveat). Kept as a SEPARATE light
// module (not via index.ts) so the tsx --eval snippet does not drag the
// auth/db import chain.
export { mentolderConfig } from '../../config/brands/mentolder';
export { korczewskiConfig } from '../../config/brands/korczewski';
