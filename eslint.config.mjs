import { defineConfig, globalIgnores } from "eslint/config";
import vitals from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

export default defineConfig([
    ...vitals,
    ...ts,
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
        },
    },
    globalIgnores([".next/**", ".claude/**", "out/**", "next-env.d.ts"]),
]);
