import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
  format: ["cjs", "esm"],
  entry: ["./src/index.ts"],
  dts: true,
  shims: true,
  skipNodeModulesBundle: true,
  clean: true,
  minify: false,
  sourcemap: true,
  external: [
    "@tiptap/*",
    ...Object.keys(pkg.dependencies),
    ...Object.keys(pkg.peerDependencies),
  ],
});
