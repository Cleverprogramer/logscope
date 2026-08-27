import { describe, expect, test } from "bun:test";

describe("quickstart fixture", () => {
  test("root sample.log stays aligned with samples/sample.log", async () => {
    const [root, nested] = await Promise.all([
      Bun.file("sample.log").text(),
      Bun.file("samples/sample.log").text(),
    ]);
    expect(root).toBe(nested);
    expect(root.split("\n").filter(Boolean)).toHaveLength(12);
    expect(root).toContain("Payment failed");
    expect(root).toContain("1240ms");
    expect(root).toContain("this line is complete garbage");
  });
});
