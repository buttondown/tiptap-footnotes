import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./lib/index.ts"],
  tsconfig: "./tsconfig.lib.json",
  format: ["esm", "cjs"],
  platform: "neutral",
  fixedExtension: true,
  dts: true,
  sourcemap: true,
  exports: true,
  publint: true,
  attw: true,
});
