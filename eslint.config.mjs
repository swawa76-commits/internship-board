import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Treat `_`-prefixed identifiers as intentionally unused. The
    // S3StorageAdapter skeleton and test-only fake adapters declare
    // method/parameter signatures they don't yet use; the underscore
    // prefix is the convention.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
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
