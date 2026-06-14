import { defineConfig } from "vitest/config";

// SR2E rules unit tests run in plain Node (no Foundry runtime). The shim in
// test/foundry-shim.mjs provides the few globals the dice engine touches
// (Roll, game.settings); pure rules helpers in module/rules/ need nothing.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.mjs"],
    setupFiles: ["test/foundry-shim.mjs"]
  }
});
