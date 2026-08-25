import { describe, expect, test } from "bun:test";

describe("stdin source", () => {
  const SAMPLE = "2024-01-15 10:30:45 ERROR boom\n2024-01-15 10:30:46 INFO ok\n";

  test("readLogFile('-') parses piped input", () => {
    const script = `
      const { readLogFile } = await import(${JSON.stringify(import.meta.dir + "/../src/reader.js")});
      const r = await readLogFile("-");
      console.log(JSON.stringify({ total: r.totalLines, levels: r.entries.map((e) => e.level) }));
    `;
    const proc = Bun.spawnSync(["sh", "-c", `printf '%s' '${SAMPLE}' | bun -e '${script.replace(/'/g, `'\\''`)}'`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(proc.exitCode).toBe(0);
    const out = proc.stdout.toString();
    const json = JSON.parse(out.slice(out.indexOf("{")));
    expect(json.total).toBe(2);
    expect(json.levels).toEqual(["ERROR", "INFO"]);
  });

  test("CLI end-to-end: echo | logscope read -", () => {
    const proc = Bun.spawnSync(
      ["sh", "-c", "echo '2024-01-15 10:30:45 ERROR Payment failed' | bun run packages/cli/src/index.ts read -"],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("Payment failed");
  });
});
