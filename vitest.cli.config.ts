import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@cli": path.resolve(__dirname, "./cli"),
    },
  },
  test: {
    name: "cli",
    environment: "node",
    include: ["cli/**/*.test.ts", "cli/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./cli/test-helpers/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["cli/lib/**/*.ts"],
      exclude: [
        "cli/lib/text-chunker.ts",
        "cli/lib/**/*.test-utils.ts",
        "cli/**/*.test.ts",
        "cli/**/*.integration.test.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 70,
        statements: 90,
      },
    },
  },
})
