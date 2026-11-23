import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await build({
  absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  entryPoints: {
    fulfillment: "src/features/fulfillment/workbench.js",
    learning: "src/features/learning/workbench.js",
  },
  outdir: "assets/workbenches",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  charset: "utf8",
  logLevel: "info",
});
