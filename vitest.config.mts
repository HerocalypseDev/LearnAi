import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `server-only` throws outside the Next.js server; tests that load server modules (e.g. the Jarvis tool
// list) swap it for an empty stub. Nothing here connects to a database.
export default defineConfig({
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)) },
  },
});
