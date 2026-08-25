import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyConfigDefaults, loadConfig } from "../src/config.js";

async function makeConfigDir(body: string | null): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "logscope-cfg-"));
  if (body !== null) await writeFile(join(dir, ".logscoperc"), body);
  return dir;
}

describe("loadConfig", () => {
  test("missing files → empty config", async () => {
    const dir = await makeConfigDir(null);
    expect(loadConfig(dir, join(dir, "home"))).toEqual({});
    await rm(dir, { recursive: true });
  });

  test("reads known keys from cwd", async () => {
    const dir = await makeConfigDir(JSON.stringify({ level: "error", top: "5", junk: 42 }));
    const config = loadConfig(dir);
    expect(config.level).toBe("error");
    expect(config.top).toBe("5");
    // Non-string/unknown keys dropped
    expect((config as Record<string, unknown>).junk).toBeUndefined();
    await rm(dir, { recursive: true });
  });

  test("cwd wins over home", async () => {
    const home = await makeConfigDir(JSON.stringify({ level: "debug", grep: "home" }));
    const cwd = await makeConfigDir(JSON.stringify({ level: "error" }));
    const config = loadConfig(cwd, home);
    expect(config.level).toBe("error");
    expect(config.grep).toBe("home");
    await rm(home, { recursive: true });
    await rm(cwd, { recursive: true });
  });

  test("malformed JSON → hard error", async () => {
    const dir = await makeConfigDir("{ nope");
    try {
      loadConfig(dir);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toMatch(/not valid JSON/);
    }
    await rm(dir, { recursive: true });
  });
});

describe("applyConfigDefaults", () => {
  test("explicit flags beat config values", () => {
    const merged = applyConfigDefaults<{ level?: string; top?: string }>(
      { level: "warn" },
      { level: "error", top: "3" },
    );
    expect(merged).toEqual({ level: "warn", top: "3" });
  });
});
