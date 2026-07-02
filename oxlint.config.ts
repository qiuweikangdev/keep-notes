export default {
  plugins: ["typescript", "unicorn", "oxc"],
  categories: {
    correctness: "warn",
    suspicious: "warn",
  },
  rules: {
    "eslint/no-extra-boolean-cast": "warn",
    "eslint/no-self-assign": "warn",
    "eslint/no-unused-expressions": "warn",
    "eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "typescript/no-explicit-any": "warn",
    "unicorn/no-new-array": "warn",
  },
  env: {
    builtin: true,
    browser: true,
    node: true,
  },
  ignorePatterns: [
    ".agents/**",
    ".superpowers/**",
    ".worktrees/**",
    "build/**",
    "dist/**",
    "docs/**",
    "images/**",
    "node_modules/**",
    "out/**",
    "resources/**",
  ],
};
