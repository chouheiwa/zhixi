import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, "src/dashboard/index.html"),
      },
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
  },
});
