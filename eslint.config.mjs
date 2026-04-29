import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Tests pragmatically use `as any` to construct partial fixtures for
    // framework callbacks (Auth.js, etc.) without rebuilding the whole
    // runtime context. App code keeps the strict rule.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/db/generated/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
