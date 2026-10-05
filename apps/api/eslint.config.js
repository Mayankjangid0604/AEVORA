// ESLint flat config (eslint 8.57+). Run: npm run lint
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '**/*.js'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
      // Lazy require() of optional/untyped modules (imap, mailparser, …) is deliberate.
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
);
