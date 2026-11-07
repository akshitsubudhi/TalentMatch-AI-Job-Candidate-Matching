// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**", "apps/web/next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "off",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/test/**", "**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
