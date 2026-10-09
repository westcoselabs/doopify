import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // JavaScript pages are not covered by tsc; catch removed bindings before SSR.
  { files: ["src/**/*.{js,jsx}"], rules: { "no-undef": "error" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test artifacts:
    "coverage/**",
    "test-results/**",
    "test-result/**",
    "graphify-out/**",
    ".claude/**",
    ".build-check/**",
  ]),
]);

export default eslintConfig;
