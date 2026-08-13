import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { RouteError } from "~/components/route-error";

describe("RouteError", () => {
  it("エラー見出しと message を出す", () => {
    const html = renderToString(<RouteError error={new Error("boom")} reset={() => undefined} />);
    expect(html).toContain("エラー");
    expect(html).toContain("boom");
  });
});
