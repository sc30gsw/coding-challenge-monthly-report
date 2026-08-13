import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { Pending } from "~/components/pending";

describe("Pending", () => {
  it("読み込み中の案内を出す", () => {
    const html = renderToString(<Pending />);
    expect(html).toContain("読み込み中...");
    expect(html).toContain("<output");
  });
});
