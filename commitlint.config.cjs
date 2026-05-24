module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // dev-flow commits append ticket refs like [T000235,T000236,T000237] which
    // can push a descriptive subject past the default 100-char limit.
    'header-max-length': [2, 'always', 150],
  },
};
