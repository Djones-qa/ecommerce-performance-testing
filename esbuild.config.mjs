/**
 * esbuild bundler for k6 TypeScript scripts.
 *
 * k6 has its own JS runtime — it cannot resolve Node-style TypeScript
 * module paths at runtime. We pre-bundle each scenario into a single
 * self-contained JS file so k6 can run them without a module resolver.
 *
 * Output: dist/k6/<scenario>.js
 */

import { build } from "esbuild";
import { glob } from "glob";
import path from "path";

const scenarios = await glob("src/k6/scenarios/*.ts");

await Promise.all(
  scenarios.map((entry) => {
    const name = path.basename(entry, ".ts");
    return build({
      entryPoints: [entry],
      outfile: `dist/k6/${name}.js`,
      bundle: true,
      platform: "neutral",   // k6 is neither node nor browser
      format: "esm",
      target: "es2020",
      external: [
        // k6 built-ins — must not be bundled
        "k6",
        "k6/*",
      ],
      sourcemap: false,
      minify: false,
      logLevel: "info",
    });
  })
);

console.log("✅ k6 scripts bundled to dist/k6/");
