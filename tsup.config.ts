import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
  format: ["cjs", "esm"],
  entry: ["./lib/index.ts"],
  tsconfig: "./tsconfig.lib.json",
  dts: true,
  shims: true,
  skipNodeModulesBundle: true,
  clean: true,
  minify: false,
  sourcemap: true,
  external: [
    "@tiptap/*",
    ...Object.keys(pkg.peerDependencies),
  ],
});
