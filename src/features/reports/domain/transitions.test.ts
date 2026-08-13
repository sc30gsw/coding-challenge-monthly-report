import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import { requestReview } from "~/features/reports/domain/transitions";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 遷移そのものは純粋関数なので、DB もサーバーも要りません。
 * 状態 × 操作の組み合わせを網羅するのはこの層の役目です。
 * DB 制約でしか守れない保証（確定後の不変性）は API integration が受け持ちます。
 */

describe("確認依頼", () => {
  it("下書きから確認中へ進める", () => {
    const moved = requestReview({ status: "draft" });

    expect(Result.isOk(moved)).toBe(true);
    expect(Result.isOk(moved) ? moved.value.status : null).toBe("in_review");
  });

  it.each(["in_review", "confirmed", "superseded"] as const satisfies ReportStatus[])(
    "%s からは確認依頼できない",
    (status) => {
      const moved = requestReview({ status });

      expect(Result.isError(moved)).toBe(true);
    },
  );

  it("拒否の理由に、どの状態から何をしようとしたかが載る", () => {
    const moved = requestReview({ status: "confirmed" });

    if (!Result.isError(moved)) {
      throw new Error("expected the transition to be refused");
    }

    expect(moved.error._tag).toBe("TransitionNotAllowed");
    expect(moved.error.from).toBe("confirmed");
    expect(moved.error.to).toBe("in_review");
  });
});
