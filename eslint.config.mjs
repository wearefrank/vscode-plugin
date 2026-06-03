import globals from "globals";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

export default [
    {
        ignores: [
            ".vscode-test/**",
            "out/**",
            "dist/**",
            "node_modules/**",
            "test-workspace/**",
            "src/flow/webview/**"
        ],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.node,
                ...globals.mocha,
                ...globals.browser,
                acquireVsCodeApi: "readonly",
                svgPanZoom: "readonly",
                container: "readonly",
                safeUserSnippets: "readonly",
                category: "readonly"
            },

            ecmaVersion: 2022,
            sourceType: "module",
        },

        rules: {
            "no-const-assign": "warn",
            "no-this-before-super": "warn",
            "no-undef": "warn",
            "no-unreachable": "warn",
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "constructor-super": "warn",
            "valid-typeof": "warn",
        },
    },
    {
        files: ["**/*.ts"],
        plugins: {
            "@typescript-eslint": typescriptEslint,
        },
        languageOptions: {
            parser: typescriptParser,
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...typescriptEslint.configs.recommended.rules,
            "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "@typescript-eslint/no-explicit-any": "warn",
        },
    }
];