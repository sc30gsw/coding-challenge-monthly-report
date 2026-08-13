import { createRequire } from "node:module";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { RECOMMENDED_RULES, TANSTACK_START_RULES } from "oxlint-plugin-react-doctor";
import { defineConfig } from "vite-plus";

// libReplacement has no import; this require is the link unused-dep scanners can see.
const betterTypescriptLib: unknown = createRequire(import.meta.url)(
  "better-typescript-lib/package.json",
);

if (
  typeof betterTypescriptLib !== "object" ||
  betterTypescriptLib === null ||
  !("name" in betterTypescriptLib) ||
  betterTypescriptLib.name !== "better-typescript-lib"
) {
  throw new Error("tsconfig libReplacement requires better-typescript-lib");
}

type JsonParseIsAny = 0 extends 1 & ReturnType<typeof JSON.parse> ? true : false;
const jsonParseIsNotAny: JsonParseIsAny extends true ? never : true = true;
void jsonParseIsNotAny;

const reactDoctorRules = {
  ...RECOMMENDED_RULES,
  ...TANSTACK_START_RULES,
};

const vendoredPaths = [
  // Synced from upstream and hash-pinned in skills-lock.json — formatting them
  // rewrites third-party files and invalidates the lock.
  ".agents/**",
  ".claude/skills/**",
];

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/routeTree.gen.ts", ...vendoredPaths],
    sortImports: {
      partitionByComment: true,
    },
    sortPackageJson: {
      sortScripts: true,
    },
    sortTailwindcss: {
      functions: ["cn"],
    },
  },
  lint: {
    categories: {
      correctness: "error",
    },
    env: {
      browser: true,
      node: true,
    },
    ignorePatterns: ["**/routeTree.gen.ts", ...vendoredPaths],
    jsPlugins: [{ name: "react-doctor", specifier: "oxlint-plugin-react-doctor" }],
    options: {
      denyWarnings: true,
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ["src/router.tsx", "*.config.ts"],
        rules: {
          "no-default-export": "off",
        },
      },
      {
        files: ["src/routes/**"],
        rules: {
          "react-doctor/no-multi-comp": "off",
          "react-doctor/only-export-components": "off",
        },
      },
    ],
    plugins: ["react", "react-perf", "import", "jsx-a11y", "promise"],
    rules: {
      ...reactDoctorRules,
      "no-default-export": "error",
    },
  },
  staged: {
    "*.{js,jsx,ts,tsx,json,css}": "vp check --fix",
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // react's vite plugin must come after start's vite plugin
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    // `~/*` → `src/*` comes from compilerOptions.paths in tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    // API integration は 1 つのテスト用データベースを共有します。並列に走らせると
    // テスト間で truncate が衝突するため、ファイル単位の並列実行を止めます。
    fileParallelism: false,
  },
});
