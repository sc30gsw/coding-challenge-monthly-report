import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import { confirmReport } from "~/features/reports/domain/confirmation";
import { reviewProgress } from "~/features/reports/domain/line-editing";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 確定は不可逆です。ここで通してしまうと、取り消す手段は修正版を作ることしかありません。
 * だからこそ条件を明示的に列挙し、空集合の扱いまで含めて固定します。
 * @see docs/adr/0012-confirm-preconditions.md
 */

const APPROVED = reviewProgress([{ status: "approved" }, { status: "approved" }]);
const PARTIAL = reviewProgress([{ status: "approved" }, { status: "pending" }]);
const SENT_BACK = reviewProgress([{ status: "changes_requested" }]);
const EMPTY = reviewProgress([]);

describe("確定", () => {
  it("確認中で全明細が承認済みなら確定できる", () => {
    const confirmed = confirmReport({ progress: APPROVED, status: "in_review" });

    expect(Result.isOk(confirmed)).toBe(true);
    expect(Result.isOk(confirmed) ? confirmed.value.status : null).toBe("confirmed");
  });

  it("確定した時刻が返る", () => {
    // confirmed_at は CHECK 制約で status と対応づけられているので、
    // 遷移の結果として一緒に返します。片方だけ書ける余地を残しません。
    const confirmed = confirmReport({ progress: APPROVED, status: "in_review" });

    expect(Result.isOk(confirmed) ? confirmed.value.confirmedAt : null).toBeInstanceOf(Date);
  });

  it("未承認の明細が残っていると確定できない", () => {
    const confirmed = confirmReport({ progress: PARTIAL, status: "in_review" });

    expect(Result.isError(confirmed)).toBe(true);
    expect(Result.isError(confirmed) ? confirmed.error._tag : null).toBe("LinesNotFullyApproved");
  });

  it("差し戻しが残っていると確定できない", () => {
    const confirmed = confirmReport({ progress: SENT_BACK, status: "in_review" });

    expect(Result.isError(confirmed)).toBe(true);
    expect(Result.isError(confirmed) ? confirmed.error._tag : null).toBe("LinesNotFullyApproved");
  });

  it("明細が 0 件なら確定できない", () => {
    // 「すべて承認済み」は空集合で自動的に真になります。件数を別に見ないと、
    // 中身の無い報告書が不可逆に確定します。
    const confirmed = confirmReport({ progress: EMPTY, status: "in_review" });

    expect(Result.isError(confirmed)).toBe(true);
    expect(Result.isError(confirmed) ? confirmed.error._tag : null).toBe("ReportHasNoLines");
  });

  it.each(["draft", "confirmed", "superseded"] as const satisfies ReportStatus[])(
    "%s からは確定できない",
    (status) => {
      const confirmed = confirmReport({ progress: APPROVED, status });

      expect(Result.isError(confirmed)).toBe(true);
      expect(Result.isError(confirmed) ? confirmed.error._tag : null).toBe("TransitionNotAllowed");
    },
  );

  it("状態の判定が、承認の判定より先に来る", () => {
    // 下書きで全明細が承認済みということは起こりませんが、順序を固定しておくと
    // 「なぜ押せないのか」の説明が一意になります。
    const confirmed = confirmReport({ progress: EMPTY, status: "draft" });

    expect(Result.isError(confirmed) ? confirmed.error._tag : null).toBe("TransitionNotAllowed");
  });
});
