/**
 * Build script: compiles logscope into a standalone binary.
 *
 * `bun build --compile` alone chokes on ink's optional React DevTools
 * integration (it's resolved at runtime via import.meta.resolve and never
 * used in production), so we stub those modules out at bundle time.
 */
import type { BunPlugin } from "bun";

const stubReactDevTools: BunPlugin = {
  name: "stub-react-devtools",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core-stub",
      namespace: "logscope-stub",
    }));
    build.onLoad(
      { filter: /^react-devtools-core-stub$/, namespace: "logscope-stub" },
      () => ({
        contents: "export default { initialize() {}, connectToDevTools() {} };",
        loader: "js",
      }),
    );
  },
};

process.env.NODE_ENV = "production";

// Step 1: bundle (with the devtools stub) into a single JS file.
const bundled = await Bun.build({
  entrypoints: ["./src/index.ts"],
  target: "bun",
  minify: true,
  plugins: [stubReactDevTools],
});

for (const log of bundled.logs) console.error(String(log));
if (!bundled.success || bundled.outputs.length !== 1) process.exit(1);

// Step 2: compile that self-contained file into a standalone binary.
await Bun.write("./dist/bundle.js", bundled.outputs[0]!);
const proc = Bun.spawnSync(
  ["bun", "build", "--compile", "./dist/bundle.js", "--outfile", "./dist/logscope"],
  { stdout: "inherit", stderr: "inherit" },
);
await import("node:fs").then((fs) => fs.rmSync("./dist/bundle.js", { force: true }));
if (proc.exitCode !== 0) {
  console.error("compile step failed");
  process.exit(proc.exitCode ?? 1);
}
console.log("built dist/logscope");
