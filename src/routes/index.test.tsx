import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { Home } from "~/routes/index";

describe("Home", () => {
  it("初期表示は Hello World と Toggle", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("Hello World!");
    expect(html).toContain("Toggle");
    expect(html).toContain("text-red-500");
  });
});
