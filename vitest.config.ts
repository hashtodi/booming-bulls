import { defineConfig } from "vitest/config";

// Vitest runs ONLY pure unit tests under src (currently the Telegram webhook
// parser). It never touches Next, the build, or runtime — it's dev-only.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
