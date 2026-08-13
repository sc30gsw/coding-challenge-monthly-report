import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { NotFound } from "~/components/not-found";

describe("NotFound", () => {
  it("404 の見出しと案内を出す", () => {
    const html = renderToString(<NotFound />);
    expect(html).toContain("404");
    expect(html).toContain("ページが見つかりませんでした。");
  });
});
