import { describe, expect, it } from "vite-plus/test";

import { NotFound } from "~/components/not-found";
import { Pending } from "~/components/pending";
import { RouteError } from "~/components/route-error";
import { Route } from "~/routes/__root";

describe("root route chrome", () => {
  it("抽出した 404 / エラー / 読み込み中を配線する", () => {
    expect(Route.options.notFoundComponent).toBe(NotFound);
    expect(Route.options.errorComponent).toBe(RouteError);
    expect(Route.options.pendingComponent).toBe(Pending);
  });
});
