import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/index.ts", import.meta.url));

async function withFixture(run: (cwd: string, home: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "logscope-brief-"));
  const home = join(cwd, "home");
  try {
    await mkdir(home);
    const lines = Array.from({ length: 100 }, (_, i) => JSON.stringify({
      level: i < 5 ? "error" : "info", message: "event",
    }));
    await writeFile(join(cwd, "app.log"), lines.join("\n"));
    await run(cwd, home);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function brief(cwd: string, home: string, flags: string[] = []) {
  const result = Bun.spawnSync([process.execPath, cli, "brief", "app.log", ...flags], {
    cwd,
    env: { ...process.env, HOME: home, NO_COLOR: "1" },
  });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

describe("brief CLI severity", () => {
  test("defaults and flag overrides reach JSON, text, and Markdown", async () => {
    await withFixture(async (cwd, home) => {
      const defaults = brief(cwd, home, ["--json"]);
      expect(defaults.code).toBe(0);
      expect(JSON.parse(defaults.out).severity).toBe("elevated");
      const flags = ["--severity-critical", "0.04", "--severity-elevated", "0.01"];
      for (const format of ["--json", "--markdown", "text"]) {
        const result = brief(cwd, home, [...flags, ...(format === "text" ? [] : [format])]);
        expect(result.code).toBe(0);
        if (format === "--json") expect(JSON.parse(result.out).severity).toBe("critical");
        else expect(result.out).toContain("CRITICAL");
      }
    });
  });

  test("home config, cwd precedence, and individual CLI overrides", async () => {
    await withFixture(async (cwd, home) => {
      await writeFile(join(home, ".logscoperc"), JSON.stringify({ severity: { critical: 0.04, elevated: 0.01 } }));
      expect(JSON.parse(brief(cwd, home, ["--json"]).out).severity).toBe("critical");
      await writeFile(join(cwd, ".logscoperc"), JSON.stringify({ severity: { critical: 0.2, elevated: 0.06 } }));
      expect(JSON.parse(brief(cwd, home, ["--json"]).out).severity).toBe("ok");
      const override = brief(cwd, home, ["--json", "--severity-elevated", "0.03"]);
      expect(override.code).toBe(0);
      expect(JSON.parse(override.out).severity).toBe("elevated");
      // Critical alone must retain the configured elevated cutoff (0.06).
      const invalid = brief(cwd, home, ["--json", "--severity-critical", "0.04"]);
      expect(invalid.code).toBe(1);
      expect(invalid.err).toContain("must be greater than elevated");
      expect(invalid.out).toBe("");
    });
  });

  test("partial config falls back to built-in cutoffs", async () => {
    await withFixture(async (cwd, home) => {
      await writeFile(join(cwd, ".logscoperc"), JSON.stringify({ severity: { critical: 0.04 } }));
      const result = brief(cwd, home, ["--json"]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out).severity).toBe("critical");
    });
  });

  test("invalid flags and configured ranges fail without a report", async () => {
    await withFixture(async (cwd, home) => {
      for (const value of ["0", "1", "-0.1", "NaN", "Infinity", "0.1oops", ""]) {
        const result = brief(cwd, home, ["--json", "--severity-critical", value]);
        expect(result.code).toBe(1);
        expect(result.err).toContain("severity.critical");
        expect(result.out).toBe("");
      }
      await writeFile(join(cwd, ".logscoperc"), JSON.stringify({ severity: { elevated: -0.1 } }));
      const result = brief(cwd, home, ["--json"]);
      expect(result.code).toBe(1);
      expect(result.err).toContain("severity.elevated");
      expect(result.out).toBe("");
    });
  });
});
