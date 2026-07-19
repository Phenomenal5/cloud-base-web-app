// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

// Flat config (ESLint 10). Type-aware linting is intentionally NOT enabled to
// keep lint fast and independent of tsconfig `project` wiring — `npm run
// typecheck` (tsc) covers type correctness.
export default defineConfig([
  // Build output and the generated Prisma client are never linted.
  globalIgnores(["dist", "src/generated"]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Use the Winston logger, not console. The few intentional boot-time
      // console calls (before the logger is up) carry their own disable comments.
      "no-console": "warn",
      // Underscore-prefixed args/vars/catch bindings are intentionally unused
      // (house convention: `_req`, `_file`, `_error`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Turn off rules that conflict with Prettier — must be last.
  eslintConfigPrettier,
]);
