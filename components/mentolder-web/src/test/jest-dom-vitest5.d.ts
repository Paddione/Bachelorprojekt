// jest-dom 7 types augment vitest's single-parameter Assertion<T>, but vitest 5
// widened it to Assertion<R, T>, so that augmentation no longer merges and the
// jest-dom matchers stay untyped. Re-apply them for the vitest 5 shape until
// @testing-library/jest-dom ships vitest 5 support. Runtime is unaffected:
// setup.tsx already registers the matchers.
import type * as JestDomStandalone from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Assertion<R, T> extends JestDomStandalone.TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining
    extends JestDomStandalone.TestingLibraryMatchers<any, any> {}
}
