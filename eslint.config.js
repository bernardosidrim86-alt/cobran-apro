import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["api/**/*.js", "src/**/*.js", "src/**/*.jsx", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-constant-binary-expression": "error",
    },
  },
];
