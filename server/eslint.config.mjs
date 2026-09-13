// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

// flat config, eslint 10. no type-aware linting on purpose, it keeps lint fast
// and free of tsconfig `project` wiring. `npm run typecheck` covers the types
export default defineConfig([
  // never lint build output or the generated prisma client
  globalIgnores(["dist", "src/generated"]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // use the winston logger, not console. the handful of deliberate boot-time
      // console calls, from before the logger exists, carry their own disable lines
      "no-console": "warn",
      // anything prefixed with an underscore is unused on purpose, that's the
      // convention here: `_req`, `_file`, `_error`
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // turn off whatever conflicts with prettier. has to be last
  eslintConfigPrettier,
]);
