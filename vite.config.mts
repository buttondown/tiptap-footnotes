import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // dist/ is the library's build output
    outDir: "dist-demo",
  },
});
