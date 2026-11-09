import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./lib/index.ts"],
  tsconfig: "./tsconfig.lib.json",
  format: ["esm"],
  platform: "neutral",
  exports: true,
  dts: true,
  publint: true,
  attw: true,
});
