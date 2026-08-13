import libPackage from "better-typescript-lib/package.json" with { type: "json" };
import { describe, expect, it } from "vite-plus/test";

describe("better-typescript-lib", () => {
  it("libReplacement が解決できるパッケージを入れる", () => {
    expect(libPackage.name).toBe("better-typescript-lib");
  });
});
